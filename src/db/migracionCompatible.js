// Migración compatible de documentos CDRL para M07.
// Los documentos antiguos sin schema_version se identifican como versión 1.
// La migración no modifica ningún otro dato del evento.

const { ConditionalCheckFailedException } = require('@aws-sdk/client-dynamodb');
const {
    ScanCommand,
    UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');

const {
    cliente,
    TABLA,
} = require('./documentStore');

const {
    validarEvento,
    VERSIONES_SOPORTADAS,
} = require('./eventoValidador');

class DocumentoNoMigrableError extends Error {
    constructor(mensaje, eventId = null) {
        super(mensaje);
        this.name = 'DocumentoNoMigrableError';
        this.eventId = eventId;
    }
}

function esFalloCondicion(error) {
    return error instanceof ConditionalCheckFailedException
        || error.name === 'ConditionalCheckFailedException';
}

function detectarEstadoMigracion(documento) {
    if (documento === null || typeof documento !== 'object' || Array.isArray(documento)) {
        throw new DocumentoNoMigrableError('el documento debe ser un objeto');
    }

    if (typeof documento.event_id !== 'string' || documento.event_id.trim() === '') {
        throw new DocumentoNoMigrableError('el documento no tiene un event_id válido');
    }

    if (
        documento.schema_version !== undefined
        && !VERSIONES_SOPORTADAS.includes(documento.schema_version)
    ) {
        throw new DocumentoNoMigrableError(
            `schema_version no soportada: ${documento.schema_version}`,
            documento.event_id,
        );
    }

    const resultado = validarEvento(documento);

    if (!resultado.valido) {
        throw new DocumentoNoMigrableError(
            `documento inválido: ${resultado.errores.join('; ')}`,
            documento.event_id,
        );
    }

    if (documento.schema_version === undefined) {
        return {
            estado: 'candidato',
            event_id: documento.event_id,
            version_origen: 1,
        };
    }

    return {
        estado: 'omitido',
        event_id: documento.event_id,
        version_origen: documento.schema_version,
    };
}

async function listarDocumentos({
    clienteDynamo = cliente,
    tabla = TABLA,
} = {}) {
    const documentos = [];
    let ultimaClave;

    do {
        const respuesta = await clienteDynamo.send(new ScanCommand({
            TableName: tabla,
            ExclusiveStartKey: ultimaClave,
        }));

        documentos.push(...(respuesta.Items || []));
        ultimaClave = respuesta.LastEvaluatedKey;
    } while (ultimaClave);

    return documentos;
}

async function migrarDocumentosSinVersion({
    clienteDynamo = cliente,
    tabla = TABLA,
    documentos,
} = {}) {
    const documentosRevisados = documentos || await listarDocumentos({
        clienteDynamo,
        tabla,
    });

    const resultado = {
        revisados: documentosRevisados.length,
        candidatos: 0,
        migrados: 0,
        omitidos: 0,
        eventos_migrados: [],
        errores: [],
    };

    for (const documento of documentosRevisados) {
        let estado;

        try {
            estado = detectarEstadoMigracion(documento);
        } catch (error) {
            resultado.errores.push({
                event_id: documento?.event_id || null,
                tipo: error.name,
                mensaje: error.message,
            });
            continue;
        }

        if (estado.estado === 'omitido') {
            resultado.omitidos += 1;
            continue;
        }

        resultado.candidatos += 1;

        try {
            await clienteDynamo.send(new UpdateCommand({
                TableName: tabla,
                Key: {
                    event_id: documento.event_id,
                },
                UpdateExpression: 'SET schema_version = :version',
                ConditionExpression:
                    'attribute_exists(event_id) AND attribute_not_exists(schema_version)',
                ExpressionAttributeValues: {
                    ':version': 1,
                },
            }));

            resultado.migrados += 1;
            resultado.eventos_migrados.push(documento.event_id);
        } catch (error) {
            if (esFalloCondicion(error)) {
                resultado.omitidos += 1;
                continue;
            }

            resultado.errores.push({
                event_id: documento.event_id,
                tipo: error.name || 'Error',
                mensaje: error.message,
            });
        }
    }

    return resultado;
}

async function revertirDocumentosMigrados(
    eventIds,
    {
        clienteDynamo = cliente,
        tabla = TABLA,
    } = {},
) {
    const idsUnicos = [...new Set(eventIds)];

    const resultado = {
        solicitados: idsUnicos.length,
        restaurados: 0,
        omitidos: 0,
        errores: [],
    };

    for (const eventId of idsUnicos) {
        if (typeof eventId !== 'string' || eventId.trim() === '') {
            resultado.errores.push({
                event_id: eventId || null,
                tipo: 'DocumentoNoMigrableError',
                mensaje: 'event_id inválido para rollback',
            });
            continue;
        }

        try {
            await clienteDynamo.send(new UpdateCommand({
                TableName: tabla,
                Key: {
                    event_id: eventId,
                },
                UpdateExpression: 'REMOVE schema_version',
                ConditionExpression:
                    'attribute_exists(event_id) AND schema_version = :version',
                ExpressionAttributeValues: {
                    ':version': 1,
                },
            }));

            resultado.restaurados += 1;
        } catch (error) {
            if (esFalloCondicion(error)) {
                resultado.omitidos += 1;
                continue;
            }

            resultado.errores.push({
                event_id: eventId,
                tipo: error.name || 'Error',
                mensaje: error.message,
            });
        }
    }

    return resultado;
}

module.exports = {
    DocumentoNoMigrableError,
    detectarEstadoMigracion,
    listarDocumentos,
    migrarDocumentosSinVersion,
    revertirDocumentosMigrados,
};