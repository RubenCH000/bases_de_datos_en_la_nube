// Fixtures sintéticos del evento de telemetría CDRL
const generarFixtures = () => {
    const timestampActual = Date.now();
    return [
        { 
            event_id: "evt_001", 
            device_id: "NODE-CDRL-A1", 
            timestamp: timestampActual - 10000, 
            metric_name: "cpu_temperature", 
            metric_value: 45.2 
        },
        { 
            event_id: "evt_002", 
            device_id: "NODE-CDRL-A1", 
            timestamp: timestampActual - 5000, 
            metric_name: "cpu_temperature", 
            metric_value: 47.1 
        },
        { 
            event_id: "evt_003", 
            device_id: "NODE-CDRL-B2", 
            timestamp: timestampActual - 8000, 
            metric_name: "battery_voltage", 
            metric_value: 12.4 
        },
        { 
            event_id: "evt_004", 
            device_id: "NODE-CDRL-B2", 
            timestamp: timestampActual - 2000, 
            metric_name: "battery_voltage", 
            metric_value: 12.1 
        }
    ];
};

// M06: eventos con schema_version 2 (firmware_version y quality_score).
// Usan otros event_id para que convivan con los v1 en la misma tabla.
const generarFixturesV2 = () => {
    const timestampActual = Date.now();
    return [
        {
            schema_version: 2,
            event_id: "evt_v2_001",
            device_id: "NODE-CDRL-A1",
            timestamp: timestampActual - 1500,
            metric_name: "cpu_temperature",
            metric_value: 46.8,
            firmware_version: "2.1.0",
            quality_score: 0.97
        },
        {
            schema_version: 2,
            event_id: "evt_v2_002",
            device_id: "NODE-CDRL-B2",
            timestamp: timestampActual - 1000,
            metric_name: "battery_voltage",
            metric_value: 12.0,
            firmware_version: "2.1.0",
            quality_score: 0.88
        }
    ];
};

// El export principal sigue siendo el arreglo v1 que usan M04 y M05.
const fixtures = generarFixtures();
fixtures.v1 = fixtures;
fixtures.v2 = generarFixturesV2();
fixtures.mixtos = [...fixtures, ...fixtures.v2];

module.exports = fixtures;