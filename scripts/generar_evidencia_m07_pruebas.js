// Corre las pruebas de M07 y junta en evidence/m07-pruebas.json su resultado
// con los artifacts de migración, rollback y compatibilidad generados en verify.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const ARCHIVO_PRUEBAS = 'tests/m07_compatibilidad.test.js';
const DIR_EVIDENCE = path.join(RAIZ, 'evidence');
const DIR_ARTIFACTS = path.join(RAIZ, 'artifacts');

function leerJsonSiExiste(nombre) {
    const ruta = path.join(DIR_ARTIFACTS, nombre);

    if (!fs.existsSync(ruta)) {
        return null;
    }

    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
}

function commitActual() {
    try {
        return execSync('git rev-parse HEAD', { cwd: RAIZ }).toString().trim();
    } catch {
        return 'desconocido';
    }
}

function parsearTap(salida) {
    const pruebas = [];

    for (const linea of salida.split(/\r?\n/)) {
        const coincidencia = /^\s+(not ok|ok) \d+ - (.+?)(?: # .*)?$/.exec(linea);

        if (coincidencia) {
            pruebas.push({
                nombre: coincidencia[2],
                resultado: coincidencia[1] === 'ok' ? 'PASS' : 'FAIL',
            });
        }
    }

    return pruebas;
}

function resumenArtifact(contenido) {
    return contenido ? contenido.resultado : 'no generado';
}

function main() {
    const inicio = Date.now();
    const ejecucion = spawnSync(
        process.execPath,
        ['--test', '--test-reporter=tap', ARCHIVO_PRUEBAS],
        { cwd: RAIZ, encoding: 'utf8' },
    );

    const pruebas = parsearTap(ejecucion.stdout || '');
    const fallidas = pruebas.filter((prueba) => prueba.resultado === 'FAIL').length;
    const aprobadas = pruebas.length - fallidas;

    const migracion = leerJsonSiExiste('m07-migracion.json');
    const rollback = leerJsonSiExiste('m07-rollback.json');
    const compatibilidad = leerJsonSiExiste('m07-compatibilidad.json');
    const artifactsOk = [migracion, rollback, compatibilidad]
        .every((artifact) => artifact && artifact.resultado === 'exito');

    const global = ejecucion.status === 0 && pruebas.length > 0 && fallidas === 0 && artifactsOk
        ? 'PASS'
        : 'FAIL';

    const evidencia = {
        assignmentId: 'M07-evolucion-compatible',
        modulo: 'M07 - Evolución compatible de documentos',
        autor: 'Maria',
        sourceCommitSha: commitActual(),
        fecha: new Date().toISOString(),
        comando: `node --test ${ARCHIVO_PRUEBAS}`,
        duracion_ms: Date.now() - inicio,
        codigo_salida: ejecucion.status,
        total_pruebas: pruebas.length,
        aprobadas,
        fallidas,
        pruebas,
        criterios: {
            version_anterior_legible: compatibilidad
                ? compatibilidad.resumen_lote_mixto.v1 > 0 && compatibilidad.resultado === 'exito'
                : false,
            migracion_repetible: migracion ? migracion.repetible === true : false,
            consumidor_anterior_conservado: migracion ? migracion.consumidor_anterior_conservado === true : false,
            rollback_probado: rollback ? rollback.resultado === 'exito' : false,
        },
        artifacts: {
            'm07-migracion.json': resumenArtifact(migracion),
            'm07-rollback.json': resumenArtifact(rollback),
            'm07-compatibilidad.json': resumenArtifact(compatibilidad),
        },
        resultado_global: global,
    };

    fs.mkdirSync(DIR_EVIDENCE, { recursive: true });
    fs.writeFileSync(
        path.join(DIR_EVIDENCE, 'm07-pruebas.json'),
        `${JSON.stringify(evidencia, null, 2)}\n`,
    );

    console.log(
        `[M07] pruebas: ${aprobadas}/${pruebas.length} aprobadas `
        + `-> evidence/m07-pruebas.json (${global})`,
    );

    if (global !== 'PASS') {
        console.error(ejecucion.stdout);
        console.error(ejecucion.stderr);
        process.exit(1);
    }
}

main();
