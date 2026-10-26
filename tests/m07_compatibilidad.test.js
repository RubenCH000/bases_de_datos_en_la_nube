// Pruebas M07: la versión anterior se sigue leyendo durante la transición,
// la migración es repetible y el rollback deja los documentos como estaban.
// Usa un cliente DynamoDB en memoria para no depender del contenedor.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { ConditionalCheckFailedException } = require('@aws-sdk/client-dynamodb');

const {
    fixturesV1,
    fixturesV2,
    fixturesInvalidos,
    fixturesMixtos,
} = require('../src/db/cdrlFixturesM07');
const { consumirEventos } = require('../src/db/consumidorEventos');
const {
    DocumentoNoMigrableError,
    detectarEstadoMigracion,
    migrarDocumentosSinVersion,
    revertirDocumentosMigrados,
} = require('../src/db/migracionCompatible');

// Simula solo lo que usa migracionCompatible: Scan y Update con las dos
// condiciones de la migración y del rollback.
function crearClienteMemoria(documentos) {
    const tabla = new Map(documentos.map((doc) => [doc.event_id, structuredClone(doc)]));

    function fallaCondicion() {
        return new ConditionalCheckFailedException({
            message: 'The conditional request failed',
            $metadata: {},
        });
    }

    return {
        tabla,
        async send(comando) {
            const nombre = comando.constructor.name;
            const entrada = comando.input;

            if (nombre === 'ScanCommand') {
                return { Items: [...tabla.values()].map((doc) => structuredClone(doc)) };
            }

            if (nombre === 'UpdateCommand') {
                const actual = tabla.get(entrada.Key.event_id);
                const version = entrada.ExpressionAttributeValues[':version'];

                if (entrada.UpdateExpression.startsWith('SET')) {
                    if (!actual || actual.schema_version !== undefined) {
                        throw fallaCondicion();
                    }
                    actual.schema_version = version;
                    return {};
                }

                if (!actual || actual.schema_version !== version) {
                    throw fallaCondicion();
                }
                delete actual.schema_version;
                return {};
            }

            throw new Error(`comando no soportado en la prueba: ${nombre}`);
        },
    };
}

const legacy = fixturesV1.filter((doc) => doc.schema_version === undefined);

describe('M07 - Evolución compatible de documentos', () => {
    test('1. Caso normal: migra los v1 sin versión y el consumidor lee el lote mixto completo', async () => {
        const cliente = crearClienteMemoria(fixturesMixtos);
        const resultado = await migrarDocumentosSinVersion({ clienteDynamo: cliente });

        assert.equal(resultado.revisados, fixturesMixtos.length);
        assert.equal(resultado.migrados, legacy.length);
        assert.deepEqual(resultado.eventos_migrados.sort(), legacy.map((doc) => doc.event_id).sort());
        assert.equal(resultado.errores.length, 0);

        // Los campos que usa el consumidor anterior no cambian con la migración.
        for (const original of legacy) {
            const migrado = cliente.tabla.get(original.event_id);
            assert.equal(migrado.schema_version, 1);
            assert.deepEqual({ ...migrado, schema_version: undefined }, { ...original, schema_version: undefined });
        }

        const { eventos, errores, resumen } = consumirEventos([...cliente.tabla.values()]);
        assert.equal(errores.length, 0);
        assert.equal(eventos.length, fixturesMixtos.length);
        assert.deepEqual(
            { v1: resumen.v1, v2: resumen.v2 },
            { v1: fixturesV1.length, v2: fixturesV2.length },
        );
        assert.ok(eventos.every((evento) => evento.schema_version === 2));
    });

    test('2. Caso límite: correr la migración dos veces no cambia nada la segunda vez', async () => {
        const cliente = crearClienteMemoria(fixturesMixtos);
        const primera = await migrarDocumentosSinVersion({ clienteDynamo: cliente });
        const despuesPrimera = structuredClone([...cliente.tabla.values()]);

        const segunda = await migrarDocumentosSinVersion({ clienteDynamo: cliente });

        assert.equal(primera.migrados, legacy.length);
        assert.equal(segunda.candidatos, 0);
        assert.equal(segunda.migrados, 0);
        assert.equal(segunda.omitidos, fixturesMixtos.length);
        assert.deepEqual([...cliente.tabla.values()], despuesPrimera);

        // Un lote vacío tampoco truena.
        const vacio = await migrarDocumentosSinVersion({ clienteDynamo: cliente, documentos: [] });
        assert.deepEqual(
            { revisados: vacio.revisados, migrados: vacio.migrados, errores: vacio.errores },
            { revisados: 0, migrados: 0, errores: [] },
        );
    });

    test('3. Caso límite: el rollback regresa los v1 a su forma original y no toca los v2', async () => {
        const cliente = crearClienteMemoria(fixturesMixtos);
        const migracion = await migrarDocumentosSinVersion({ clienteDynamo: cliente });

        const rollback = await revertirDocumentosMigrados(
            [...migracion.eventos_migrados, fixturesV2[0].event_id],
            { clienteDynamo: cliente },
        );

        assert.equal(rollback.restaurados, legacy.length);
        // El v2 no tiene schema_version 1, así que la condición lo deja igual.
        assert.equal(rollback.omitidos, 1);
        assert.equal(rollback.errores.length, 0);

        for (const original of legacy) {
            assert.deepEqual(cliente.tabla.get(original.event_id), original);
        }
        assert.deepEqual(cliente.tabla.get(fixturesV2[0].event_id), fixturesV2[0]);

        // Repetir el rollback no hace nada.
        const otraVez = await revertirDocumentosMigrados(migracion.eventos_migrados, { clienteDynamo: cliente });
        assert.equal(otraVez.restaurados, 0);
        assert.equal(otraVez.omitidos, legacy.length);
    });

    test('4. Fallo declarado: un documento con schema_version 3 o un v2 incompleto no se migra ni se consume', async () => {
        assert.throws(() => detectarEstadoMigracion(fixturesInvalidos[0]), DocumentoNoMigrableError);
        assert.throws(() => detectarEstadoMigracion(fixturesInvalidos[1]), DocumentoNoMigrableError);

        const lote = [...fixturesMixtos, ...fixturesInvalidos];
        const cliente = crearClienteMemoria(lote);
        const migracion = await migrarDocumentosSinVersion({ clienteDynamo: cliente });

        assert.equal(migracion.migrados, legacy.length);
        assert.equal(migracion.errores.length, fixturesInvalidos.length);
        assert.ok(migracion.errores.every((error) => error.tipo === 'DocumentoNoMigrableError'));
        assert.deepEqual(cliente.tabla.get(fixturesInvalidos[0].event_id), fixturesInvalidos[0]);

        const consumo = consumirEventos([...cliente.tabla.values()]);
        assert.equal(consumo.eventos.length, fixturesMixtos.length);
        assert.equal(consumo.resumen.rechazados, fixturesInvalidos.length);
        assert.ok(consumo.errores.every((error) => error.tipo === 'EventoNoConsumibleError'));
    });
});
