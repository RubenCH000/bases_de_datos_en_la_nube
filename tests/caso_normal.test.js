const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/db/connection');
const { insertarLectura, obtenerLecturasPorSensor } = require('../src/services/telemetriaService');
 
test('caso normal: inserta una lectura valida y se puede consultar', async () => {
  const { rows } = await pool.query("SELECT id FROM sensores WHERE tipo = 'temperatura' LIMIT 1");
  const sensorId = rows[0].id;
 
  const lectura = await insertarLectura(sensorId, 25.4);
  const historial = await obtenerLecturasPorSensor(sensorId);
 
  assert.ok(historial.some((l) => l.id === lectura.id));
});
 
test.after(async () => { await pool.end(); });