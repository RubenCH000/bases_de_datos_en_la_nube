// Pruebas M08: la paginación por cursor recorre todos los eventos de un
// dispositivo sin repetir ni saltarse ninguno, mantiene el rango aunque lleguen
// eventos nuevos y rechaza cursores inválidos antes de consultar.
// Usa un cliente DynamoDB en memoria para no depender del contenedor.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const {
    DISPOSITIVOS_M08,
    EVENTOS_POR_DISPOSITIVO,
    TIMESTAMP_BASE,
    fixturesM08,
    crearEventoPosteriorM08,
} = require('../src/db/cdrlFixturesM08');
const {
    LIMITE_PREDETERMINADO,
    LIMITE_MAXIMO,
    CursorInvalidoError,
    codificarCursor,
    decodificarCursor,
    consultarPorDispositivoPaginado,
} = require('../src/db/paginacionEventos');

// Simula el Query sobre gsi_device_timestamp: filtra por device_id y rango de
// timestamp, ordena ascendente, respeta ExclusiveStartKey y, como DynamoDB,
// regresa LastEvaluatedKey cada vez que se llena el Limit.
function crearClienteMemoria(documentos) {
    const tabla = documentos.map((doc) => structuredClone(doc));
    const consultas = [];

    function ordenar(a, b) {
        return a.timestamp - b.timestamp || a.event_id.localeCompare(b.event_id);
    }

    return {
        tabla,
        consultas,
        async send(comando) {
            const nombre = comando.constructor.name;
            const entrada = comando.input;

            if (nombre !== 'QueryCommand') {
                throw new Error(`comando no soportado en la prueba: ${nombre}`);
            }

            consultas.push(structuredClone(entrada));

            const valores = entrada.ExpressionAttributeValues;
            let candidatos = tabla
                .filter((doc) => doc.device_id === valores[':device']
                    && doc.timestamp >= valores[':desde']
                    && doc.timestamp <= valores[':hasta'])
                .sort(ordenar);

            if (entrada.ExclusiveStartKey) {
                const inicio = entrada.ExclusiveStartKey;
                candidatos = candidatos.filter((doc) => ordenar(doc, inicio) > 0);
            }

            const pagina = candidatos.slice(0, entrada.Limit);
            const ultimo = pagina[pagina.length - 1];
            const respuesta = { Items: pagina.map((doc) => structuredClone(doc)) };

            if (pagina.length === entrada.Limit) {
                respuesta.LastEvaluatedKey = {
                    event_id: ultimo.event_id,
                    device_id: ultimo.device_id,
                    timestamp: ultimo.timestamp,
                };
            }

            return respuesta;
        },
    };
}

async function recorrerTodo(cliente, deviceId, opciones = {}) {
    const paginas = [];
    let cursor = null;

    do {
        const pagina = await consultarPorDispositivoPaginado(deviceId, {
            ...opciones,
            cursor,
            clienteDynamo: cliente,
        });
        paginas.push(pagina);
        cursor = pagina.siguiente_cursor;
    } while (cursor !== null);

    return paginas;
}

const dispositivo = DISPOSITIVOS_M08[0];
const esperados = fixturesM08
    .filter((evento) => evento.device_id === dispositivo)
    .map((evento) => evento.event_id);

