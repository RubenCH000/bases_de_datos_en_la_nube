// Registro de auditoría para operaciones NoSQL.
// Solo guarda metadatos operativos; nunca documentos, credenciales o secretos.

const crypto = require('node:crypto');

const {
    PutCommand,
    ScanCommand,
} = require('@aws-sdk/lib-dynamodb');

const config = require('./nosqlConfig');
const { cliente } = require('./documentStore');

const TABLA_AUDITORIA = config.auditTable;

const RESULTADOS_PERMITIDOS = Object.freeze([
    'exito',
    'fallo',
    'denegado',
]);

function validarTexto(valor, campo) {
    if (typeof valor !== 'string' || valor.trim() === '') {
        throw new Error(`${campo} debe ser un texto no vacío`);
    }

    return valor.trim();
}

function validarRegistro({
    actor,
    accion,
    recurso,
    documentosAfectados,
    resultado,
}) {
    validarTexto(actor, 'actor');
    validarTexto(accion, 'accion');
    validarTexto(recurso, 'recurso');

    if (
        !Number.isInteger(documentosAfectados)
        || documentosAfectados < 0
    ) {
        throw new Error(
            'documentosAfectados debe ser un entero mayor o igual a cero',
        );
    }

    if (!RESULTADOS_PERMITIDOS.includes(resultado)) {
        throw new Error(
            'resultado debe ser exito, fallo o denegado',
        );
    }
}

async function registrarAuditoria({
    actor,
    accion,
    recurso = config.table,
    documentosAfectados,
    resultado,
}) {
    validarRegistro({
        actor,
        accion,
        recurso,
        documentosAfectados,
        resultado,
    });

    const registro = {
        audit_id: `audit_${crypto.randomUUID()}`,
        actor: actor.trim(),
        accion: accion.trim(),
        recurso: recurso.trim(),
        fecha: new Date().toISOString(),
        documentos_afectados: documentosAfectados,
        resultado,
    };

    await cliente.send(new PutCommand({
        TableName: TABLA_AUDITORIA,
        Item: registro,
        ConditionExpression: 'attribute_not_exists(audit_id)',
    }));

    return registro;
}

async function listarAuditoria() {
    const registros = [];
    let ultimaClave;

    do {
        const respuesta = await cliente.send(new ScanCommand({
            TableName: TABLA_AUDITORIA,
            ExclusiveStartKey: ultimaClave,
        }));

        registros.push(...(respuesta.Items || []));
        ultimaClave = respuesta.LastEvaluatedKey;
    } while (ultimaClave);

    return registros.sort(
        (a, b) => a.fecha.localeCompare(b.fecha),
    );
}

module.exports = {
    TABLA_AUDITORIA,
    RESULTADOS_PERMITIDOS,
    validarRegistro,
    registrarAuditoria,
    listarAuditoria,
};
