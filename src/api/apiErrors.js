// Errores estables y seguros para la API de M10.

const TIMEOUT_PREDETERMINADO_MS = 3000;

class ApiError extends Error {
    constructor({
        status,
        codigo,
        mensaje,
    }) {
        super(mensaje);

        this.name = 'ApiError';
        this.status = status;
        this.codigo = codigo;
    }
}

class EntradaInvalidaError extends ApiError {
    constructor(mensaje = 'la entrada no es válida') {
        super({
            status: 400,
            codigo: 'ENTRADA_INVALIDA',
            mensaje,
        });

        this.name = 'EntradaInvalidaError';
    }
}

class RecursoNoEncontradoError extends ApiError {
    constructor(mensaje = 'el recurso solicitado no existe') {
        super({
            status: 404,
            codigo: 'RECURSO_NO_ENCONTRADO',
            mensaje,
        });

        this.name = 'RecursoNoEncontradoError';
    }
}

class TimeoutDependenciaError extends ApiError {
    constructor(dependencia) {
        super({
            status: 504,
            codigo: 'TIMEOUT_DEPENDENCIA',
            mensaje:
                `se agotó el tiempo de espera de ${dependencia}`,
        });

        this.name = 'TimeoutDependenciaError';
        this.dependencia = dependencia;
    }
}

function nombreSeguroDependencia(dependencia) {
    const permitidas = {
        postgres: 'PostgreSQL',
        dynamodb: 'DynamoDB',
    };

    return permitidas[dependencia] || 'almacén de datos';
}

function validarTimeout(timeoutMs) {
    if (
        !Number.isInteger(timeoutMs)
        || timeoutMs < 1
        || timeoutMs > 30000
    ) {
        throw new EntradaInvalidaError(
            'el timeout debe ser un entero entre 1 y 30000 ms',
        );
    }

    return timeoutMs;
}

async function conTimeout(
    operacion,
    {
        dependencia,
        timeoutMs = TIMEOUT_PREDETERMINADO_MS,
    },
) {
    if (typeof operacion !== 'function') {
        throw new TypeError('operacion debe ser una función');
    }

    const limite = validarTimeout(timeoutMs);
    const nombreDependencia = nombreSeguroDependencia(
        dependencia,
    );

    let temporizador;

    try {
        return await Promise.race([
            Promise.resolve().then(operacion),

            new Promise((resolve, reject) => {
                temporizador = setTimeout(
                    () => reject(
                        new TimeoutDependenciaError(
                            nombreDependencia,
                        ),
                    ),
                    limite,
                );
            }),
        ]);
    } finally {
        clearTimeout(temporizador);
    }
}

function convertirErrorEnRespuesta(error) {
    if (error instanceof ApiError) {
        return {
            status: error.status,
            body: {
                error: {
                    codigo: error.codigo,
                    mensaje: error.message,
                },
            },
        };
    }

    return {
        status: 500,
        body: {
            error: {
                codigo: 'ERROR_INTERNO',
                mensaje:
                    'ocurrió un error interno al procesar la solicitud',
            },
        },
    };
}

module.exports = {
    TIMEOUT_PREDETERMINADO_MS,
    ApiError,
    EntradaInvalidaError,
    RecursoNoEncontradoError,
    TimeoutDependenciaError,
    nombreSeguroDependencia,
    validarTimeout,
    conTimeout,
    convertirErrorEnRespuesta,
};