describe('M08 - Paginación estable de eventos', () => {
    test('1. Caso normal: recorre los 120 eventos del dispositivo en páginas de 25 sin repetir ni saltar', async () => {
        const cliente = crearClienteMemoria(fixturesM08);
        const paginas = await recorrerTodo(cliente, dispositivo);

        assert.deepEqual(
            paginas.map((pagina) => pagina.cantidad),
            [25, 25, 25, 25, 20],
        );
        assert.ok(paginas.every((pagina) => pagina.limite === LIMITE_PREDETERMINADO));
        assert.equal(paginas.at(-1).siguiente_cursor, null);

        const eventos = paginas.flatMap((pagina) => pagina.eventos);
        assert.equal(eventos.length, EVENTOS_POR_DISPOSITIVO);
        assert.deepEqual(eventos.map((evento) => evento.event_id), esperados);
        assert.ok(eventos.every((evento) => evento.device_id === dispositivo));

        // Orden ascendente por timestamp a través de todas las páginas.
        for (let i = 1; i < eventos.length; i += 1) {
            assert.ok(eventos[i].timestamp > eventos[i - 1].timestamp);
        }

        // Todas las consultas usan el índice, ninguna hace Scan.
        assert.equal(cliente.consultas.length, paginas.length);
        assert.ok(cliente.consultas.every((consulta) => consulta.IndexName === 'gsi_device_timestamp'));
    });

    test('2. Caso límite: un evento nuevo que llega a mitad del recorrido no cambia las páginas siguientes', async () => {
        const cliente = crearClienteMemoria(fixturesM08);

        // La primera página fija la frontera del recorrido en `hasta`.
        const primera = await consultarPorDispositivoPaginado(dispositivo, {
            hasta: TIMESTAMP_BASE + 200000,
            clienteDynamo: cliente,
        });
        const { hasta } = primera.rango;

        // Llega un evento posterior a la frontera que fijó la primera página.
        cliente.tabla.push(crearEventoPosteriorM08({ deviceId: dispositivo, timestamp: hasta + 60000 }));

        const paginas = [primera];
        let cursor = primera.siguiente_cursor;
        while (cursor !== null) {
            const pagina = await consultarPorDispositivoPaginado(dispositivo, {
                cursor,
                clienteDynamo: cliente,
            });
            assert.deepEqual(pagina.rango, primera.rango);
            paginas.push(pagina);
            cursor = pagina.siguiente_cursor;
        }

        const ids = paginas.flatMap((pagina) => pagina.eventos.map((evento) => evento.event_id));
        assert.deepEqual(ids, esperados);
        assert.ok(!ids.some((id) => id.startsWith('evt_m08_posterior_')));

        // Un recorrido nuevo, con su propia frontera, sí ve el evento posterior.
        const nuevo = await recorrerTodo(cliente, dispositivo);
        const idsNuevo = nuevo.flatMap((pagina) => pagina.eventos.map((evento) => evento.event_id));
        assert.equal(idsNuevo.length, EVENTOS_POR_DISPOSITIVO + 1);
    });

    test('3. Caso límite: límites 1 y 100, dispositivo sin eventos y límites fuera de rango', async () => {
        const cliente = crearClienteMemoria(fixturesM08);
        const rango = { desde: TIMESTAMP_BASE, hasta: TIMESTAMP_BASE + (EVENTOS_POR_DISPOSITIVO * 1000) };

        const deUno = await consultarPorDispositivoPaginado(dispositivo, {
            ...rango,
            limite: 1,
            clienteDynamo: cliente,
        });
        assert.equal(deUno.cantidad, 1);
        assert.equal(deUno.eventos[0].event_id, esperados[0]);
        assert.notEqual(deUno.siguiente_cursor, null);

        const maximo = await recorrerTodo(cliente, dispositivo, { ...rango, limite: LIMITE_MAXIMO });
        assert.deepEqual(maximo.map((pagina) => pagina.cantidad), [100, 20]);

        // Si el total es múltiplo exacto del límite, DynamoDB deja un cursor y la
        // última página llega vacía; el recorrido termina igual sin duplicar.
        const exacto = await recorrerTodo(cliente, dispositivo, { ...rango, limite: 60 });
        assert.deepEqual(exacto.map((pagina) => pagina.cantidad), [60, 60, 0]);
        assert.equal(new Set(exacto.flatMap((p) => p.eventos.map((e) => e.event_id))).size, EVENTOS_POR_DISPOSITIVO);

        const vacio = await consultarPorDispositivoPaginado('NODE-CDRL-SIN-EVENTOS', { clienteDynamo: cliente });
        assert.deepEqual(
            { cantidad: vacio.cantidad, cursor: vacio.siguiente_cursor },
            { cantidad: 0, cursor: null },
        );

        for (const limite of [0, LIMITE_MAXIMO + 1, 2.5, '25']) {
            await assert.rejects(
                consultarPorDispositivoPaginado(dispositivo, { limite, clienteDynamo: cliente }),
                CursorInvalidoError,
            );
        }
    });

    test('4. Fallo declarado: un cursor inválido se rechaza con CursorInvalidoError sin llegar a DynamoDB', async () => {
        const cliente = crearClienteMemoria(fixturesM08);
        const primera = await consultarPorDispositivoPaginado(dispositivo, { clienteDynamo: cliente });
        const valido = decodificarCursor(primera.siguiente_cursor);
        const consultasAntes = cliente.consultas.length;

        const invalidos = {
            'no es Base64URL': '%%%cursor%%%',
            'no es JSON': Buffer.from('esto no es json').toString('base64url'),
            'versión no soportada': codificarCursor({ ...valido, version: 2 }),
            'clave incompleta': codificarCursor({ ...valido, last_evaluated_key: { event_id: 'evt' } }),
            'rango alterado': codificarCursor({ ...valido, desde: valido.hasta + 1 }),
        };

        for (const [caso, cursor] of Object.entries(invalidos)) {
            await assert.rejects(
                consultarPorDispositivoPaginado(dispositivo, { cursor, clienteDynamo: cliente }),
                CursorInvalidoError,
                caso,
            );
        }

        // Un cursor válido tampoco se puede usar con otro dispositivo ni con otro límite.
        await assert.rejects(
            consultarPorDispositivoPaginado(DISPOSITIVOS_M08[1], {
                cursor: primera.siguiente_cursor,
                clienteDynamo: cliente,
            }),
            /otro dispositivo/,
        );
        await assert.rejects(
            consultarPorDispositivoPaginado(dispositivo, {
                cursor: primera.siguiente_cursor,
                limite: 50,
                clienteDynamo: cliente,
            }),
            /no coincide con el cursor/,
        );

        assert.equal(cliente.consultas.length, consultasAntes);
    });
});
