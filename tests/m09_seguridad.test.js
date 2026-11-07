// Pruebas M09: controles por colección y operación sobre DynamoDB y auditoría.
// Lecturas y escrituras no autorizadas fallan antes de tocar la base, cada
// operación deja un registro con actor, acción, recurso y resultado, y el
// registro nunca copia el documento ni sus secretos.
// La operación y el registrador de auditoría se inyectan en memoria, así que
// no dependen del contenedor de DynamoDB Local.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const {
    RECURSOS,
    ACCIONES,
    ROLES,
    POLITICA_SEGURA,
    AccesoDenegadoError,
    tienePermiso,
    autorizarOperacion,
} = require('../src/security/nosqlAccessControl');
const {
    ejecutarOperacionAuditada,
    guardarEventoSeguro,
    eliminarEventoSeguro,
    listarAuditoriaSeguro,
} = require('../src/db/secureDocumentStore');
const { validarRegistro } = require('../src/db/auditLog');

const CAMPOS_AUDITORIA = ['actor', 'accion', 'recurso', 'documentosAfectados', 'resultado'];

const EVENTO_SINTETICO = {
    schema_version: 2,
    event_id: 'evt_m09_prueba',
    device_id: 'NODE-CDRL-M09T',
    timestamp: 1795000100000,
    metric_name: 'cpu_temperature',
    metric_value: 41.2,
    firmware_version: '4.0.0',
    quality_score: 0.9,
};

function crearRegistradorMemoria() {
    const registros = [];

    async function registrador(registro) {
        validarRegistro(registro);
        registros.push(structuredClone(registro));
        return registro;
    }

    return { registros, registrador };
}

// Operación falsa que cuenta cuántas veces se llamó: si el control de acceso
// funciona, una petición denegada nunca llega a ejecutarse.
function crearOperacion(resultado) {
    const espia = { llamadas: 0 };

    espia.operacion = async () => {
        espia.llamadas += 1;
        return structuredClone(resultado);
    };

    return espia;
}

