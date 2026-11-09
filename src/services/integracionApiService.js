// Servicio integrado de PostgreSQL y DynamoDB para M10.

const crypto = require('node:crypto');

const {
    insertarLectura,
    obtenerLecturasPorSensor,
} = require('./telemetriaService');

const {
    guardarEventoSeguro,
    consultarPorDispositivoSeguro,
} = require('../db/secureDocumentStore');

const {
    ROLES,
} = require('../security/nosqlAccessControl');

const {
    METRICAS_PERMITIDAS,
} = require('../db/eventoValidador');

const {
    TIMEOUT_PREDETERMINADO_MS,
    EntradaInvalidaError,
    RecursoNoEncontradoError,
    conTimeout,
} = require('../api/apiErrors');

const CAMPOS_ENTRADA = Object.freeze([
    'sensor_id',
    'device_id',
    'metric_name',
    'metric_value',
]);

const PATRON_DEVICE_ID = /^NODE-CDRL-[A-Z0-9]{1,20}$/;

function obtenerTimeoutConfigurado() {
    const timeout = Number(
        process.env.API_TIMEOUT_MS
        || TIMEOUT_PREDETERMINADO_MS,
    );

    if (
        !Number.isInteger(timeout)
        || timeout < 1
        || timeout > 30000
    ) {
        return TIMEOUT_PREDETERMINADO_MS;
    }

    return timeout;
}

function validarSensorId(sensorId) {
    if (
        !Number.isSafeInteger(sensorId)
        || sensorId < 1
    ) {
        throw new EntradaInvalidaError(
            'sensor_id debe ser un entero positivo',
        );
    }

    return sensorId;
}

function validarDeviceId(deviceId) {
    if (
        typeof deviceId !== 'string'
        || !PATRON_DEVICE_ID.test(deviceId)
    ) {
        throw new EntradaInvalidaError(
            'device_id debe tener el formato NODE-CDRL-<ID>',
        );
    }

    return deviceId;
}

function validarEntradaCreacion(entrada) {
    if (
        entrada === null
        || typeof entrada !== 'object'
        || Array.isArray(entrada)
    ) {
        throw new EntradaInvalidaError(
            'el cuerpo debe ser un objeto JSON',
        );
    }

    const extras = Object.keys(entrada).filter(
        (campo) => !CAMPOS_ENTRADA.includes(campo),
    );

    if (extras.length > 0) {
        throw new EntradaInvalidaError(
            'el cuerpo contiene campos no permitidos',
        );
    }

    for (const campo of CAMPOS_ENTRADA) {
        if (
            entrada[campo] === undefined
            || entrada[campo] === null
        ) {
            throw new EntradaInvalidaError(
                `falta el campo ${campo}`,
            );
        }
    }

    validarSensorId(entrada.sensor_id);
    validarDeviceId(entrada.device_id);

    if (
        typeof entrada.metric_name !== 'string'
        || !METRICAS_PERMITIDAS.includes(
            entrada.metric_name,
        )
    ) {
        throw new EntradaInvalidaError(
            `metric_name debe ser una de: `
            + METRICAS_PERMITIDAS.join(', '),
        );
    }

    if (
        typeof entrada.metric_value !== 'number'
        || !Number.isFinite(entrada.metric_value)
    ) {
        throw new EntradaInvalidaError(
            'metric_value debe ser un número finito',
        );
    }

    return {
        sensor_id: entrada.sensor_id,
        device_id: entrada.device_id,
        metric_name: entrada.metric_name,
        metric_value: entrada.metric_value,
    };
}

function crearEventoNoSQL(entrada, {
    ahora = Date.now,
    crearId = crypto.randomUUID,
} = {}) {
    return {
        schema_version: 2,
        event_id: `evt_${crearId()}`,
        device_id: entrada.device_id,
        timestamp: ahora(),
        metric_name: entrada.metric_name,
        metric_value: entrada.metric_value,
        firmware_version:
            process.env.API_FIRMWARE_VERSION || '1.0.0',
        quality_score: 1,
    };
}

function normalizarLecturasRelacionales(lecturas) {
    return lecturas.map((lectura) => ({
        ...lectura,
        valor: Number(lectura.valor),
    }));
}

