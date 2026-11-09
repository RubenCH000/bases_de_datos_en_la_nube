// API HTTP integrada para M10.
// Utiliza solamente módulos nativos de Node.js.

const http = require('node:http');

const {
    crearLecturaIntegrada,
    obtenerEstadoIntegrado,
} = require('../services/integracionApiService');

const {
    ApiError,
    EntradaInvalidaError,
    RecursoNoEncontradoError,
    convertirErrorEnRespuesta,
} = require('./apiErrors');

const MAXIMO_CUERPO_BYTES = 64 * 1024;

function responderJson(respuesta, status, contenido) {
    const cuerpo = JSON.stringify(contenido);

    respuesta.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(cuerpo),
        'Cache-Control': 'no-store',
    });

    respuesta.end(cuerpo);
}

function validarContentType(peticion) {
    const contentType = peticion.headers[
        'content-type'
    ] || '';

    if (!contentType.includes('application/json')) {
        throw new ApiError({
            status: 415,
            codigo: 'TIPO_CONTENIDO_NO_SOPORTADO',
            mensaje:
                'Content-Type debe ser application/json',
        });
    }
}

function leerJson(
    peticion,
    {
        maximoBytes = MAXIMO_CUERPO_BYTES,
    } = {},
) {
    return new Promise((resolve, reject) => {
        let contenido = '';
        let bytes = 0;
        let terminado = false;

        peticion.on('data', (fragmento) => {
            if (terminado) {
                return;
            }

            bytes += fragmento.length;

            if (bytes > maximoBytes) {
                terminado = true;

                reject(new EntradaInvalidaError(
                    'el cuerpo excede el tamaño permitido',
                ));

                return;
            }

            contenido += fragmento.toString('utf8');
        });

        peticion.on('end', () => {
            if (terminado) {
                return;
            }

            if (contenido.trim() === '') {
                reject(new EntradaInvalidaError(
                    'el cuerpo JSON es obligatorio',
                ));

                return;
            }

            try {
                resolve(JSON.parse(contenido));
            } catch {
                reject(new EntradaInvalidaError(
                    'el cuerpo no contiene JSON válido',
                ));
            }
        });

        peticion.on('error', () => {
            if (!terminado) {
                terminado = true;

                reject(new EntradaInvalidaError(
                    'no se pudo leer la solicitud',
                ));
            }
        });
    });
}

function crearManejador({
    crearLectura = crearLecturaIntegrada,
    obtenerEstado = obtenerEstadoIntegrado,
} = {}) {
    return async function manejarPeticion(
        peticion,
        respuesta,
    ) {
        try {
            const url = new URL(
                peticion.url,
                'http://api.local',
            );

            if (
                peticion.method === 'GET'
                && url.pathname === '/health'
            ) {
                responderJson(respuesta, 200, {
                    status: 'ok',
                    servicio: 'cdrl-api',
                    version: 'v1',
                });

                return;
            }

            if (
                peticion.method === 'POST'
                && url.pathname === '/api/v1/telemetria'
            ) {
                validarContentType(peticion);

                const entrada = await leerJson(peticion);
                const resultado = await crearLectura(
                    entrada,
                );

                responderJson(respuesta, 201, {
                    data: resultado,
                });

                return;
            }

            const coincidencia = url.pathname.match(
                /^\/api\/v1\/telemetria\/(\d+)$/,
            );

            if (
                peticion.method === 'GET'
                && coincidencia
            ) {
                const sensorId = Number(coincidencia[1]);
                const deviceId = url.searchParams.get(
                    'device_id',
                );

                const resultado = await obtenerEstado({
                    sensorId,
                    deviceId,
                });

                responderJson(respuesta, 200, {
                    data: resultado,
                });

                return;
            }

            if (
                url.pathname === '/api/v1/telemetria'
                || coincidencia
            ) {
                throw new ApiError({
                    status: 405,
                    codigo: 'METODO_NO_PERMITIDO',
                    mensaje:
                        'el método HTTP no está permitido',
                });
            }

            throw new RecursoNoEncontradoError(
                'la ruta solicitada no existe',
            );
        } catch (error) {
            const salida = convertirErrorEnRespuesta(
                error,
            );

            responderJson(
                respuesta,
                salida.status,
                salida.body,
            );
        }
    };
}

function crearServidor(opciones = {}) {
    return http.createServer(
        crearManejador(opciones),
    );
}

function obtenerPuerto() {
    const puerto = Number(
        process.env.API_PORT || 3000,
    );

    if (
        !Number.isInteger(puerto)
        || puerto < 1
        || puerto > 65535
    ) {
        throw new Error(
            'API_PORT debe ser un puerto válido',
        );
    }

    return puerto;
}

function iniciarServidor() {
    const servidor = crearServidor();
    const puerto = obtenerPuerto();
    const host = process.env.API_HOST || '0.0.0.0';

    servidor.listen(puerto, host, () => {
        console.log(
            `API M10 disponible en el puerto ${puerto}`,
        );
    });

    return servidor;
}

if (require.main === module) {
    iniciarServidor();
}

module.exports = {
    MAXIMO_CUERPO_BYTES,
    responderJson,
    validarContentType,
    leerJson,
    crearManejador,
    crearServidor,
    obtenerPuerto,
    iniciarServidor,
};
