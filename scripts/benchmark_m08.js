const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { execSync } = require('node:child_process');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const config = require('../src/db/nosqlConfig');
const {
    cliente,
    TABLA,
    INDICES,
    guardarEvento,
} = require('../src/db/documentStore');
const { normalizarEventos } = require('../src/db/eventoLector');
const {
    LIMITE_PREDETERMINADO,
    consultarPorDispositivoPaginado,
} = require('../src/db/paginacionEventos');
const {
    DISPOSITIVOS_M08,
    EVENTOS_POR_DISPOSITIVO,
    TIMESTAMP_BASE,
    fixturesM08,
} = require('../src/db/cdrlFixturesM08');

const RAIZ = path.join(__dirname, '..');
const DIR_ARTIFACTS = path.join(RAIZ, 'artifacts');
const ARCHIVO_ARTEFACTO = path.join(DIR_ARTIFACTS, 'm08-benchmark.json');

const TAMANO_LOTE_CARGA = 25;
const TAMANO_PAGINA_SCAN = 90;
const ITERACIONES_WARMUP = 2;
const TAMANO_MUESTRA = Number(process.env.BENCHMARK_ITERATIONS || 30);

function detectarEntornoEjecucion(endpoint) {
    const esLocal = /localhost|127\.0\.0\.1|dynamodb/i.test(endpoint || '');
    return {
        modo: esLocal ? 'local' : 'aws',
        es_local: esLocal,
        descripcion: esLocal
            ? 'local (Docker / DynamoDB Local)'
            : 'aws (Amazon DynamoDB Cloud)',
        endpoint: esLocal ? endpoint : 'aws-dynamodb-managed',
        region: config.region,
        node_version: process.version,
        plataforma: process.platform,
        arquitectura: process.arch,
    };
}

function obtenerCommitActual() {
    try {
        return execSync('git rev-parse HEAD', {
            cwd: RAIZ,
            stdio: ['ignore', 'pipe', 'ignore'],
        }).toString().trim();
    } catch {
        return 'desconocido';
    }
}

function redondear(valor, decimales = 3) {
    return Number(valor.toFixed(decimales));
}

function calcularPercentil(tiemposOrdenados, percentil) {
    if (tiemposOrdenados.length === 0) {
        return 0;
    }
    const indice = Math.ceil((percentil / 100) * tiemposOrdenados.length) - 1;
    const posicion = Math.max(0, Math.min(tiemposOrdenados.length - 1, indice));
    return redondear(tiemposOrdenados[posicion]);
}

function calcularEstadisticas(tiemposMs) {
    const ordenados = [...tiemposMs].sort((a, b) => a - b);
    const total = ordenados.reduce((acum, actual) => acum + actual, 0);

    return {
        tamano_muestra: ordenados.length,
        p50_ms: calcularPercentil(ordenados, 50),
        p95_ms: calcularPercentil(ordenados, 95),
        promedio_ms: redondear(total / (ordenados.length || 1)),
        min_ms: redondear(ordenados[0] || 0),
        max_ms: redondear(ordenados[ordenados.length - 1] || 0),
        total_ms: redondear(total),
        muestras_ms: ordenados.map((t) => redondear(t)),
    };
}

async function asegurarFixturesM08() {
    let creados = 0;
    let existentes = 0;

    for (let i = 0; i < fixturesM08.length; i += TAMANO_LOTE_CARGA) {
        const lote = fixturesM08.slice(i, i + TAMANO_LOTE_CARGA);
        const resultados = await Promise.all(
            lote.map((evento) => guardarEvento(evento)),
        );

        for (const res of resultados) {
            if (res.creado) creados += 1;
            if (res.duplicado) existentes += 1;
        }
    }

    return {
        total_fixtures: fixturesM08.length,
        dispositivos: DISPOSITIVOS_M08.length,
        eventos_por_dispositivo: EVENTOS_POR_DISPOSITIVO,
        creados,
        existentes,
    };
}

