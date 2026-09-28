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

module.exports = generarFixtures();