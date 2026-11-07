// Corre las pruebas de M09 y junta en evidence/m09-pruebas.json su resultado
// con la remediación auditada de artifacts/m09-remediacion.json
// (scripts/remediacion_m09.js, que corre contra DynamoDB Local).
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const ARCHIVO_PRUEBAS = 'tests/m09_seguridad.test.js';
const DIR_EVIDENCE = path.join(RAIZ, 'evidence');
const ARCHIVO_REMEDIACION = path.join(RAIZ, 'artifacts', 'm09-remediacion.json');

const CAMPOS_AUDITORIA = ['actor', 'accion', 'recurso', 'resultado'];

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

function leerRemediacion() {
    if (!fs.existsSync(ARCHIVO_REMEDIACION)) {
        return null;
    }

    return JSON.parse(fs.readFileSync(ARCHIVO_REMEDIACION, 'utf8'));
}

function pasa(pruebas, prefijo) {
    return pruebas.some((prueba) => prueba.nombre.startsWith(prefijo)
        && prueba.resultado === 'PASS');
}

function resumenRemediacion(remediacion) {
    if (!remediacion) {
        return 'no generado';
    }

    const eventos = remediacion.auditoria.eventos;

    return {
        resultado: remediacion.resultado,
        vulnerabilidad_inicial: remediacion.vulnerabilidad_inicial.descripcion,
        remediacion: remediacion.remediacion.descripcion,
        escritura_no_autorizada_denegada: remediacion.remediacion.escritura_no_autorizada_denegada,
        lectura_no_autorizada_denegada: remediacion.remediacion.lectura_no_autorizada_denegada,
        eventos_auditados: eventos.length,
        resultados_auditados: eventos.map((evento) => `${evento.actor} ${evento.accion} -> ${evento.resultado}`),
        auditoria_contiene_secretos: remediacion.auditoria.contiene_secretos,
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

    const remediacion = leerRemediacion();
    const eventosReales = remediacion ? remediacion.auditoria.eventos : [];

    const criterios = {
        lecturas_no_autorizadas_fallan: pasa(pruebas, '3.')
            && remediacion?.remediacion.lectura_no_autorizada_denegada === true,
        escrituras_no_autorizadas_fallan: pasa(pruebas, '3.')
            && remediacion?.remediacion.escritura_no_autorizada_denegada === true,
        minimo_privilegio_por_coleccion_y_operacion: pasa(pruebas, '2.'),
        eventos_con_actor_accion_recurso_resultado: pasa(pruebas, '1.')
            && eventosReales.length > 0
            && eventosReales.every((evento) => CAMPOS_AUDITORIA.every((campo) => Boolean(evento[campo]))),
        auditoria_sin_secretos: pasa(pruebas, '5.')
            && remediacion?.auditoria.contiene_secretos === false,
        remediacion_documentada_y_probada: pasa(pruebas, '4.')
            && remediacion?.vulnerabilidad_inicial.escritura_indebida_permitida === true
            && remediacion?.resultado === 'exito',
        fallo_declarado_no_se_oculta: pasa(pruebas, '6.'),
    };

    const global = ejecucion.status === 0
        && pruebas.length > 0
        && fallidas === 0
        && Object.values(criterios).every(Boolean)
        ? 'PASS'
        : 'FAIL';

    const evidencia = {
        assignmentId: 'M09-seguridad-nosql-auditoria',
        modulo: 'M09 - Seguridad NoSQL y auditoría',
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
        remediacion_contra_dynamodb_local: resumenRemediacion(remediacion),
        resultado_global: global,
    };

    fs.mkdirSync(DIR_EVIDENCE, { recursive: true });
    fs.writeFileSync(
        path.join(DIR_EVIDENCE, 'm09-pruebas.json'),
        `${JSON.stringify(evidencia, null, 2)}\n`,
    );

    console.log(
        `[M09] pruebas: ${aprobadas}/${pruebas.length} aprobadas `
        + `-> evidence/m09-pruebas.json (${global})`,
    );

    if (global !== 'PASS') {
        console.error(ejecucion.stdout);
        console.error(ejecucion.stderr);
        process.exit(1);
    }
}

main();
