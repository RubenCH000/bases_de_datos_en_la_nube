const fixturesV1 = [
    {
        event_id: 'evt_m07_c_v1_001',
        device_id: 'NODE-CDRL-A1',
        timestamp: 1790100001000,
        metric_name: 'cpu_temperature',
        metric_value: 44.8,
    },
    {
        event_id: 'evt_m07_c_v1_002',
        device_id: 'NODE-CDRL-A1',
        timestamp: 1790100002000,
        metric_name: 'battery_voltage',
        metric_value: 12.3,
    },
    {
        schema_version: 1,
        event_id: 'evt_m07_c_v1_003',
        device_id: 'NODE-CDRL-B2',
        timestamp: 1790100003000,
        metric_name: 'cpu_temperature',
        metric_value: 51.0,
    },
];

const fixturesV2 = [
    {
        schema_version: 2,
        event_id: 'evt_m07_c_v2_001',
        device_id: 'NODE-CDRL-A1',
        timestamp: 1790100004000,
        metric_name: 'cpu_temperature',
        metric_value: 46.2,
        firmware_version: '2.1.0',
        quality_score: 0.97,
    },
    {
        schema_version: 2,
        event_id: 'evt_m07_c_v2_002',
        device_id: 'NODE-CDRL-B2',
        timestamp: 1790100005000,
        metric_name: 'battery_voltage',
        metric_value: 11.9,
        firmware_version: '2.1.0',
        quality_score: 0.88,
    },
    {
        schema_version: 2,
        event_id: 'evt_m07_c_v2_003',
        device_id: 'NODE-CDRL-C3',
        timestamp: 1790100006000,
        metric_name: 'cpu_temperature',
        metric_value: 39.5,
        firmware_version: '2.2.1',
        quality_score: 1,
    },
];

const fixturesInvalidos = [
    {
        schema_version: 3,
        event_id: 'evt_m07_c_bad_001',
        device_id: 'NODE-CDRL-A1',
        timestamp: 1790100007000,
        metric_name: 'cpu_temperature',
        metric_value: 40,
    },
    {
        schema_version: 2,
        event_id: 'evt_m07_c_bad_002',
        device_id: 'NODE-CDRL-A1',
        timestamp: 1790100008000,
        metric_name: 'cpu_temperature',
        metric_value: 40,
    },
];

const fixturesMixtos = [
    fixturesV1[0],
    fixturesV2[0],
    fixturesV1[1],
    fixturesV2[1],
    fixturesV1[2],
    fixturesV2[2],
];

module.exports = {
    fixturesV1,
    fixturesV2,
    fixturesInvalidos,
    fixturesMixtos,
};