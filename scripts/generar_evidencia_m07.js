// scripts/generar_evidencia_m07.js
// Simula la lectura de los fixtures M07 con el consumidor, comprueba que v1 y v2
// conviven y guarda el resultado REAL en artifacts/m07-compatibilidad.json.
// No necesita Docker ni base de datos. Si alguna comprobación falla, termina con código 1.
// No toca artifacts/m07-migracion.json, que genera la migración de Rubén.
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const {
    fixturesV1,
    fixturesV2,
    fixturesInvalidos,
    fixturesMixtos,
} = require('../src/db/cdrlFixturesM07');
const { consumirEventos } = require('../src/db/consumidorEventos');

const RAIZ = path.join(__dirname, '..');
const DIR_ARTIFACTS = path.join(RAIZ, 'artifacts');
const ARCHIVO_SALIDA = path.join(DIR_ARTIFACTS, 'm07-compatibilidad.json');

function commitActual() {
    try {
        return execSync('git rev-parse HEAD', { cwd: RAIZ, stdio: ['ignore', 'pipe', 'ignore'] })
            .toString()
            .trim();
    } catch {
        return 'desconocido';
    }
}

function comprobacion(nombre, cumple, detalle = '') {
    return { nombre, resultado: cumple ? 'PASS' : 'FAIL', detalle };
}

function main() {
    const inicio = Date.now();

    // Copia para comprobar que el consumidor no modifica los documentos originales.
    const copiaOriginal = JSON.stringify(fixturesMixtos);

    const mixto = consumirEventos(fixturesMixtos);
    const soloV1 = consumirEventos(fixturesV1);
    const soloV2 = consumirEventos(fixturesV2);
    const invalidos = consumirEventos(fixturesInvalidos);

    const v1Adaptados = mixto.eventos.filter((evento) => evento.version_origen === 1);
    const v2Leidos = mixto.eventos.filter((evento) => evento.version_origen === 2);

    const comprobaciones = [
        comprobacion(
            'hay al menos 3 fixtures v1 y 3 fixtures v2',
            fixturesV1.length >= 3 && fixturesV2.length >= 3,
            `v1=${fixturesV1.length}, v2=${fixturesV2.length}`,
        ),
        comprobacion(
            'el lote mixto se consume completo sin rechazos',
            mixto.errores.length === 0 && mixto.eventos.length === fixturesMixtos.length,
            `consumidos=${mixto.eventos.length}/${fixturesMixtos.length}`,
        ),
        comprobacion(
            'todos los eventos salen con estructura v2',
            mixto.eventos.every((evento) => evento.schema_version === 2),
        ),
        comprobacion(
            'los v1 se adaptan al vuelo con firmware_version y quality_score en null',
            v1Adaptados.length === fixturesV1.length
                && v1Adaptados.every((evento) => evento.adaptado_al_vuelo === true
                    && evento.firmware_version === null
                    && evento.quality_score === null),
            `adaptados=${v1Adaptados.length}`,
        ),
        comprobacion(
            'los v2 conservan sus valores sin adaptarse',
            v2Leidos.length === fixturesV2.length
                && v2Leidos.every((evento) => evento.adaptado_al_vuelo === false
                    && typeof evento.firmware_version === 'string'
                    && typeof evento.quality_score === 'number'),
            `leidos=${v2Leidos.length}`,
        ),
        comprobacion(
            'los datos base de cada evento no cambian al adaptarlo',
            mixto.eventos.every((evento) => {
                const original = fixturesMixtos.find((doc) => doc.event_id === evento.event_id);
                return original
                    && original.device_id === evento.device_id
                    && original.timestamp === evento.timestamp
                    && original.metric_name === evento.metric_name
                    && original.metric_value === evento.metric_value;
            }),
        ),
        comprobacion(
            'los documentos originales no se modifican',
            JSON.stringify(fixturesMixtos) === copiaOriginal,
        ),
        comprobacion(
            'consumir solo v1 y solo v2 da el mismo resultado que el lote mixto',
            soloV1.eventos.length + soloV2.eventos.length === mixto.eventos.length,
        ),
        comprobacion(
            'los documentos inválidos se rechazan sin romper el lote',
            invalidos.eventos.length === 0
                && invalidos.errores.length === fixturesInvalidos.length,
            `rechazados=${invalidos.errores.length}/${fixturesInvalidos.length}`,
        ),
    ];

    const fallidas = comprobaciones.filter((c) => c.resultado === 'FAIL').length;
    const resultado = fallidas === 0 ? 'exito' : 'fallo';

    const evidencia = {
        assignmentId: 'M07-evolucion-compatible',
        modulo: 'M07 - Retrocompatibilidad del consumidor v1/v2',
        autor: 'David',
        sourceCommitSha: commitActual(),
        fecha: new Date().toISOString(),
        fixtures: {
            v1: fixturesV1.length,
            v2: fixturesV2.length,
            mixtos: fixturesMixtos.length,
            invalidos: fixturesInvalidos.length,
        },
        resumen_lote_mixto: mixto.resumen,
        errores_esperados: invalidos.errores,
        comprobaciones,
        total_comprobaciones: comprobaciones.length,
        fallidas,
        tiempo_ms: Date.now() - inicio,
        resultado,
    };

    fs.mkdirSync(DIR_ARTIFACTS, { recursive: true });
    fs.writeFileSync(ARCHIVO_SALIDA, `${JSON.stringify(evidencia, null, 2)}\n`);

    console.log(
        `[M07] compatibilidad v1/v2: ${comprobaciones.length - fallidas}/${comprobaciones.length} `
        + `comprobaciones -> artifacts/m07-compatibilidad.json (${resultado})`,
    );

    if (fallidas > 0) {
        comprobaciones
            .filter((c) => c.resultado === 'FAIL')
            .forEach((c) => console.error(`FALLO: ${c.nombre} ${c.detalle}`));
        process.exit(1);
    }
}

main();