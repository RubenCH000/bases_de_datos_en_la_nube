// deja datos de prueba fijos, para que siempre se pueda repetir igual
const { pool } = require('../../src/db/connection');
 
async function seed() {
  await pool.query('TRUNCATE lecturas_telemetria, sensores, dispositivos RESTART IDENTITY CASCADE');
 
  const { rows: dispositivos } = await pool.query(
    `INSERT INTO dispositivos (nombre) VALUES ('nodo-01') RETURNING id`
  );
 
  const { rows: sensores } = await pool.query(
    `INSERT INTO sensores (dispositivo_id, tipo, valor_min, valor_max) VALUES
      ($1, 'temperatura', -10, 60),
      ($1, 'humedad', 0, 100)
     RETURNING id`,
    [dispositivos[0].id]
  );
 
  await pool.query(
    `INSERT INTO lecturas_telemetria (sensor_id, valor) VALUES ($1, 22.5)`,
    [sensores[0].id]
  );
 
  console.log('seed listo');
  await pool.end();
}
 
seed().catch((err) => {
  console.error('fallo el seed', err);
  process.exit(1);
});