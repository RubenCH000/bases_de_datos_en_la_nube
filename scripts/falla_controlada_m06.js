// Simula una falla controlada: respaldo, borrado y restauración.
const fs = require('node:fs');
const path = require('node:path');

const {
    guardarEvento,
    obtenerEvento,
    eliminarEvento,
} = require('../src/db/documentStore');

const {
    registrarAuditoria,
    listarAuditoria,
} = require('../src/db/auditLog');

const config = require('../src/db/nosqlConfig');

const ACTOR = process.env.AUDIT_ACTOR || 'ruben-m06';
const ARTIFACTS_DIR = path.join(__dirname, '..', 'artifacts');

const FIXTURE_RECUPERACION = [
    {
        event_id: 'evt_m06_rec_001',
        device_id: 'NODE-CDRL-REC1',
        timestamp: 1790000001000,
        metric_name: 'cpu_temperature',
        metric_value: 44.5,
    },
    {
        event_id: 'evt_m06_rec_002',
        device_id: 'NODE-CDRL-REC1',
        timestamp: 1790000002000,
        metric_name: 'battery_voltage',
        metric_value: 12.4,
    },
    {
        schema_version: 2,
        event_id: 'evt_m06_rec_003',
        device_id: 'NODE-CDRL-REC2',
        timestamp: 1790000003000,
        metric_name: 'cpu_temperature',
        metric_value: 47.8,
        firmware_version: '2.1.0',
        quality_score: 0.96,
    },
    {
        schema_version: 2,
        event_id: 'evt_m06_rec_004',
        device_id: 'NODE-CDRL-REC2',
        timestamp: 1790000004000,
        metric_name: 'battery_voltage',
        metric_value: 12.1,
        firmware_version: '2.1.0',
        quality_score: 0.91,
    },
];

function guardarJson(nombre, contenido) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

    fs.writeFileSync(
        path.join(ARTIFACTS_DIR, nombre),
        `${JSON.stringify(contenido, null, 2)}\n`,
    );
}

async function prepararFixture() {
    for (const evento of FIXTURE_RECUPERACION) {
        await guardarEvento(evento);
    }
}

async function crearRespaldo() {
    const documentos = [];

    for (const evento of FIXTURE_RECUPERACION) {
        const guardado = await obtenerEvento(evento.event_id);

        if (guardado) {
            documentos.push(guardado);
        }
    }

    const respaldo = {
        assignmentId: 'M06-auditoria-recuperacion',
        tabla: config.table,
        fecha: new Date().toISOString(),
        total_documentos: documentos.length,
        documentos,
    };

    guardarJson('m06-respaldo.json', respaldo);
    return documentos;
}

async function borrarDocumentos(documentos) {
    let eliminados = 0;

    for (const documento of documentos) {
        const resultado = await eliminarEvento(documento.event_id);

        if (resultado.eliminado) {
            eliminados += 1;
        }
    }

    return eliminados;
}

async function restaurarDocumentos(documentos) {
    for (const documento of documentos) {
        await guardarEvento(documento);
    }
}

async function verificarRestauracion(documentos) {
    const recuperados = [];
    const faltantes = [];

    for (const documento of documentos) {
        const restaurado = await obtenerEvento(documento.event_id);

        if (restaurado) {
            recuperados.push(documento.event_id);
        } else {
            faltantes.push(documento.event_id);
        }
    }

    return {
        recuperados,
        faltantes,
    };
}

async function ejecutarFallaControlada() {
    const inicio = Date.now();
    const fechaInicio = new Date().toISOString();
    const auditoriasCreadas = [];

    let respaldo = [];

    try {
        await prepararFixture();

        respaldo = await crearRespaldo();

        auditoriasCreadas.push(await registrarAuditoria({
            actor: ACTOR,
            accion: 'respaldo_fixture_controlado',
            documentosAfectados: respaldo.length,
            resultado: 'exito',
        }));

        const eliminados = await borrarDocumentos(respaldo);

        auditoriasCreadas.push(await registrarAuditoria({
            actor: ACTOR,
            accion: 'borrado_controlado',
            documentosAfectados: eliminados,
            resultado: eliminados === respaldo.length ? 'exito' : 'fallo',
        }));

        await restaurarDocumentos(respaldo);

        const verificacion = await verificarRestauracion(respaldo);
        const resultadoFinal = verificacion.faltantes.length === 0
            ? 'exito'
            : 'fallo';

        auditoriasCreadas.push(await registrarAuditoria({
            actor: ACTOR,
            accion: 'restauracion_controlada',
            documentosAfectados: verificacion.recuperados.length,
            resultado: resultadoFinal,
        }));

        const tiempoMs = Date.now() - inicio;

        const resultado = {
            assignmentId: 'M06-auditoria-recuperacion',
            tabla: config.table,
            tabla_auditoria: config.auditTable,
            actor: ACTOR,
            fecha_inicio: fechaInicio,
            fecha_fin: new Date().toISOString(),
            respaldados: respaldo.length,
            eliminados,
            recuperados: verificacion.recuperados.length,
            faltantes: verificacion.faltantes,
            tiempo_ms: tiempoMs,
            resultado: resultadoFinal,
        };

        guardarJson('m06-recuperacion.json', resultado);

        const idsAuditoria = new Set(
            auditoriasCreadas.map((registro) => registro.audit_id),
        );

        const registrosGuardados = (await listarAuditoria())
            .filter((registro) => idsAuditoria.has(registro.audit_id));

        guardarJson('m06-auditoria.json', {
            assignmentId: 'M06-auditoria-recuperacion',
            total_registros: registrosGuardados.length,
            registros: registrosGuardados,
        });

        console.log(
            `recuperacion M06: ${resultado.recuperados} recuperados, `
            + `${resultado.faltantes.length} faltantes, ${tiempoMs} ms`,
        );

        if (resultadoFinal === 'fallo') {
            process.exitCode = 1;
        }
    } catch (error) {
        // Si la ejecución se interrumpe, se intenta recuperar el respaldo.
        if (respaldo.length > 0) {
            for (const documento of respaldo) {
                try {
                    await guardarEvento(documento);
                } catch {
                    // La falla se reporta sin guardar secretos ni conexiones.
                }
            }
        }

        try {
            await registrarAuditoria({
                actor: ACTOR,
                accion: 'falla_controlada',
                documentosAfectados: respaldo.length,
                resultado: 'fallo',
            });
        } catch {
            // La tabla de auditoría también podría no estar disponible.
        }

        guardarJson('m06-recuperacion.json', {
            assignmentId: 'M06-auditoria-recuperacion',
            fecha_inicio: fechaInicio,
            fecha_fin: new Date().toISOString(),
            respaldados: respaldo.length,
            recuperados: 0,
            faltantes: respaldo.map((documento) => documento.event_id),
            tiempo_ms: Date.now() - inicio,
            resultado: 'fallo',
            error_tipo: error.name,
        });

        throw error;
    }
}

if (require.main === module) {
    ejecutarFallaControlada().catch((error) => {
        console.error(`fallo la recuperación controlada: ${error.message}`);
        process.exit(1);
    });
}

module.exports = {
    FIXTURE_RECUPERACION,
    ejecutarFallaControlada,
};