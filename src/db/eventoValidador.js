// Validación del documento de evento CDRL antes de guardarlo en el almacén documental (M05).

const CAMPOS = ['event_id', 'device_id', 'timestamp', 'metric_name', 'metric_value'];
const METRICAS_PERMITIDAS = ['cpu_temperature', 'battery_voltage'];

const PATRON_EVENT_ID = /^evt_[A-Za-z0-9_-]{1,60}$/;
const PATRON_DEVICE_ID = /^NODE-CDRL-[A-Z0-9]{1,20}$/;

function validarEvento(evento) {
    const errores = [];

    if (evento === null || typeof evento !== 'object' || Array.isArray(evento)) {
        return { valido: false, errores: ['el evento debe ser un objeto'] };
    }

    for (const campo of CAMPOS) {
        if (evento[campo] === undefined || evento[campo] === null) {
            errores.push(`falta el campo ${campo}`);
        }
    }

    const extras = Object.keys(evento).filter((campo) => !CAMPOS.includes(campo));
    if (extras.length > 0) {
        errores.push(`campos no permitidos: ${extras.join(', ')}`);
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

    return { valido: errores.length === 0, errores };
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
    METRICAS_PERMITIDAS,
    validarEvento,
    EventoInvalidoError,
};