describe('M09 seguridad NoSQL y auditoría', () => {
    test('1. caso normal: cada rol hace lo suyo y queda auditado con actor, acción, recurso y resultado', async () => {
        const { registros, registrador } = crearRegistradorMemoria();

        const lectura = crearOperacion(EVENTO_SINTETICO);
        const evento = await ejecutarOperacionAuditada({
            contexto: { actor: 'maria-m09-lector', rol: ROLES.LECTOR },
            recurso: RECURSOS.EVENTOS,
            accion: ACCIONES.OBTENER,
            operacion: lectura.operacion,
            contarDocumentos: (doc) => (doc ? 1 : 0),
            registrador,
        });

        const consulta = crearOperacion([EVENTO_SINTETICO, { ...EVENTO_SINTETICO, event_id: 'evt_m09_2' }]);
        await ejecutarOperacionAuditada({
            contexto: { actor: 'maria-m09-lector', rol: ROLES.LECTOR },
            recurso: RECURSOS.EVENTOS,
            accion: ACCIONES.CONSULTAR,
            operacion: consulta.operacion,
            contarDocumentos: (docs) => docs.length,
            registrador,
        });

        const escritura = crearOperacion({ creado: true });
        await ejecutarOperacionAuditada({
            contexto: { actor: 'maria-m09-escritor', rol: ROLES.ESCRITOR },
            recurso: RECURSOS.EVENTOS,
            accion: ACCIONES.CREAR,
            operacion: escritura.operacion,
            contarDocumentos: () => 1,
            registrador,
        });

        const auditoria = crearOperacion([{ audit_id: 'audit_x' }]);
        await ejecutarOperacionAuditada({
            contexto: { actor: 'maria-m09-auditor', rol: ROLES.AUDITOR },
            recurso: RECURSOS.AUDITORIA,
            accion: ACCIONES.CONSULTAR,
            operacion: auditoria.operacion,
            contarDocumentos: (docs) => docs.length,
            registrador,
        });

        assert.equal(evento.event_id, EVENTO_SINTETICO.event_id);
        assert.equal(lectura.llamadas + consulta.llamadas + escritura.llamadas + auditoria.llamadas, 4);
        assert.equal(registros.length, 4);

        for (const registro of registros) {
            assert.deepEqual(Object.keys(registro).sort(), [...CAMPOS_AUDITORIA].sort());
            assert.equal(registro.resultado, 'exito');
        }

        assert.deepEqual(
            registros.map((r) => [r.actor, r.accion, r.recurso, r.documentosAfectados]),
            [
                ['maria-m09-lector', ACCIONES.OBTENER, RECURSOS.EVENTOS, 1],
                ['maria-m09-lector', ACCIONES.CONSULTAR, RECURSOS.EVENTOS, 2],
                ['maria-m09-escritor', ACCIONES.CREAR, RECURSOS.EVENTOS, 1],
                ['maria-m09-auditor', ACCIONES.CONSULTAR, RECURSOS.AUDITORIA, 1],
            ],
        );
    });

    test('2. caso límite: mínimo privilegio, cada rol solo tiene las acciones de su colección', () => {
        const esperado = {
            [ROLES.LECTOR]: { [RECURSOS.EVENTOS]: ['get', 'query'], [RECURSOS.AUDITORIA]: [] },
            [ROLES.ESCRITOR]: { [RECURSOS.EVENTOS]: ['put'], [RECURSOS.AUDITORIA]: [] },
            [ROLES.OPERADOR]: { [RECURSOS.EVENTOS]: ['update', 'delete'], [RECURSOS.AUDITORIA]: [] },
            [ROLES.AUDITOR]: { [RECURSOS.EVENTOS]: [], [RECURSOS.AUDITORIA]: ['get', 'query'] },
            [ROLES.ADMINISTRADOR]: {
                [RECURSOS.EVENTOS]: Object.values(ACCIONES),
                [RECURSOS.AUDITORIA]: Object.values(ACCIONES),
            },
        };

        for (const [rol, porRecurso] of Object.entries(esperado)) {
            for (const [recurso, permitidas] of Object.entries(porRecurso)) {
                for (const accion of Object.values(ACCIONES)) {
                    assert.equal(
                        tienePermiso({ rol, recurso, accion }),
                        permitidas.includes(accion),
                        `${rol} ${accion} ${recurso}`,
                    );
                }
            }
        }

        // Rol inventado, colección desconocida o acción fuera del catálogo: todo se niega.
        assert.equal(tienePermiso({ rol: 'superusuario', recurso: RECURSOS.EVENTOS, accion: 'get' }), false);
        assert.equal(tienePermiso({ rol: ROLES.LECTOR, recurso: 'usuarios', accion: 'get' }), false);
        assert.equal(tienePermiso({ rol: ROLES.LECTOR, recurso: RECURSOS.EVENTOS, accion: 'scan' }), false);

        // La política segura no se puede modificar en tiempo de ejecución.
        assert.ok(Object.isFrozen(POLITICA_SEGURA));
        assert.ok(Object.isFrozen(POLITICA_SEGURA[ROLES.LECTOR][RECURSOS.EVENTOS]));
        assert.throws(() => POLITICA_SEGURA[ROLES.LECTOR][RECURSOS.EVENTOS].push('put'), TypeError);
    });

    test('3. caso límite: abuso de lectura y escritura se niega antes de tocar DynamoDB y se audita como denegado', async () => {
        const { registros, registrador } = crearRegistradorMemoria();
        const intentos = [
            // escritura no autorizada: el lector intenta crear y borrar
            { actor: 'maria-m09-lector', rol: ROLES.LECTOR, recurso: RECURSOS.EVENTOS, accion: ACCIONES.CREAR },
            { actor: 'maria-m09-lector', rol: ROLES.LECTOR, recurso: RECURSOS.EVENTOS, accion: ACCIONES.ELIMINAR },
            // lectura no autorizada: el escritor intenta leer, el lector intenta leer la auditoría
            { actor: 'maria-m09-escritor', rol: ROLES.ESCRITOR, recurso: RECURSOS.EVENTOS, accion: ACCIONES.OBTENER },
            { actor: 'maria-m09-lector', rol: ROLES.LECTOR, recurso: RECURSOS.AUDITORIA, accion: ACCIONES.CONSULTAR },
            // el auditor no puede tocar eventos ni borrar su propio rastro
            { actor: 'maria-m09-auditor', rol: ROLES.AUDITOR, recurso: RECURSOS.EVENTOS, accion: ACCIONES.OBTENER },
            { actor: 'maria-m09-auditor', rol: ROLES.AUDITOR, recurso: RECURSOS.AUDITORIA, accion: ACCIONES.ELIMINAR },
            // rol que no existe
            { actor: 'intruso-m09', rol: 'superusuario', recurso: RECURSOS.EVENTOS, accion: ACCIONES.CREAR },
        ];

        for (const intento of intentos) {
            const espia = crearOperacion({ creado: true });

            await assert.rejects(
                ejecutarOperacionAuditada({
                    contexto: { actor: intento.actor, rol: intento.rol },
                    recurso: intento.recurso,
                    accion: intento.accion,
                    operacion: espia.operacion,
                    registrador,
                }),
                (error) => error instanceof AccesoDenegadoError
                    && error.actor === intento.actor
                    && error.accion === intento.accion
                    && error.recurso === intento.recurso,
            );

            assert.equal(espia.llamadas, 0, `${intento.actor} ${intento.accion} llegó a la base`);
        }

        assert.equal(registros.length, intentos.length);
        for (const [i, registro] of registros.entries()) {
            assert.equal(registro.resultado, 'denegado');
            assert.equal(registro.documentosAfectados, 0);
            assert.equal(registro.actor, intentos[i].actor);
            assert.equal(registro.accion, intentos[i].accion);
            assert.equal(registro.recurso, intentos[i].recurso);
        }

        // Las funciones públicas también niegan sin llegar a DynamoDB:
        // si llegaran, fallarían por conexión y no con AccesoDenegadoError.
        await assert.rejects(
            guardarEventoSeguro({ actor: 'maria-m09-lector', rol: ROLES.LECTOR }, EVENTO_SINTETICO, { registrador }),
            AccesoDenegadoError,
        );
        await assert.rejects(
            eliminarEventoSeguro({ actor: 'maria-m09-escritor', rol: ROLES.ESCRITOR }, EVENTO_SINTETICO.event_id, { registrador }),
            AccesoDenegadoError,
        );
        await assert.rejects(
            listarAuditoriaSeguro({ actor: 'maria-m09-lector', rol: ROLES.LECTOR }, { registrador }),
            AccesoDenegadoError,
        );
        assert.equal(registros.length, intentos.length + 3);
    });

    test('4. remediación: la política insegura dejaba escribir al lector y la segura lo niega', async () => {
        const { registros, registrador } = crearRegistradorMemoria();
        const politicaInsegura = structuredClone(POLITICA_SEGURA);
        politicaInsegura[ROLES.LECTOR][RECURSOS.EVENTOS].push(ACCIONES.CREAR);

        const contexto = { actor: 'maria-m09-lector', rol: ROLES.LECTOR };

        const antes = crearOperacion({ creado: true });
        const resultadoAntes = await ejecutarOperacionAuditada({
            contexto,
            recurso: RECURSOS.EVENTOS,
            accion: ACCIONES.CREAR,
            operacion: antes.operacion,
            contarDocumentos: () => 1,
            politica: politicaInsegura,
            registrador,
        });

        const despues = crearOperacion({ creado: true });
        await assert.rejects(
            ejecutarOperacionAuditada({
                contexto,
                recurso: RECURSOS.EVENTOS,
                accion: ACCIONES.CREAR,
                operacion: despues.operacion,
                registrador,
            }),
            AccesoDenegadoError,
        );

        assert.equal(resultadoAntes.creado, true);
        assert.equal(antes.llamadas, 1);
        assert.equal(despues.llamadas, 0);
        assert.deepEqual(registros.map((r) => r.resultado), ['exito', 'denegado']);
        // La copia insegura no contaminó la política real.
        assert.equal(tienePermiso({ rol: ROLES.LECTOR, recurso: RECURSOS.EVENTOS, accion: ACCIONES.CREAR }), false);
    });

    test('5. sin secretos: la auditoría guarda solo metadatos aunque el documento traiga datos sensibles', async () => {
        const { registros, registrador } = crearRegistradorMemoria();
        const documentoConSecretos = {
            ...EVENTO_SINTETICO,
            password: 'no-debe-salir-123',
            api_token: 'tok_no_debe_salir',
            connection_string: 'dynamodb://usuario:clave@host',
        };

        const escritura = crearOperacion({ creado: true, documento: documentoConSecretos });
        await ejecutarOperacionAuditada({
            contexto: { actor: 'maria-m09-escritor', rol: ROLES.ESCRITOR },
            recurso: RECURSOS.EVENTOS,
            accion: ACCIONES.CREAR,
            operacion: escritura.operacion,
            contarDocumentos: () => 1,
            registrador,
        });

        const texto = JSON.stringify(registros);
        assert.equal(registros.length, 1);
        assert.deepEqual(Object.keys(registros[0]).sort(), [...CAMPOS_AUDITORIA].sort());
        for (const prohibido of ['password', 'token', 'connection_string', 'no-debe-salir', 'clave@host', 'metric_value']) {
            assert.equal(texto.includes(prohibido), false, `la auditoría filtró "${prohibido}"`);
        }

        // El registro de auditoría rechaza datos incompletos o inventados.
        assert.throws(() => validarRegistro({ actor: '', accion: 'put', recurso: 'cdrl_eventos', documentosAfectados: 1, resultado: 'exito' }));
        assert.throws(() => validarRegistro({ actor: 'a', accion: 'put', recurso: 'cdrl_eventos', documentosAfectados: -1, resultado: 'exito' }));
        assert.throws(() => validarRegistro({ actor: 'a', accion: 'put', recurso: 'cdrl_eventos', documentosAfectados: 1, resultado: 'ok' }));
    });

    test('6. fallo declarado: si la base o la auditoría fallan, el error no se oculta y queda rastro', async () => {
        // a) DynamoDB falla a mitad de una operación autorizada: se propaga el
        //    error original y la auditoría registra "fallo" con 0 documentos.
        const { registros, registrador } = crearRegistradorMemoria();
        const caida = new Error('DynamoDB no disponible');

        await assert.rejects(
            ejecutarOperacionAuditada({
                contexto: { actor: 'maria-m09-operador', rol: ROLES.OPERADOR },
                recurso: RECURSOS.EVENTOS,
                accion: ACCIONES.ACTUALIZAR,
                operacion: async () => { throw caida; },
                registrador,
            }),
            (error) => error === caida,
        );
        assert.deepEqual(
            registros.map((r) => [r.actor, r.accion, r.resultado, r.documentosAfectados]),
            [['maria-m09-operador', ACCIONES.ACTUALIZAR, 'fallo', 0]],
        );

        // b) La tabla de auditoría no responde en una operación exitosa: la
        //    operación no se reporta como buena sin rastro, se lanza el error.
        const auditoriaCaida = async () => { throw new Error('audit_log no disponible'); };
        await assert.rejects(
            ejecutarOperacionAuditada({
                contexto: { actor: 'maria-m09-lector', rol: ROLES.LECTOR },
                recurso: RECURSOS.EVENTOS,
                accion: ACCIONES.OBTENER,
                operacion: async () => EVENTO_SINTETICO,
                registrador: auditoriaCaida,
            }),
            /audit_log no disponible/,
        );

        // c) Acceso denegado y además falla la auditoría: se conserva el error
        //    de seguridad (no se cambia por el de auditoría) y se marca.
        await assert.rejects(
            ejecutarOperacionAuditada({
                contexto: { actor: 'maria-m09-lector', rol: ROLES.LECTOR },
                recurso: RECURSOS.EVENTOS,
                accion: ACCIONES.ELIMINAR,
                operacion: async () => ({ eliminado: true }),
                registrador: auditoriaCaida,
            }),
            (error) => error instanceof AccesoDenegadoError && error.auditoria_fallida === true,
        );

        // d) Contexto sin actor: se rechaza como petición mal formada, no como
        //    acceso válido, y no se ejecuta nada.
        const espia = crearOperacion({ creado: true });
        await assert.rejects(
            ejecutarOperacionAuditada({
                contexto: { actor: '   ', rol: ROLES.ADMINISTRADOR },
                recurso: RECURSOS.EVENTOS,
                accion: ACCIONES.CREAR,
                operacion: espia.operacion,
                registrador,
            }),
            /actor debe ser un texto no vacío/,
        );
        assert.equal(espia.llamadas, 0);
        assert.throws(() => autorizarOperacion({ actor: 'x', rol: ROLES.LECTOR, recurso: '', accion: 'get' }), /recurso/);
    });
});
