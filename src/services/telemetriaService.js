const { writerPool, readerPool } = require('../db/connection');

async function insertarLectura(sensorId, valor) {
  try {
    const { rows } = await writerPool.query(
      `INSERT INTO lecturas_telemetria (sensor_id, valor)
       VALUES ($1, $2)
       RETURNING id`,
      [sensorId, valor]
    );

    return { id: rows[0].id, sensor_id: sensorId, valor };
  } catch (err) {
    if (err.message && err.message.includes('fuera de rango')) {
      throw new Error(err.message);
    }
    throw err;
  }
}

async function obtenerLecturasPorSensor(sensorId) {
  const { rows } = await readerPool.query(
    `SELECT id, valor, capturado_en
     FROM lecturas_telemetria
     WHERE sensor_id = $1`,
    [sensorId]
  );
  return rows;
}

async function obtenerLecturasPorRangoFechas(sensorId, desde, hasta) {
  const { rows } = await readerPool.query(
    `SELECT id, valor, capturado_en
     FROM lecturas_telemetria
     WHERE sensor_id = $1
       AND capturado_en BETWEEN $2 AND $3
     ORDER BY capturado_en`,
    [sensorId, desde, hasta]
  );
  return rows;
}

module.exports = {
  insertarLectura,
  obtenerLecturasPorSensor,
  obtenerLecturasPorRangoFechas,
};
