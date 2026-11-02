// Operaciones NoSQL protegidas y auditadas para M09.

const {
    guardarEvento,
    obtenerEvento,
    actualizarValor,
    eliminarEvento,
    consultarPorDispositivo,
} = require('./documentStore');

const {
    registrarAuditoria,
    listarAuditoria,
} = require('./auditLog');

const {
    RECURSOS,
    ACCIONES,
    POLITICA_SEGURA,
    AccesoDenegadoError,
    autorizarOperacion,
} = require('../security/nosqlAccessControl');

async function registrarSinOcultarError(
    registrador,
    registro,
    errorOriginal = null,
) {
    try {
        return await registrador(registro);
    } catch (errorAuditoria) {
        if (errorOriginal) {
            errorOriginal.auditoria_fallida = true;
            return null;
        }

        throw errorAuditoria;
    }
}

async function ejecutarOperacionAuditada({
    contexto,
    recurso,
    accion,
    operacion,
    contarDocumentos = () => 0,
    politica = POLITICA_SEGURA,
    registrador = registrarAuditoria,
}) {
    let autorizacion;

    try {
        autorizacion = autorizarOperacion({
            actor: contexto?.actor,
            rol: contexto?.rol,
            recurso,
            accion,
            politica,
        });
    } catch (error) {
        if (error instanceof AccesoDenegadoError) {
            await registrarSinOcultarError(
                registrador,
                {
                    actor: error.actor,
                    accion,
                    recurso,
                    documentosAfectados: 0,
                    resultado: 'denegado',
                },
                error,
            );
        }

        throw error;
    }

    let resultado;

    try {
        resultado = await operacion();
    } catch (error) {
        await registrarSinOcultarError(
            registrador,
            {
                actor: autorizacion.actor,
                accion,
                recurso,
                documentosAfectados: 0,
                resultado: 'fallo',
            },
            error,
        );

        throw error;
    }

    const documentosAfectados = contarDocumentos(resultado);

    await registrarSinOcultarError(
        registrador,
        {
            actor: autorizacion.actor,
            accion,
            recurso,
            documentosAfectados,
            resultado: 'exito',
        },
    );

    return resultado;
}

function obtenerEventoSeguro(contexto, eventId, opciones = {}) {
    return ejecutarOperacionAuditada({
        contexto,
        recurso: RECURSOS.EVENTOS,
        accion: ACCIONES.OBTENER,
        operacion: () => obtenerEvento(eventId),
        contarDocumentos: (evento) => (
            evento ? 1 : 0
        ),
        ...opciones,
    });
}

function guardarEventoSeguro(contexto, evento, opciones = {}) {
    return ejecutarOperacionAuditada({
        contexto,
        recurso: RECURSOS.EVENTOS,
        accion: ACCIONES.CREAR,
        operacion: () => guardarEvento(evento),
        contarDocumentos: () => 1,
        ...opciones,
    });
}

function actualizarValorSeguro(
    contexto,
    eventId,
    metricValue,
    opciones = {},
) {
    return ejecutarOperacionAuditada({
        contexto,
        recurso: RECURSOS.EVENTOS,
        accion: ACCIONES.ACTUALIZAR,
        operacion: () => actualizarValor(
            eventId,
            metricValue,
        ),
        contarDocumentos: (evento) => (
            evento ? 1 : 0
        ),
        ...opciones,
    });
}

function eliminarEventoSeguro(contexto, eventId, opciones = {}) {
    return ejecutarOperacionAuditada({
        contexto,
        recurso: RECURSOS.EVENTOS,
        accion: ACCIONES.ELIMINAR,
        operacion: () => eliminarEvento(eventId),
        contarDocumentos: (resultado) => (
            resultado.eliminado ? 1 : 0
        ),
        ...opciones,
    });
}

function consultarPorDispositivoSeguro(
    contexto,
    deviceId,
    rango = {},
    opciones = {},
) {
    return ejecutarOperacionAuditada({
        contexto,
        recurso: RECURSOS.EVENTOS,
        accion: ACCIONES.CONSULTAR,
        operacion: () => consultarPorDispositivo(
            deviceId,
            rango,
        ),
        contarDocumentos: (eventos) => eventos.length,
        ...opciones,
    });
}

function listarAuditoriaSeguro(contexto, opciones = {}) {
    return ejecutarOperacionAuditada({
        contexto,
        recurso: RECURSOS.AUDITORIA,
        accion: ACCIONES.CONSULTAR,
        operacion: () => listarAuditoria(),
        contarDocumentos: (registros) => registros.length,
        ...opciones,
    });
}

module.exports = {
    ejecutarOperacionAuditada,
    obtenerEventoSeguro,
    guardarEventoSeguro,
    actualizarValorSeguro,
    eliminarEventoSeguro,
    consultarPorDispositivoSeguro,
    listarAuditoriaSeguro,
};
