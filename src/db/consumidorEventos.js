const { normalizarEvento } = require('./eventoLector');
const {
    VERSION_ACTUAL,
    VERSIONES_SOPORTADAS,
    detectarVersion,
    validarEvento,
} = require('./eventoValidador');

class EventoNoConsumibleError extends Error {
    constructor(mensaje, eventId = null) {
        super(mensaje);
        this.name = 'EventoNoConsumibleError';
        this.eventId = eventId;
    }
}

function detectarVersionDocumento(documento) {
    if (documento === null || typeof documento !== 'object' || Array.isArray(documento)) {
        throw new EventoNoConsumibleError('el documento debe ser un objeto');
    }

    const version = detectarVersion(documento);

    if (!VERSIONES_SOPORTADAS.includes(version)) {
        throw new EventoNoConsumibleError(
            `schema_version no soportada: ${version}`,
            documento.event_id || null,
        );
    }

    return version;
}

function adaptarEvento(documento) {
    const version = detectarVersionDocumento(documento);
    const validacion = validarEvento(documento);

    if (!validacion.valido) {
        throw new EventoNoConsumibleError(
            `documento invalido: ${validacion.errores.join('; ')}`,
            documento.event_id || null,
        );
    }

    return {
        ...normalizarEvento(documento),
        adaptado_al_vuelo: version !== VERSION_ACTUAL,
    };
}

function consumirEventos(documentos) {
    const eventos = [];
    const errores = [];
    const resumen = {
        total: documentos.length,
        v1: 0,
        v2: 0,
        adaptados_al_vuelo: 0,
        rechazados: 0,
    };

    documentos.forEach((documento, indice) => {
        try {
            const evento = adaptarEvento(documento);

            eventos.push(evento);
            resumen[`v${evento.version_origen}`] += 1;

            if (evento.adaptado_al_vuelo) {
                resumen.adaptados_al_vuelo += 1;
            }
        } catch (error) {
            resumen.rechazados += 1;
            errores.push({
                indice,
                event_id: error.eventId || documento?.event_id || null,
                tipo: error.name,
                mensaje: error.message,
            });
        }
    });

    return { eventos, errores, resumen };
}

module.exports = {
    EventoNoConsumibleError,
    detectarVersionDocumento,
    adaptarEvento,
    consumirEventos,
};