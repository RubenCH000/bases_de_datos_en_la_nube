// Almacén documental de eventos CDRL sobre DynamoDB (M05).
// Valida cada documento antes de escribir, usa los índices declarados en el ADR
// y hace idempotentes las operaciones que se pueden reintentar.
const { DynamoDBClient, ConditionalCheckFailedException } = require('@aws-sdk/client-dynamodb');
const {
    DynamoDBDocumentClient,
    PutCommand,
    GetCommand,
    UpdateCommand,
    DeleteCommand,
    QueryCommand,
} = require('@aws-sdk/lib-dynamodb');
const config = require('./nosqlConfig');
const { validarEvento, EventoInvalidoError } = require('./eventoValidador');
const { normalizarEvento, normalizarEventos } = require('./eventoLector');

const TABLA = config.table;

const INDICES = {
    porDispositivo: 'gsi_device_timestamp',
    porMetrica: 'gsi_metric_timestamp',
};

class EventoDuplicadoError extends Error {
    constructor(eventId) {
        super(`ya existe el evento ${eventId} con contenido distinto`);
        this.name = 'EventoDuplicadoError';
        this.eventId = eventId;
    }
}

function esLocal(endpoint) {
    return /localhost|127\.0\.0\.1|dynamodb/.test(endpoint);
}

// DynamoDB Local acepta cualquier credencial; en AWS se usan las del entorno.
function credencialesLocales() {
    if (process.env.AWS_ACCESS_KEY_ID || !esLocal(config.endpoint)) {
        return undefined;
    }
    return { accessKeyId: 'local', secretAccessKey: 'local' };
}

const clienteBase = new DynamoDBClient({
    endpoint: config.endpoint,
    region: config.region,
    credentials: credencialesLocales(),
});

const cliente = DynamoDBDocumentClient.from(clienteBase);

// Se comparan las formas normalizadas para que un reintento v1 y uno v2 se distingan.
function mismoContenido(a, b) {
    const na = normalizarEvento(a);
    const nb = normalizarEvento(b);
    return Object.keys(na).every((campo) => na[campo] === nb[campo]);
}

async function guardarEvento(evento) {
    const { valido, errores } = validarEvento(evento);
    if (!valido) {
        throw new EventoInvalidoError(errores);
    }

    try {
        await cliente.send(new PutCommand({
            TableName: TABLA,
            Item: evento,
            ConditionExpression: 'attribute_not_exists(event_id)',
        }));
        return { creado: true, duplicado: false };
    } catch (error) {
        if (!(error instanceof ConditionalCheckFailedException)) {
            throw error;
        }
    }

    // Reintento del mismo documento: no se vuelve a escribir.
    const existente = await obtenerEvento(evento.event_id);
    if (existente && mismoContenido(existente, evento)) {
        return { creado: false, duplicado: true };
    }
    throw new EventoDuplicadoError(evento.event_id);
}

async function obtenerEvento(eventId) {
    const respuesta = await cliente.send(new GetCommand({
        TableName: TABLA,
        Key: { event_id: eventId },
        ConsistentRead: true,
    }));
    return respuesta.Item || null;
}

// Lectura para la aplicación: siempre devuelve la forma de la versión actual (M06).
async function obtenerEventoNormalizado(eventId) {
    return normalizarEvento(await obtenerEvento(eventId));
}

async function actualizarValor(eventId, metricValue) {
    if (typeof metricValue !== 'number' || !Number.isFinite(metricValue)) {
        throw new EventoInvalidoError(['metric_value debe ser un numero finito']);
    }

    try {
        const respuesta = await cliente.send(new UpdateCommand({
            TableName: TABLA,
            Key: { event_id: eventId },
            UpdateExpression: 'SET metric_value = :valor',
            ConditionExpression: 'attribute_exists(event_id)',
            ExpressionAttributeValues: { ':valor': metricValue },
            ReturnValues: 'ALL_NEW',
        }));
        return respuesta.Attributes;
    } catch (error) {
        if (error instanceof ConditionalCheckFailedException) {
            return null;
        }
        throw error;
    }
}

async function eliminarEvento(eventId) {
    const respuesta = await cliente.send(new DeleteCommand({
        TableName: TABLA,
        Key: { event_id: eventId },
        ReturnValues: 'ALL_OLD',
    }));
    return { eliminado: Boolean(respuesta.Attributes) };
}

async function consultarPorIndice(indice, atributo, valor, desde, hasta) {
    const respuesta = await cliente.send(new QueryCommand({
        TableName: TABLA,
        IndexName: indice,
        KeyConditionExpression: '#clave = :valor AND #ts BETWEEN :desde AND :hasta',
        ExpressionAttributeNames: { '#clave': atributo, '#ts': 'timestamp' },
        ExpressionAttributeValues: { ':valor': valor, ':desde': desde, ':hasta': hasta },
        ScanIndexForward: true,
    }));
    return respuesta.Items || [];
}

// Consulta del ADR: eventos de un dispositivo en una ventana de tiempo.
function consultarPorDispositivo(deviceId, { desde = 0, hasta = Number.MAX_SAFE_INTEGER } = {}) {
    return consultarPorIndice(INDICES.porDispositivo, 'device_id', deviceId, desde, hasta);
}

// Consulta del ADR: lecturas de una métrica en una ventana de tiempo.
function consultarPorMetrica(metricName, { desde = 0, hasta = Number.MAX_SAFE_INTEGER } = {}) {
    return consultarPorIndice(INDICES.porMetrica, 'metric_name', metricName, desde, hasta);
}

async function consultarPorDispositivoNormalizado(deviceId, rango) {
    return normalizarEventos(await consultarPorDispositivo(deviceId, rango));
}

module.exports = {
    TABLA,
    INDICES,
    clienteBase,
    cliente,
    guardarEvento,
    obtenerEvento,
    obtenerEventoNormalizado,
    actualizarValor,
    eliminarEvento,
    consultarPorDispositivo,
    consultarPorMetrica,
    consultarPorDispositivoNormalizado,
    EventoDuplicadoError,
    EventoInvalidoError,
};
