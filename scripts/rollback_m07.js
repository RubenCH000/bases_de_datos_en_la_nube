// Rollback de la migración compatible de M07.
// Retira schema_version únicamente de los documentos incluidos en el respaldo.

const fs = require('node:fs/promises');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');

const {
    obtenerEvento,
    TABLA,
} = require('../src/db/documentStore');

const {
    revertirDocumentosMigrados,
} = require('../src/db/migracionCompatible');

const RUTA_ARTIFACTS = path.join(__dirname, '..', 'artifacts');
const RUTA_RESPALDO = path.join(RUTA_ARTIFACTS, 'm07-respaldo.json');
const RUTA_ROLLBACK = path.join(RUTA_ARTIFACTS, 'm07-rollback.json');

async function leerRespaldo() {
    const contenido = await fs.readFile(RUTA_RESPALDO, 'utf8');
    const respaldo = JSON.parse(contenido);

    if (
        respaldo.assignmentId !== 'M07-evolucion-compatible'
        || !Array.isArray(respaldo.documentos)
    ) {
        throw new Error('el respaldo M07 no tiene una estructura válida');
    }

    return respaldo;
}

async function escribirJson(ruta, contenido) {
    await fs.writeFile(
        ruta,
        `${JSON.stringify(contenido, null, 2)}\n`,
        'utf8',
    );
}

async function main() {
    const fechaInicio = new Date().toISOString();
    const tiempoInicio = Date.now();

    await fs.mkdir(RUTA_ARTIFACTS, { recursive: true });

    const respaldo = await leerRespaldo();
    const eventIds = respaldo.documentos.map((documento) => documento.event_id);

    const operacion = await revertirDocumentosMigrados(eventIds);

    const restaurados = [];
    const faltantes = [];
    const diferentes = [];

    for (const documentoOriginal of respaldo.documentos) {
        const documentoActual = await obtenerEvento(documentoOriginal.event_id);

        if (!documentoActual) {
            faltantes.push(documentoOriginal.event_id);
            continue;
        }

        if (!isDeepStrictEqual(documentoActual, documentoOriginal)) {
            diferentes.push(documentoOriginal.event_id);
            continue;
        }

        restaurados.push(documentoOriginal.event_id);
    }

    const resultadoFinal = restaurados.length === respaldo.documentos.length
        && faltantes.length === 0
        && diferentes.length === 0
        && operacion.errores.length === 0
        ? 'exito'
        : 'fallo';

    const resultado = {
        assignmentId: 'M07-evolucion-compatible',
        tabla: TABLA,
        fecha_inicio: fechaInicio,
        fecha_fin: new Date().toISOString(),
        respaldados: respaldo.documentos.length,
        restaurados: restaurados.length,
        eventos_restaurados: restaurados,
        faltantes,
        diferentes,
        operacion,
        tiempo_ms: Date.now() - tiempoInicio,
        resultado: resultadoFinal,
    };

    await escribirJson(RUTA_ROLLBACK, resultado);

    console.log(
        `M07 rollback: ${restaurados.length} restaurados, `
        + `${faltantes.length} faltantes, ${diferentes.length} diferentes`,
    );

    if (resultadoFinal !== 'exito') {
        throw new Error('el rollback M07 no terminó correctamente');
    }
}

main().catch((error) => {
    console.error(`error en rollback M07: ${error.message}`);
    process.exitCode = 1;
});