const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/db/connection');
const { insertarLectura } = require('../src/services/telemetriaService');
 
test('fallo declarado: un valor fuera de rango se rechaza', async () => {
  const { rows } = await pool.query("SELECT id FROM sensores WHERE tipo = 'temperatura' LIMIT 1");
  const sensorId = rows[0].id;
 
  await assert.rejects(() => insertarLectura(sensorId, 999));
});
 
test.after(async () => { await pool.end(); });