const test = require('node:test');
const assert = require('node:assert/strict');

const {
  adminPool,
  migratorPool,
  writerPool,
  readerPool,
  operatorPool,
} = require('../src/db/connection');

let sensorId;

test.before(async () => {
  const { rows } = await adminPool.query(
    `SELECT id FROM sensores
     WHERE tipo = 'temperatura'
     LIMIT 1`
  );
  sensorId = rows[0].id;
});

test('M03 normal: writer inserta y reader consulta', async () => {
  const { rows } = await writerPool.query(
    `INSERT INTO lecturas_telemetria (sensor_id, valor)
     VALUES ($1, $2)
     RETURNING id`,
    [sensorId, 24.5]
  );

  const consulta = await readerPool.query(
    `SELECT id, valor FROM lecturas_telemetria WHERE id = $1`,
    [rows[0].id]
  );

  assert.equal(consulta.rowCount, 1);
  assert.equal(Number(consulta.rows[0].valor), 24.5);
});

test('M03 migrator puede modificar estructura', async () => {
  await migratorPool.query('BEGIN');
  try {
    await migratorPool.query(
      'ALTER TABLE dispositivos ADD COLUMN m03_prueba_temporal INTEGER'
    );
  } finally {
    await migratorPool.query('ROLLBACK');
  }
});

test('M03 operator puede hacer health check', async () => {
  const { rows } = await operatorPool.query('SELECT 1 AS ok');
  assert.equal(rows[0].ok, 1);
});

test('acceso denegado: reader no puede insertar', async () => {
  await assert.rejects(
    () => readerPool.query(
      `INSERT INTO lecturas_telemetria (sensor_id, valor)
       VALUES ($1, $2)`,
      [sensorId, 20]
    ),
    (err) => err.code === '42501'
  );
});

test('acceso denegado: writer no puede borrar', async () => {
  await assert.rejects(
    () => writerPool.query(
      'DELETE FROM lecturas_telemetria WHERE id = -1'
    ),
    (err) => err.code === '42501'
  );
});

test('acceso denegado: operator no puede leer telemetria', async () => {
  await assert.rejects(
    () => operatorPool.query(
      'SELECT * FROM lecturas_telemetria LIMIT 1'
    ),
    (err) => err.code === '42501'
  );
});

test.after(async () => {
  await Promise.all([
    adminPool.end(),
    migratorPool.end(),
    writerPool.end(),
    readerPool.end(),
    operatorPool.end(),
  ]);
});
