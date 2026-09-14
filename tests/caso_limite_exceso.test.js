const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/db/connection');
const { insertarLectura, obtenerLecturasPorSensor } = require('../src/services/telemetriaService');
 
test('caso limite: varias lecturas seguidas del mismo sensor', async () => {
  const { rows } = await pool.query("SELECT id FROM sensores WHERE tipo = 'humedad' LIMIT 1");
  const sensorId = rows[0].id;
 
  for (let i = 0; i < 20; i++) {
    await insertarLectura(sensorId, 50 + i);
  }
 
  const historial = await obtenerLecturasPorSensor(sensorId);
  assert.ok(historial.length >= 20);
});
 
test.after(async () => { await pool.end(); });