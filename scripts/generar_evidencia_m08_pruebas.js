// Corre las pruebas de M08 y junta en evidence/m08-pruebas.json su resultado
// con el benchmark de artifacts/m08-benchmark.json generado en verify.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const ARCHIVO_PRUEBAS = 'tests/m08_paginacion.test.js';
const DIR_EVIDENCE = path.join(RAIZ, 'evidence');
const ARCHIVO_BENCHMARK = path.join(RAIZ, 'artifacts', 'm08-benchmark.json');

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

function leerBenchmark() {
    if (!fs.existsSync(ARCHIVO_BENCHMARK)) {
        return null;
    }

    return JSON.parse(fs.readFileSync(ARCHIVO_BENCHMARK, 'utf8'));
}

function resumenBenchmark(benchmark) {
    if (!benchmark) {
        return 'no generado';
    }

    const scan = benchmark.linea_base_scan;
    const query = benchmark.consulta_optimizada_query;

    return {
        resultado: benchmark.resultado,
        entorno: benchmark.entorno.descripcion,
        tamano_muestra: benchmark.parametros_prueba.tamano_muestra,
        limite_pagina: benchmark.parametros_prueba.limite_pagina,
        scan_sin_indice: {
            p50_ms: scan.p50_ms,
            p95_ms: scan.p95_ms,
            items_evaluados_por_consulta: scan.items_evaluados_por_consulta,
        },
        query_con_indice: {
            p50_ms: query.p50_ms,
            p95_ms: query.p95_ms,
            items_evaluados_por_consulta: query.items_evaluados_por_consulta,
        },
        mejora: benchmark.comparacion_rendimiento.resumen,
    };
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

    const benchmark = leerBenchmark();
    const paginacionReal = benchmark
        ? benchmark.eventos_procesados.verificacion_paginacion_completa
        : null;

    const criterios = {
        paginacion_estable_sin_duplicados: Boolean(paginacionReal)
            && paginacionReal.eventos_unicos === paginacionReal.eventos_recuperados,
        cursor_invalido_rechazado: pruebas.some((prueba) => prueba.nombre.startsWith('4.')
            && prueba.resultado === 'PASS'),
        benchmark_con_p50_p95: Boolean(benchmark)
            && Number.isFinite(benchmark.linea_base_scan.p95_ms)
            && Number.isFinite(benchmark.consulta_optimizada_query.p95_ms),
        linea_base_vs_indice: Boolean(benchmark)
            && benchmark.linea_base_scan.usa_indice === false
            && benchmark.consulta_optimizada_query.usa_indice === true,
        entorno_y_muestra_declarados: Boolean(benchmark)
            && Boolean(benchmark.entorno.descripcion)
            && benchmark.parametros_prueba.tamano_muestra > 0,
    };

    const global = ejecucion.status === 0
        && pruebas.length > 0
        && fallidas === 0
        && benchmark?.resultado === 'exito'
        && Object.values(criterios).every(Boolean)
        ? 'PASS'
        : 'FAIL';

    const evidencia = {
        assignmentId: 'M08-indices-paginacion',
        modulo: 'M08 - Paginación, índices y rendimiento',
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
        criterios,
        paginacion_contra_dynamodb_local: paginacionReal || 'no generado',
        benchmark: resumenBenchmark(benchmark),
        resultado_global: global,
    };

    fs.mkdirSync(DIR_EVIDENCE, { recursive: true });
    fs.writeFileSync(
        path.join(DIR_EVIDENCE, 'm08-pruebas.json'),
        `${JSON.stringify(evidencia, null, 2)}\n`,
    );

    console.log(
        `[M08] pruebas: ${aprobadas}/${pruebas.length} aprobadas `
        + `-> evidence/m08-pruebas.json (${global})`,
    );

    if (global !== 'PASS') {
        console.error(ejecucion.stdout);
        console.error(ejecucion.stderr);
        process.exit(1);
    }
}

main();
