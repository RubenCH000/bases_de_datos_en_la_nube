const test = require('node:test');
const assert = require('node:assert/strict');
const ColumnStoreMock = require('../src/db/columnStoreMock');
const fixtures = require('../src/db/cdrlFixtures');

test('M04 caso normal: inserta los eventos CDRL y calcula el promedio por metrica', () => {
  const store = new ColumnStoreMock();

  const insertados = store.insertMany(fixtures);

  assert.equal(insertados, fixtures.length);
  assert.equal(store.getState().total_records, fixtures.length);

  const cpuEsperado = (45.2 + 47.1) / 2;
  assert.equal(store.getMetricAverage('cpu_temperature'), cpuEsperado);

  const bateriaEsperada = (12.4 + 12.1) / 2;
  assert.equal(store.getMetricAverage('battery_voltage'), bateriaEsperada);
});
