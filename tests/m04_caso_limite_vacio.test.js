const test = require('node:test');
const assert = require('node:assert/strict');
const ColumnStoreMock = require('../src/db/columnStoreMock');

test('M04 caso limite: insertar un lote vacio no agrega registros ni truena', () => {
  const store = new ColumnStoreMock();

  const insertados = store.insertMany([]);

  assert.equal(insertados, 0);
  assert.equal(store.getState().total_records, 0);
  assert.equal(store.getMetricAverage('cpu_temperature'), 0);
});
