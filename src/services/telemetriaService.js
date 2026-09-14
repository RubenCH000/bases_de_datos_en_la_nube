const { pool } = require('../db/connection');
 
// ya no revisamos el rango aqui a mano: lo rechaza el trigger de la base.
// si el trigger lo tumba, atrapamos el error y lo regresamos mas claro.
async function insertarLectura(sensorId, valor) {
  try {
    const { rows } = await pool.query(
      'INSERT INTO lecturas_telemetria (sensor_id, valor) VALUES ($1, $2) RETURNING id, sensor_id, valor',
      [sensorId, valor]
    );
    return rows[0];
  } catch (err) {
    if (err.message && err.message.includes('fuera de rango')) {
      throw new Error(err.message);
    }
    throw err;
  }
}
 
async function obtenerLecturasPorSensor(sensorId) {
  const { rows } = await pool.query(
    'SELECT id, valor, capturado_en FROM lecturas_telemetria WHERE sensor_id = $1',
    [sensorId]
  );
  return rows;
}
 
// consulta parametrizada nueva para M02: lecturas de un sensor entre dos fechas
async function obtenerLecturasPorRangoFechas(sensorId, desde, hasta) {
  const { rows } = await pool.query(
    `SELECT id, valor, capturado_en FROM lecturas_telemetria
     WHERE sensor_id = $1 AND capturado_en BETWEEN $2 AND $3
     ORDER BY capturado_en`,
    [sensorId, desde, hasta]
  );
  return rows;
}
 
module.exports = { insertarLectura, obtenerLecturasPorSensor, obtenerLecturasPorRangoFechas };