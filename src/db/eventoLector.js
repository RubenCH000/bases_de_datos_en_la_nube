// Lector de eventos con evolución de esquema (M06).
// Estrategia: las versiones conviven en la tabla y se normalizan al leer.
// No se reescriben los documentos v1 guardados; la aplicación siempre recibe
// la forma de la versión actual y version_origen indica cómo se guardó.
const {
    CAMPOS,
    CAMPOS_V2,
    VERSION_ACTUAL,
    VERSIONES_SOPORTADAS,
    detectarVersion,
} = require('./eventoValidador');

class VersionNoSoportadaError extends Error {
    constructor(version) {
        super(`schema_version no soportada al leer: ${version}`);
        this.name = 'VersionNoSoportadaError';
        this.version = version;
    }
}

function normalizarEvento(documento) {
    if (documento === null || documento === undefined) {
        return null;
    }

    const version = detectarVersion(documento);
    if (!VERSIONES_SOPORTADAS.includes(version)) {
        throw new VersionNoSoportadaError(version);
    }

    const normalizado = { schema_version: VERSION_ACTUAL, version_origen: version };
    for (const campo of CAMPOS) {
        normalizado[campo] = documento[campo];
    }
    // En v1 no existían estos datos: se dejan en null en lugar de inventar un valor.
    for (const campo of CAMPOS_V2) {
        normalizado[campo] = documento[campo] === undefined ? null : documento[campo];
    }
    return normalizado;
}

function normalizarEventos(documentos) {
    return documentos.map(normalizarEvento);
}

// Conteo por versión de origen, útil para saber cuántos documentos siguen en v1.
function resumirVersiones(documentos) {
    const resumen = {};
    for (const documento of documentos) {
        const version = `v${detectarVersion(documento)}`;
        resumen[version] = (resumen[version] || 0) + 1;
    }
    return resumen;
}

module.exports = {
    VersionNoSoportadaError,
    normalizarEvento,
    normalizarEventos,
    resumirVersiones,
};
