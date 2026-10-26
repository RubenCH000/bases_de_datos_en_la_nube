// Carga reproducible de fixtures sintéticos para M08.

const {
    guardarEvento,
} = require('../src/db/documentStore');

const {
    DISPOSITIVOS_M08,
    EVENTOS_POR_DISPOSITIVO,
    fixturesM08,
} = require('../src/db/cdrlFixturesM08');

const TAMANO_LOTE = 25;

async function cargarLote(eventos) {
    return Promise.all(
        eventos.map(async (evento) => {
            try {
                const resultado = await guardarEvento(evento);

                return {
                    event_id: evento.event_id,
                    creado: resultado.creado,
                    duplicado: resultado.duplicado,
                    error: null,
                };
            } catch (error) {
                return {
                    event_id: evento.event_id,
                    creado: false,
                    duplicado: false,
                    error: {
                        tipo: error.name || 'Error',
                        mensaje: error.message,
                    },
                };
            }
        }),
    );
}

async function main() {
    const resultados = [];

    for (
        let inicio = 0;
        inicio < fixturesM08.length;
        inicio += TAMANO_LOTE
    ) {
        const lote = fixturesM08.slice(
            inicio,
            inicio + TAMANO_LOTE,
        );

        resultados.push(...await cargarLote(lote));
    }

    const creados = resultados.filter(
        (resultado) => resultado.creado,
    ).length;

    const duplicados = resultados.filter(
        (resultado) => resultado.duplicado,
    ).length;

    const errores = resultados.filter(
        (resultado) => resultado.error,
    );

    console.log(`M08 fixtures totales: ${fixturesM08.length}`);
    console.log(`M08 dispositivos: ${DISPOSITIVOS_M08.length}`);
    console.log(
        `M08 eventos por dispositivo: ${EVENTOS_POR_DISPOSITIVO}`,
    );
    console.log(`M08 creados: ${creados}`);
    console.log(`M08 ya existentes: ${duplicados}`);
    console.log(`M08 errores: ${errores.length}`);

    if (errores.length > 0) {
        for (const resultado of errores.slice(0, 10)) {
            console.error(
                `${resultado.event_id}: `
                + `${resultado.error.tipo}: `
                + resultado.error.mensaje,
            );
        }

        throw new Error(
            `no se pudieron cargar ${errores.length} fixtures M08`,
        );
    }
}

main().catch((error) => {
    console.error(`error al cargar fixtures M08: ${error.message}`);
    process.exitCode = 1;
});