const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/db/connection');
const {
  insertarLectura,
  obtenerLecturasPorSensor,
  obtenerLecturasPorRangoFechas,
} = require('../src/services/telemetriaService');
 
test('caso normal: inserta una lectura valida y se puede consultar', async () => {
  const { rows } = await pool.query("SELECT id FROM sensores WHERE tipo = 'temperatura' LIMIT 1");
  const sensorId = rows[0].id;
 
  const lectura = await insertarLectura(sensorId, 25.4);
  const historial = await obtenerLecturasPorSensor(sensorId);
  assert.ok(historial.some((l) => l.id === lectura.id));
 
  // demuestra la consulta parametrizada por rango de fechas (M02)
  const desde = new Date(Date.now() - 60 * 60 * 1000);
  const hasta = new Date(Date.now() + 60 * 60 * 1000);
  const porFecha = await obtenerLecturasPorRangoFechas(sensorId, desde, hasta);
  assert.ok(porFecha.some((l) => l.id === lectura.id));
});
 
test.after(async () => { await pool.end(); });