async function consultarSinIndiceScan(deviceId, { desde, hasta, limite }) {
    const encontrados = [];
    let ultimaClave;
    let itemsEvaluados = 0;
    let paginasScan = 0;

    do {
        const respuesta = await cliente.send(new ScanCommand({
            TableName: TABLA,
            FilterExpression: '#device = :device AND #ts BETWEEN :desde AND :hasta',
            ExpressionAttributeNames: {
                '#device': 'device_id',
                '#ts': 'timestamp',
            },
            ExpressionAttributeValues: {
                ':device': deviceId,
                ':desde': desde,
                ':hasta': hasta,
            },
            Limit: TAMANO_PAGINA_SCAN,
            ExclusiveStartKey: ultimaClave,
        }));

        encontrados.push(...(respuesta.Items || []));
        itemsEvaluados += respuesta.ScannedCount || 0;
        paginasScan += 1;
        ultimaClave = respuesta.LastEvaluatedKey;
    } while (ultimaClave);

    const ordenados = normalizarEventos(encontrados)
        .sort((a, b) => a.timestamp - b.timestamp);

    const pagina = ordenados.slice(0, limite);

    return {
        eventos: pagina,
        cantidad: pagina.length,
        total_coincidencias: ordenados.length,
        items_evaluados: itemsEvaluados,
        operaciones_lectura: paginasScan,
        metodo: 'Scan + FilterExpression (sin índice)',
    };
}

async function consultarConIndiceQuery(deviceId, { desde, hasta, limite }) {
    const respuesta = await consultarPorDispositivoPaginado(deviceId, {
        desde,
        hasta,
        limite,
    });

    return {
        eventos: respuesta.eventos,
        cantidad: respuesta.cantidad,
        siguiente_cursor: respuesta.siguiente_cursor,
        items_evaluados: respuesta.cantidad,
        operaciones_lectura: 1,
        indice: respuesta.indice,
        metodo: `Query + Paginación (${INDICES.porDispositivo})`,
    };
}

async function verificarPaginacionCompleta(deviceId, { desde, hasta, limite }) {
    const ids = new Set();
    let cursor = null;
    let paginas = 0;
    let totalEventos = 0;

    do {
        const pagina = await consultarPorDispositivoPaginado(deviceId, {
            desde,
            hasta,
            limite,
            cursor,
        });

        for (const evento of pagina.eventos) {
            ids.add(evento.event_id);
        }

        totalEventos += pagina.cantidad;
        cursor = pagina.siguiente_cursor;
        paginas += 1;
    } while (cursor !== null);

    if (totalEventos !== EVENTOS_POR_DISPOSITIVO || ids.size !== EVENTOS_POR_DISPOSITIVO) {
        throw new Error(
            `Paginación inconsistente para ${deviceId}: `
            + `esperados=${EVENTOS_POR_DISPOSITIVO}, recibidos=${totalEventos}, únicos=${ids.size}`,
        );
    }

    return {
        paginas_recorridas: paginas,
        eventos_recuperados: totalEventos,
        eventos_unicos: ids.size,
    };
}

async function medirConsulta(nombre, funcionConsulta, iteraciones) {
    for (let i = 0; i < ITERACIONES_WARMUP; i += 1) {
        await funcionConsulta();
    }

    const tiemposMs = [];
    let ultimaRespuesta = null;

    for (let i = 0; i < iteraciones; i += 1) {
        const inicio = performance.now();
        ultimaRespuesta = await funcionConsulta();
        const duracion = performance.now() - inicio;

        if (!ultimaRespuesta || ultimaRespuesta.cantidad === 0) {
            throw new Error(`La consulta "${nombre}" no devolvió eventos en la iteración ${i + 1}`);
        }

        tiemposMs.push(duracion);
    }

    return {
        estadisticas: calcularEstadisticas(tiemposMs),
        ultima_respuesta: ultimaRespuesta,
    };
}

