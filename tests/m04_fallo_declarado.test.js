const test = require('node:test');
const assert = require('node:assert/strict');
const ColumnStoreMock = require('../src/db/columnStoreMock');
const fixtures = require('../src/db/cdrlFixtures');

test('M04 fallo declarado: la conexion simulada caida rechaza la insercion', () => {
  const store = new ColumnStoreMock();
  store.is_ready = false;

  assert.throws(
    () => store.insertMany(fixtures),
    /Fallo de conexión simulado/
  );
});
