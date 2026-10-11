// Registro de auditoría de las operaciones de recuperación de M06.
const crypto = require('node:crypto');
const {
    PutCommand,
    ScanCommand,
} = require('@aws-sdk/lib-dynamodb');

const config = require('./nosqlConfig');
const { cliente } = require('./documentStore');

const TABLA_AUDITORIA = config.auditTable;
const RESULTADOS_PERMITIDOS = ['exito', 'fallo'];

function validarRegistro({
    actor,
    accion,
    documentosAfectados,
    resultado,
}) {
    if (typeof actor !== 'string' || actor.trim() === '') {
        throw new Error('actor debe ser un texto no vacío');
    }

    if (typeof accion !== 'string' || accion.trim() === '') {
        throw new Error('accion debe ser un texto no vacío');
    }

    if (!Number.isInteger(documentosAfectados) || documentosAfectados < 0) {
        throw new Error('documentosAfectados debe ser un entero mayor o igual a cero');
    }

    if (!RESULTADOS_PERMITIDOS.includes(resultado)) {
        throw new Error('resultado debe ser exito o fallo');
    }
}

async function registrarAuditoria({
    actor,
    accion,
    documentosAfectados,
    resultado,
}) {
    validarRegistro({
        actor,
        accion,
        documentosAfectados,
        resultado,
    });

    const registro = {
        audit_id: `audit_${crypto.randomUUID()}`,
        actor: actor.trim(),
        accion: accion.trim(),
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

    return registros.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

module.exports = {
    TABLA_AUDITORIA,
    registrarAuditoria,
    listarAuditoria,
};