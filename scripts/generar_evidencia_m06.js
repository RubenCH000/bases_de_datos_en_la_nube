const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const ARCHIVO_PRUEBAS = 'tests/m06_auditoria_david.test.js';
const DIR_EVIDENCE = path.join(RAIZ, 'evidence');
const RECUPERACION = path.join(RAIZ, 'artifacts', 'm06-recuperacion.json');

function leerJsonSiExiste(ruta) {
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
    const global = ejecucion.status === 0 && pruebas.length > 0 && fallidas === 0
        ? 'PASS'
        : 'FAIL';

    const evidencia = {
        assignmentId: 'M06-auditoria-recuperacion',
        modulo: 'M06 - Auditoría y Recuperación',
        autor: 'David',
        sourceCommitSha: commitActual(),
        fecha: new Date().toISOString(),
        comando: `node --test ${ARCHIVO_PRUEBAS}`,
        duracion_ms: Date.now() - inicio,
        codigo_salida: ejecucion.status,
        total_pruebas: pruebas.length,
        aprobadas,
        fallidas,
        pruebas,
        recuperacion: leerJsonSiExiste(RECUPERACION),
        resultado_global: global,
    };

    fs.mkdirSync(DIR_EVIDENCE, { recursive: true });
    fs.writeFileSync(
        path.join(DIR_EVIDENCE, 'm06-pruebas.json'),
        `${JSON.stringify(evidencia, null, 2)}\n`,
    );

    console.log(
        `[M06] pruebas: ${aprobadas}/${pruebas.length} aprobadas `
        + `-> evidence/m06-pruebas.json (${global})`,
    );

    if (global !== 'PASS') {
        console.error(ejecucion.stdout);
        console.error(ejecucion.stderr);
        process.exit(1);
    }
}

main();