function crearDependencias(sobrescrituras = {}) {
    return {
        insertarLectura:
            sobrescrituras.insertarLectura
            || insertarLectura,

        obtenerLecturas:
            sobrescrituras.obtenerLecturas
            || obtenerLecturasPorSensor,

        guardarEvento:
            sobrescrituras.guardarEvento
            || guardarEventoSeguro,

        consultarEventos:
            sobrescrituras.consultarEventos
            || consultarPorDispositivoSeguro,

        ahora:
            sobrescrituras.ahora
            || Date.now,

        crearId:
            sobrescrituras.crearId
            || crypto.randomUUID,

        timeoutMs:
            sobrescrituras.timeoutMs
            ?? obtenerTimeoutConfigurado(),

        actor:
            sobrescrituras.actor
            || process.env.API_ACTOR
            || 'api-m10',
    };
}

async function crearLecturaIntegrada(
    entradaOriginal,
    sobrescrituras = {},
) {
    const entrada = validarEntradaCreacion(
        entradaOriginal,
    );

    const dependencias = crearDependencias(
        sobrescrituras,
    );

    let lecturaRelacional;

    try {
        lecturaRelacional = await conTimeout(
            () => dependencias.insertarLectura(
                entrada.sensor_id,
                entrada.metric_value,
            ),
            {
                dependencia: 'postgres',
                timeoutMs: dependencias.timeoutMs,
            },
        );
    } catch (error) {
        if (
            error.message
            && error.message.includes('fuera de rango')
        ) {
            throw new EntradaInvalidaError(
                'metric_value está fuera del rango del sensor',
            );
        }

        throw error;
    }

    const evento = crearEventoNoSQL(
        entrada,
        dependencias,
    );

    const resultadoNoSQL = await conTimeout(
        () => dependencias.guardarEvento(
            {
                actor: dependencias.actor,
                rol: ROLES.ESCRITOR,
            },
            evento,
        ),
        {
            dependencia: 'dynamodb',
            timeoutMs: dependencias.timeoutMs,
        },
    );

    return {
        almacenamiento: {
            postgres: true,
            dynamodb: true,
        },
        lectura_relacional: lecturaRelacional,
        evento_nosql: evento,
        escritura_nosql: resultadoNoSQL,
    };
}

async function obtenerEstadoIntegrado(
    {
        sensorId,
        deviceId,
    },
    sobrescrituras = {},
) {
    validarSensorId(sensorId);
    validarDeviceId(deviceId);

    const dependencias = crearDependencias(
        sobrescrituras,
    );

    const [lecturas, eventos] = await Promise.all([
        conTimeout(
            () => dependencias.obtenerLecturas(sensorId),
            {
                dependencia: 'postgres',
                timeoutMs: dependencias.timeoutMs,
            },
        ),

        conTimeout(
            () => dependencias.consultarEventos(
                {
                    actor: dependencias.actor,
                    rol: ROLES.LECTOR,
                },
                deviceId,
            ),
            {
                dependencia: 'dynamodb',
                timeoutMs: dependencias.timeoutMs,
            },
        ),
    ]);

    const lecturasNormalizadas =
        normalizarLecturasRelacionales(lecturas);

    if (
        lecturasNormalizadas.length === 0
        && eventos.length === 0
    ) {
        throw new RecursoNoEncontradoError(
            'no existen lecturas ni eventos para la consulta',
        );
    }

    return {
        sensor_id: sensorId,
        device_id: deviceId,
        estado_relacional: {
            total: lecturasNormalizadas.length,
            lecturas: lecturasNormalizadas,
        },
        eventos_nosql: {
            total: eventos.length,
            eventos,
        },
    };
}

module.exports = {
    CAMPOS_ENTRADA,
    PATRON_DEVICE_ID,
    obtenerTimeoutConfigurado,
    validarSensorId,
    validarDeviceId,
    validarEntradaCreacion,
    crearEventoNoSQL,
    normalizarLecturasRelacionales,
    crearLecturaIntegrada,
    obtenerEstadoIntegrado,
};