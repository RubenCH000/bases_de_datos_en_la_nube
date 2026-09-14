const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/db/connection');
const { obtenerLecturasPorSensor } = require('../src/services/telemetriaService');
 
test('caso limite: un sensor sin lecturas regresa vacio, no error', async () => {
  const { rows } = await pool.query(
    `INSERT INTO sensores (dispositivo_id, tipo, valor_min, valor_max)
     SELECT id, 'presion', 0, 200 FROM dispositivos LIMIT 1 RETURNING id`
  );
  const sensorId = rows[0].id;
 
  const historial = await obtenerLecturasPorSensor(sensorId);
  assert.deepEqual(historial, []);
});
 
test.after(async () => { await pool.end(); });