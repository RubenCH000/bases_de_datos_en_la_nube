// Validación del documento de evento CDRL antes de guardarlo en el almacén documental.
// M05: estructura base del evento. M06: se agrega schema_version y la versión 2
// con firmware_version y quality_score. Los documentos v1 siguen siendo válidos.

const CAMPOS = ['event_id', 'device_id', 'timestamp', 'metric_name', 'metric_value'];
const CAMPOS_V2 = ['firmware_version', 'quality_score'];
const METRICAS_PERMITIDAS = ['cpu_temperature', 'battery_voltage'];

const VERSION_ACTUAL = 2;
const VERSIONES_SOPORTADAS = [1, 2];

const PATRON_EVENT_ID = /^evt_[A-Za-z0-9_-]{1,60}$/;
const PATRON_DEVICE_ID = /^NODE-CDRL-[A-Z0-9]{1,20}$/;
const PATRON_FIRMWARE = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;

// Un documento sin schema_version se escribió antes de M06, por eso se toma como v1.
function detectarVersion(evento) {
    return evento.schema_version === undefined ? 1 : evento.schema_version;
}

function camposPermitidos(version) {
    const base = [...CAMPOS, 'schema_version'];
    return version === 2 ? [...base, ...CAMPOS_V2] : base;
}

function validarCamposV2(evento, errores) {
    for (const campo of CAMPOS_V2) {
        if (evento[campo] === undefined || evento[campo] === null) {
            errores.push(`falta el campo ${campo} (requerido en schema_version 2)`);
        }
    }

    if (evento.firmware_version !== undefined && evento.firmware_version !== null
        && !(typeof evento.firmware_version === 'string' && PATRON_FIRMWARE.test(evento.firmware_version))) {
        errores.push('firmware_version debe tener el formato X.Y.Z');
    }

    if (evento.quality_score !== undefined && evento.quality_score !== null
        && !(typeof evento.quality_score === 'number' && evento.quality_score >= 0 && evento.quality_score <= 1)) {
        errores.push('quality_score debe ser un numero entre 0 y 1');
    }
}

function validarEvento(evento) {
    const errores = [];

    if (evento === null || typeof evento !== 'object' || Array.isArray(evento)) {
        return { valido: false, version: null, errores: ['el evento debe ser un objeto'] };
    }

    const version = detectarVersion(evento);
    if (!VERSIONES_SOPORTADAS.includes(version)) {
        return {
            valido: false,
            version: null,
            errores: [`schema_version no soportada: ${version} (soportadas: ${VERSIONES_SOPORTADAS.join(', ')})`],
        };
    }

    for (const campo of CAMPOS) {
        if (evento[campo] === undefined || evento[campo] === null) {
            errores.push(`falta el campo ${campo}`);
        }
    }

    const permitidos = camposPermitidos(version);
    const extras = Object.keys(evento).filter((campo) => !permitidos.includes(campo));
    if (extras.length > 0) {
        errores.push(`campos no permitidos en schema_version ${version}: ${extras.join(', ')}`);
    }

    if (evento.event_id !== undefined && !(typeof evento.event_id === 'string' && PATRON_EVENT_ID.test(evento.event_id))) {
        errores.push('event_id debe tener el formato evt_<id>');
    }

    if (evento.device_id !== undefined && !(typeof evento.device_id === 'string' && PATRON_DEVICE_ID.test(evento.device_id))) {
        errores.push('device_id debe tener el formato NODE-CDRL-<id>');
    }

    if (evento.timestamp !== undefined && !(Number.isInteger(evento.timestamp) && evento.timestamp > 0)) {
        errores.push('timestamp debe ser un entero positivo en milisegundos');
    }

    if (evento.metric_name !== undefined && !METRICAS_PERMITIDAS.includes(evento.metric_name)) {
        errores.push(`metric_name debe ser una de: ${METRICAS_PERMITIDAS.join(', ')}`);
    }

    if (evento.metric_value !== undefined && !(typeof evento.metric_value === 'number' && Number.isFinite(evento.metric_value))) {
        errores.push('metric_value debe ser un numero finito');
    }

    if (version === 2) {
        validarCamposV2(evento, errores);
    }

    return { valido: errores.length === 0, version, errores };
}

class EventoInvalidoError extends Error {
    constructor(errores) {
        super(`documento invalido: ${errores.join('; ')}`);
        this.name = 'EventoInvalidoError';
        this.errores = errores;
    }
}

module.exports = {
    CAMPOS,
    CAMPOS_V2,
    METRICAS_PERMITIDAS,
    VERSION_ACTUAL,
    VERSIONES_SOPORTADAS,
    detectarVersion,
    validarEvento,
    EventoInvalidoError,
};