async function ejecutarBenchmark() {
    if (!Number.isInteger(TAMANO_MUESTRA) || TAMANO_MUESTRA < 1) {
        throw new Error('BENCHMARK_ITERATIONS debe ser un entero positivo');
    }

    const fechaInicio = new Date().toISOString();
    const entorno = detectarEntornoEjecucion(config.endpoint);
    const estadoFixtures = await asegurarFixturesM08();

    const dispositivoObjetivo = DISPOSITIVOS_M08[0];
    const rangoConsulta = {
        desde: TIMESTAMP_BASE,
        hasta: TIMESTAMP_BASE + (EVENTOS_POR_DISPOSITIVO * 1000),
        limite: LIMITE_PREDETERMINADO,
    };

    const verificacionPaginacion = await verificarPaginacionCompleta(
        dispositivoObjetivo,
        rangoConsulta,
    );

    const medicionScan = await medirConsulta(
        'linea_base_scan',
        () => consultarSinIndiceScan(dispositivoObjetivo, rangoConsulta),
        TAMANO_MUESTRA,
    );

    const medicionQuery = await medirConsulta(
        'optimizada_query_gsi',
        () => consultarConIndiceQuery(dispositivoObjetivo, rangoConsulta),
        TAMANO_MUESTRA,
    );

    const primerIdScan = medicionScan.ultima_respuesta.eventos[0]?.event_id;
    const primerIdQuery = medicionQuery.ultima_respuesta.eventos[0]?.event_id;

    if (
        medicionScan.ultima_respuesta.cantidad !== medicionQuery.ultima_respuesta.cantidad
        || primerIdScan !== primerIdQuery
    ) {
        throw new Error(
            'Los resultados de Scan y Query no coinciden en cantidad u orden de eventos',
        );
    }

    const p50Scan = medicionScan.estadisticas.p50_ms;
    const p50Query = medicionQuery.estadisticas.p50_ms;
    const p95Scan = medicionScan.estadisticas.p95_ms;
    const p95Query = medicionQuery.estadisticas.p95_ms;

    const ahorroP50Ms = redondear(p50Scan - p50Query);
    const ahorroP95Ms = redondear(p95Scan - p95Query);
    const mejoraP50Pct = p50Scan > 0
        ? redondear(((p50Scan - p50Query) / p50Scan) * 100, 2)
        : 0;
    const mejoraP95Pct = p95Scan > 0
        ? redondear(((p95Scan - p95Query) / p95Scan) * 100, 2)
        : 0;
    const factorVelocidadP50 = p50Query > 0
        ? redondear(p50Scan / p50Query, 2)
        : 1;
    const factorVelocidadP95 = p95Query > 0
        ? redondear(p95Scan / p95Query, 2)
        : 1;

    const itemsScan = medicionScan.ultima_respuesta.items_evaluados;
    const itemsQuery = medicionQuery.ultima_respuesta.items_evaluados;
    const reduccionItemsPct = itemsScan > 0
        ? redondear(((itemsScan - itemsQuery) / itemsScan) * 100, 2)
        : 0;

    const reporte = {
        assignmentId: 'M08-indices-paginacion-benchmark',
        modulo: 'M08 - Optimización de Consultas, Índices y Paginación',
        autor: 'David',
        sourceCommitSha: obtenerCommitActual(),
        fecha_inicio: fechaInicio,
        fecha_fin: new Date().toISOString(),
        tabla: TABLA,
        indice_utilizado: INDICES.porDispositivo,
        entorno,
        parametros_prueba: {
            dispositivo_objetivo: dispositivoObjetivo,
            desde: rangoConsulta.desde,
            hasta: rangoConsulta.hasta,
            limite_pagina: rangoConsulta.limite,
            tamano_muestra: TAMANO_MUESTRA,
            iteraciones_warmup: ITERACIONES_WARMUP,
        },
        eventos_procesados: {
            fixtures_m08_totales: estadoFixtures.total_fixtures,
            dispositivos_m08: estadoFixtures.dispositivos,
            eventos_por_dispositivo: estadoFixtures.eventos_por_dispositivo,
            eventos_devueltos_por_consulta: medicionQuery.ultima_respuesta.cantidad,
            items_evaluados_por_scan: itemsScan,
            items_evaluados_por_query: itemsQuery,
            total_eventos_evaluados_scan: itemsScan * TAMANO_MUESTRA,
            total_eventos_evaluados_query: itemsQuery * TAMANO_MUESTRA,
            verificacion_paginacion_completa: verificacionPaginacion,
        },
        linea_base_scan: {
            descripcion: medicionScan.ultima_respuesta.metodo,
            usa_indice: false,
            items_evaluados_por_consulta: itemsScan,
            operaciones_lectura_por_consulta: medicionScan.ultima_respuesta.operaciones_lectura,
            ...medicionScan.estadisticas,
        },
        consulta_optimizada_query: {
            descripcion: medicionQuery.ultima_respuesta.metodo,
            usa_indice: true,
            indice: INDICES.porDispositivo,
            items_evaluados_por_consulta: itemsQuery,
            operaciones_lectura_por_consulta: medicionQuery.ultima_respuesta.operaciones_lectura,
            ...medicionQuery.estadisticas,
        },
        comparacion_rendimiento: {
            ahorro_p50_ms: ahorroP50Ms,
            ahorro_p95_ms: ahorroP95Ms,
            mejora_p50_porcentaje: mejoraP50Pct,
            mejora_p95_porcentaje: mejoraP95Pct,
            factor_velocidad_p50: `${factorVelocidadP50}x`,
            factor_velocidad_p95: `${factorVelocidadP95}x`,
            reduccion_items_evaluados_porcentaje: reduccionItemsPct,
            resumen:
                `Query con índice (${INDICES.porDispositivo}) mejoró p50 en ${mejoraP50Pct}% `
                + `(${p50Scan} ms -> ${p50Query} ms, ${factorVelocidadP50}x) y p95 en ${mejoraP95Pct}% `
                + `(${p95Scan} ms -> ${p95Query} ms), reduciendo los documentos evaluados en ${reduccionItemsPct}% `
                + `(${itemsScan} -> ${itemsQuery} por consulta).`,
        },
        resultado: 'exito',
    };

    fs.mkdirSync(DIR_ARTIFACTS, { recursive: true });
    fs.writeFileSync(ARCHIVO_ARTEFACTO, `${JSON.stringify(reporte, null, 2)}\n`);

    console.log(`[M08] Entorno: ${entorno.descripcion} | Node ${entorno.node_version}`);
    console.log(
        `[M08] Muestra: ${TAMANO_MUESTRA} iteraciones | `
        + `Fixtures M08: ${estadoFixtures.total_fixtures} eventos`,
    );
    console.log(
        `[M08] Línea base (Scan sin índice): p50=${p50Scan} ms, p95=${p95Scan} ms `
        + `(${itemsScan} docs evaluados/consulta)`,
    );
    console.log(
        `[M08] Optimizada (Query GSI + paginación): p50=${p50Query} ms, p95=${p95Query} ms `
        + `(${itemsQuery} docs evaluados/consulta)`,
    );
    console.log(`[M08] Mejora: ${reporte.comparacion_rendimiento.resumen}`);
    console.log('[M08] Artefacto generado en artifacts/m08-benchmark.json');

    return reporte;
}

if (require.main === module) {
    ejecutarBenchmark().catch((error) => {
        console.error(`[M08] Fallo catastrófico en benchmark: ${error.message}`);
        process.exit(1);
    });
}

module.exports = {
    ejecutarBenchmark,
};