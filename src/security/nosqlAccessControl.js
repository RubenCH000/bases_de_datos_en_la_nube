// Controles de acceso por recurso y operación para M09.

const config = require('../db/nosqlConfig');

const RECURSOS = Object.freeze({
    EVENTOS: config.table,
    AUDITORIA: config.auditTable,
});

const ACCIONES = Object.freeze({
    OBTENER: 'get',
    CONSULTAR: 'query',
    CREAR: 'put',
    ACTUALIZAR: 'update',
    ELIMINAR: 'delete',
});

const ROLES = Object.freeze({
    LECTOR: 'lector',
    ESCRITOR: 'escritor',
    OPERADOR: 'operador',
    AUDITOR: 'auditor',
    ADMINISTRADOR: 'administrador',
});

const TODAS_LAS_ACCIONES = Object.freeze(
    Object.values(ACCIONES),
);

const POLITICA_SEGURA = Object.freeze({
    [ROLES.LECTOR]: Object.freeze({
        [RECURSOS.EVENTOS]: Object.freeze([
            ACCIONES.OBTENER,
            ACCIONES.CONSULTAR,
        ]),
    }),

    [ROLES.ESCRITOR]: Object.freeze({
        [RECURSOS.EVENTOS]: Object.freeze([
            ACCIONES.CREAR,
        ]),
    }),

    [ROLES.OPERADOR]: Object.freeze({
        [RECURSOS.EVENTOS]: Object.freeze([
            ACCIONES.ACTUALIZAR,
            ACCIONES.ELIMINAR,
        ]),
    }),

    [ROLES.AUDITOR]: Object.freeze({
        [RECURSOS.AUDITORIA]: Object.freeze([
            ACCIONES.OBTENER,
            ACCIONES.CONSULTAR,
        ]),
    }),

    [ROLES.ADMINISTRADOR]: Object.freeze({
        [RECURSOS.EVENTOS]: TODAS_LAS_ACCIONES,
        [RECURSOS.AUDITORIA]: TODAS_LAS_ACCIONES,
    }),
});

class AccesoDenegadoError extends Error {
    constructor({
        actor,
        rol,
        recurso,
        accion,
    }) {
        super(
            `acceso denegado: ${actor} con rol ${rol} `
            + `no puede ejecutar ${accion} sobre ${recurso}`,
        );

        this.name = 'AccesoDenegadoError';
        this.actor = actor;
        this.rol = rol;
        this.recurso = recurso;
        this.accion = accion;
    }
}

function validarTexto(valor, campo) {
    if (typeof valor !== 'string' || valor.trim() === '') {
        throw new Error(`${campo} debe ser un texto no vacío`);
    }

    return valor.trim();
}

function tienePermiso({
    rol,
    recurso,
    accion,
    politica = POLITICA_SEGURA,
}) {
    const permisosDelRol = politica[rol];

    if (!permisosDelRol) {
        return false;
    }

    const accionesPermitidas = permisosDelRol[recurso];

    return Array.isArray(accionesPermitidas)
        && accionesPermitidas.includes(accion);
}

function autorizarOperacion({
    actor,
    rol,
    recurso,
    accion,
    politica = POLITICA_SEGURA,
}) {
    const contexto = {
        actor: validarTexto(actor, 'actor'),
        rol: validarTexto(rol, 'rol'),
        recurso: validarTexto(recurso, 'recurso'),
        accion: validarTexto(accion, 'accion'),
    };

    if (!tienePermiso({
        rol: contexto.rol,
        recurso: contexto.recurso,
        accion: contexto.accion,
        politica,
    })) {
        throw new AccesoDenegadoError(contexto);
    }

    return {
        permitido: true,
        ...contexto,
    };
}

module.exports = {
    RECURSOS,
    ACCIONES,
    ROLES,
    POLITICA_SEGURA,
    AccesoDenegadoError,
    tienePermiso,
    autorizarOperacion,
};
