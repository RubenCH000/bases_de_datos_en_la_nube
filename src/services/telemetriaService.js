const { pool } = require('../db/connection');
 
// aqui se checa el rango del sensor antes de guardar la lectura
async function insertarLectura(sensorId, valor) {
  const { rows: sensor } = await pool.query(
    'SELECT valor_min, valor_max FROM sensores WHERE id = $1',
    [sensorId]
  );
 
  const { valor_min: min, valor_max: max } = sensor[0];
  if (valor < min || valor > max) {
    throw new Error('valor fuera de rango para el sensor ' + sensorId);
  }
 
  const { rows } = await pool.query(
    'INSERT INTO lecturas_telemetria (sensor_id, valor) VALUES ($1, $2) RETURNING id, sensor_id, valor',
    [sensorId, valor]
  );
  return rows[0];
}
 
async function obtenerLecturasPorSensor(sensorId) {
  const { rows } = await pool.query(
    'SELECT id, valor FROM lecturas_telemetria WHERE sensor_id = $1',
    [sensorId]
  );
  return rows;
}
 
module.exports = { insertarLectura, obtenerLecturasPorSensor };