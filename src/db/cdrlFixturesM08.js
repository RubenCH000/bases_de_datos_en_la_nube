// Fixtures sintéticos y reproducibles para M08.
// Los valores son fijos para que el benchmark pueda repetirse.

const DISPOSITIVOS_M08 = [
    'NODE-CDRL-M08A',
    'NODE-CDRL-M08B',
    'NODE-CDRL-M08C',
];

const EVENTOS_POR_DISPOSITIVO = 120;
const TIMESTAMP_BASE = 1767225600000;

function generarFixturesM08({
    eventosPorDispositivo = EVENTOS_POR_DISPOSITIVO,
} = {}) {
    if (
        !Number.isInteger(eventosPorDispositivo)
        || eventosPorDispositivo < 1
        || eventosPorDispositivo > 1000
    ) {
        throw new Error(
            'eventosPorDispositivo debe ser un entero entre 1 y 1000',
        );
    }

    const eventos = [];

    DISPOSITIVOS_M08.forEach((deviceId, indiceDispositivo) => {
        for (let indice = 0; indice < eventosPorDispositivo; indice += 1) {
            const numero = String(indice + 1).padStart(4, '0');
            const metricName = indice % 2 === 0
                ? 'cpu_temperature'
                : 'battery_voltage';

            const metricValue = metricName === 'cpu_temperature'
                ? Number((40 + (indice % 25) * 0.4).toFixed(2))
                : Number((11.5 + (indice % 10) * 0.08).toFixed(2));

            eventos.push({
                schema_version: 2,
                event_id: `evt_m08_${indiceDispositivo + 1}_${numero}`,
                device_id: deviceId,
                timestamp:
                    TIMESTAMP_BASE
                    + (indiceDispositivo * 10000000)
                    + (indice * 1000),
                metric_name: metricName,
                metric_value: metricValue,
                firmware_version: '3.0.0',
                quality_score: Number(
                    (0.8 + (indice % 20) * 0.01).toFixed(2),
                ),
            });
        }
    });

    return eventos;
}

function crearEventoPosteriorM08({
    deviceId = DISPOSITIVOS_M08[0],
    timestamp = Date.now(),
} = {}) {
    if (!DISPOSITIVOS_M08.includes(deviceId)) {
        throw new Error('deviceId no pertenece a los fixtures M08');
    }

    if (!Number.isInteger(timestamp) || timestamp <= 0) {
        throw new Error('timestamp debe ser un entero positivo');
    }

    return {
        schema_version: 2,
        event_id: `evt_m08_posterior_${timestamp}`,
        device_id: deviceId,
        timestamp,
        metric_name: 'cpu_temperature',
        metric_value: 49.5,
        firmware_version: '3.0.1',
        quality_score: 0.95,
    };
}

const fixturesM08 = generarFixturesM08();

module.exports = {
    DISPOSITIVOS_M08,
    EVENTOS_POR_DISPOSITIVO,
    TIMESTAMP_BASE,
    fixturesM08,
    generarFixturesM08,
    crearEventoPosteriorM08,
};