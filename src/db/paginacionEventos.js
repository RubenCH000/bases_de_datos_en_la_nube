// Paginación estable de eventos CDRL para M08.
// El cursor conserva el rango temporal de la primera consulta para evitar que
// eventos nuevos alteren un recorrido que ya comenzó.

const {
    QueryCommand,
} = require('@aws-sdk/lib-dynamodb');

const {
    cliente,
    TABLA,
    INDICES,
} = require('./documentStore');

const {
    normalizarEventos,
} = require('./eventoLector');

const VERSION_CURSOR = 1;
const LIMITE_PREDETERMINADO = 25;
const LIMITE_MAXIMO = 100;

class CursorInvalidoError extends Error {
    constructor(mensaje) {
        super(`cursor inválido: ${mensaje}`);
        this.name = 'CursorInvalidoError';
    }
}

function validarLimite(limite) {
    if (
        !Number.isInteger(limite)
        || limite < 1
        || limite > LIMITE_MAXIMO
    ) {
        throw new CursorInvalidoError(
            `el límite debe ser un entero entre 1 y ${LIMITE_MAXIMO}`,
        );
    }

    return limite;
}

function validarRango(desde, hasta) {
    if (!Number.isInteger(desde) || desde < 0) {
        throw new CursorInvalidoError(
            'desde debe ser un entero mayor o igual que cero',
        );
    }

    if (!Number.isInteger(hasta) || hasta <= 0) {
        throw new CursorInvalidoError(
            'hasta debe ser un entero positivo',
        );
    }

    if (desde > hasta) {
        throw new CursorInvalidoError(
            'desde no puede ser mayor que hasta',
        );
    }
}

function validarUltimaClave(clave) {
    if (
        clave === null
        || typeof clave !== 'object'
        || Array.isArray(clave)
    ) {
        throw new CursorInvalidoError(
            'LastEvaluatedKey no tiene una estructura válida',
        );
    }

    if (
        typeof clave.event_id !== 'string'
        || typeof clave.device_id !== 'string'
        || !Number.isInteger(clave.timestamp)
    ) {
        throw new CursorInvalidoError(
            'LastEvaluatedKey está incompleta',
        );
    }
}

function codificarCursor(contenido) {
    const json = JSON.stringify(contenido);
    return Buffer.from(json, 'utf8').toString('base64url');
}

function decodificarCursor(cursor) {
    if (typeof cursor !== 'string' || cursor.length === 0) {
        throw new CursorInvalidoError('debe ser una cadena no vacía');
    }

    if (
        cursor.length > 4096
        || !/^[A-Za-z0-9_-]+$/.test(cursor)
    ) {
        throw new CursorInvalidoError('el formato Base64URL no es válido');
    }

    let contenido;

    try {
        const json = Buffer.from(cursor, 'base64url').toString('utf8');
        contenido = JSON.parse(json);
    } catch {
        throw new CursorInvalidoError('no contiene un JSON válido');
    }

    if (
        contenido === null
        || typeof contenido !== 'object'
        || Array.isArray(contenido)
    ) {
        throw new CursorInvalidoError('el contenido debe ser un objeto');
    }

    if (contenido.version !== VERSION_CURSOR) {
        throw new CursorInvalidoError(
            `versión no soportada: ${contenido.version}`,
        );
    }

    if (
        typeof contenido.device_id !== 'string'
        || contenido.device_id.length === 0
    ) {
        throw new CursorInvalidoError('falta device_id');
    }

    validarLimite(contenido.limite);
    validarRango(contenido.desde, contenido.hasta);
    validarUltimaClave(contenido.last_evaluated_key);

    return contenido;
}

async function consultarPorDispositivoPaginado(
    deviceId,
    opciones = {},
) {
    if (typeof deviceId !== 'string' || deviceId.trim() === '') {
        throw new CursorInvalidoError('device_id es obligatorio');
    }

    const {
        cursor = null,
        clienteDynamo = cliente,
        tabla = TABLA,
    } = opciones;

    let limite;
    let desde;
    let hasta;
    let ultimaClave;

    if (cursor) {
        const contenido = decodificarCursor(cursor);

        if (contenido.device_id !== deviceId) {
            throw new CursorInvalidoError(
                'el cursor pertenece a otro dispositivo',
            );
        }

        if (
            opciones.limite !== undefined
            && opciones.limite !== contenido.limite
        ) {
            throw new CursorInvalidoError(
                'el límite no coincide con el cursor',
            );
        }

        limite = contenido.limite;
        desde = contenido.desde;
        hasta = contenido.hasta;
        ultimaClave = contenido.last_evaluated_key;
    } else {
        limite = validarLimite(
            opciones.limite ?? LIMITE_PREDETERMINADO,
        );

        desde = opciones.desde ?? 0;

        // La primera página fija una frontera temporal.
        // Los eventos posteriores a esta frontera no entran en el recorrido.
        hasta = Math.min(
            opciones.hasta ?? Date.now(),
            Date.now(),
        );

        validarRango(desde, hasta);
    }

    const respuesta = await clienteDynamo.send(new QueryCommand({
        TableName: tabla,
        IndexName: INDICES.porDispositivo,
        KeyConditionExpression:
            '#device = :device AND #timestamp BETWEEN :desde AND :hasta',
        ExpressionAttributeNames: {
            '#device': 'device_id',
            '#timestamp': 'timestamp',
        },
        ExpressionAttributeValues: {
            ':device': deviceId,
            ':desde': desde,
            ':hasta': hasta,
        },
        ExclusiveStartKey: ultimaClave,
        Limit: limite,
        ScanIndexForward: true,
    }));

    const documentos = respuesta.Items || [];
    const eventos = normalizarEventos(documentos);

    const siguienteCursor = respuesta.LastEvaluatedKey
        ? codificarCursor({
            version: VERSION_CURSOR,
            device_id: deviceId,
            limite,
            desde,
            hasta,
            last_evaluated_key: respuesta.LastEvaluatedKey,
        })
        : null;

    return {
        eventos,
        siguiente_cursor: siguienteCursor,
        cantidad: eventos.length,
        limite,
        rango: {
            desde,
            hasta,
        },
        indice: INDICES.porDispositivo,
    };
}

module.exports = {
    VERSION_CURSOR,
    LIMITE_PREDETERMINADO,
    LIMITE_MAXIMO,
    CursorInvalidoError,
    codificarCursor,
    decodificarCursor,
    consultarPorDispositivoPaginado,
};