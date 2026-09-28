const test = require('node:test');
const assert = require('node:assert/strict');
const ColumnStoreMock = require('../src/db/columnStoreMock');

test('M04 caso limite: un volumen alto de eventos no rompe el store, pero tampoco deduplica', () => {
  const store = new ColumnStoreMock();
  const eventoBase = {
    event_id: 'evt_stress',
    device_id: 'NODE-CDRL-STRESS',
    metric_name: 'cpu_temperature',
    metric_value: 50,
  };
  const lote = Array.from({ length: 500 }, (_, i) => ({
    ...eventoBase,
    timestamp: Date.now() + i,
  }));

  const insertados = store.insertMany(lote);

  assert.equal(insertados, 500);
  assert.equal(store.getState().total_records, 500);
  assert.equal(store.getMetricAverage('cpu_temperature'), 50);

  // limitacion conocida: el store no deduplica, insertar el mismo lote otra vez acumula
  store.insertMany(lote);
  assert.equal(store.getState().total_records, 1000);
});
