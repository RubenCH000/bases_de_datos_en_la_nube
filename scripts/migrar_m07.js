// Ejecuta una migración compatible y repetible para M07.
// Se utilizan fixtures sintéticos controlados para no modificar datos ajenos.

const fs = require('node:fs/promises');
const path = require('node:path');

const {
    guardarEvento,
    obtenerEvento,
    TABLA,
} = require('../src/db/documentStore');

const {
    migrarDocumentosSinVersion,
    revertirDocumentosMigrados,
} = require('../src/db/migracionCompatible');

const RUTA_ARTIFACTS = path.join(__dirname, '..', 'artifacts');
const RUTA_RESPALDO = path.join(RUTA_ARTIFACTS, 'm07-respaldo.json');
const RUTA_MIGRACION = path.join(RUTA_ARTIFACTS, 'm07-migracion.json');

const FIXTURES_M07 = [
    {
        event_id: 'evt_m07_legacy_001',
        device_id: 'NODE-CDRL-M07A',
        timestamp: 1790000001000,
        metric_name: 'cpu_temperature',
        metric_value: 44.8,
    },
    {
        event_id: 'evt_m07_legacy_002',
        device_id: 'NODE-CDRL-M07A',
        timestamp: 1790000002000,
        metric_name: 'cpu_temperature',
        metric_value: 46.1,
    },
    {
        event_id: 'evt_m07_legacy_003',
        device_id: 'NODE-CDRL-M07B',
        timestamp: 1790000003000,
        metric_name: 'battery_voltage',
        metric_value: 12.3,
    },
];

function camposConsumidorAnterior(documento) {
    return {
        event_id: documento.event_id,
        device_id: documento.device_id,
        timestamp: documento.timestamp,
        metric_name: documento.metric_name,
        metric_value: documento.metric_value,
    };
}

async function escribirJson(ruta, contenido) {
    await fs.writeFile(
        ruta,
        `${JSON.stringify(contenido, null, 2)}\n`,
        'utf8',
    );
}

async function prepararFixtures() {
    const eventIds = FIXTURES_M07.map((evento) => evento.event_id);

    // Deja los fixtures en su forma anterior por si el script se ejecutó antes.
    await revertirDocumentosMigrados(eventIds);

    for (const evento of FIXTURES_M07) {
        await guardarEvento(evento);
    }

    return Promise.all(
        eventIds.map((eventId) => obtenerEvento(eventId)),
    );
}

async function main() {
    const fechaInicio = new Date().toISOString();
    const tiempoInicio = Date.now();

    await fs.mkdir(RUTA_ARTIFACTS, { recursive: true });

    const documentosOriginales = await prepararFixtures();

    const respaldo = {
        assignmentId: 'M07-evolucion-compatible',
        tabla: TABLA,
        generatedAt: new Date().toISOString(),
        total: documentosOriginales.length,
        documentos: documentosOriginales,
    };

    // El respaldo se escribe antes de realizar cualquier cambio.
    await escribirJson(RUTA_RESPALDO, respaldo);

    const primeraEjecucion = await migrarDocumentosSinVersion({
        documentos: documentosOriginales,
    });

    const documentosMigrados = await Promise.all(
        FIXTURES_M07.map((evento) => obtenerEvento(evento.event_id)),
    );

    // Se vuelve a ejecutar con el estado actualizado.
    const segundaEjecucion = await migrarDocumentosSinVersion({
        documentos: documentosMigrados,
    });

    const consumidorAnteriorConservado = documentosMigrados.every(
        (documentoMigrado, indice) => {
            const original = documentosOriginales[indice];

            return JSON.stringify(camposConsumidorAnterior(documentoMigrado))
                === JSON.stringify(camposConsumidorAnterior(original));
        },
    );

    const repetible = segundaEjecucion.migrados === 0;
    const sinErrores = primeraEjecucion.errores.length === 0
        && segundaEjecucion.errores.length === 0;

    const resultadoFinal = repetible
        && sinErrores
        && consumidorAnteriorConservado
        && primeraEjecucion.migrados === FIXTURES_M07.length
        ? 'exito'
        : 'fallo';

    const resultado = {
        assignmentId: 'M07-evolucion-compatible',
        tabla: TABLA,
        fecha_inicio: fechaInicio,
        fecha_fin: new Date().toISOString(),
        fixtures_controlados: FIXTURES_M07.length,
        primera_ejecucion: primeraEjecucion,
        segunda_ejecucion: segundaEjecucion,
        consumidor_anterior_conservado: consumidorAnteriorConservado,
        repetible,
        tiempo_ms: Date.now() - tiempoInicio,
        resultado: resultadoFinal,
    };

    await escribirJson(RUTA_MIGRACION, resultado);

    console.log(
        `M07 primera ejecución: ${primeraEjecucion.migrados} migrados`,
    );
    console.log(
        `M07 segunda ejecución: ${segundaEjecucion.migrados} migrados`,
    );
    console.log(
        `M07 compatibilidad anterior: ${consumidorAnteriorConservado ? 'conservada' : 'fallo'}`,
    );

    if (resultadoFinal !== 'exito') {
        throw new Error('la migración compatible M07 no terminó correctamente');
    }
}

main().catch((error) => {
    console.error(`error en migración M07: ${error.message}`);
    process.exitCode = 1;
});