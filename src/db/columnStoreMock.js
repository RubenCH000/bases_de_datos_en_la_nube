const config = require('./nosqlConfig');

// Prototipo simulado de Column Store para la entrega M04
class ColumnStoreMock {
    constructor() {
        this.connectionInfo = `Conectado a \({config.host}:\){config.port} | Keyspace: ${config.keyspace}`;
        
        this.columns = {
            device_id: [],
            timestamp: [],
            metric_name: [],
            metric_value: []
        };
        this.is_ready = true;
    }

    // Inserción de eventos simulando guardado columnar
    insertMany(fixtures) {
        if (!this.is_ready) throw new Error("Fallo de conexión simulado");
        
        let insertedCount = 0;
        fixtures.forEach(event => {
            this.columns.device_id.push(event.device_id);
            this.columns.timestamp.push(event.timestamp);
            this.columns.metric_name.push(event.metric_name);
            this.columns.metric_value.push(event.metric_value);
            insertedCount++;
        });
        return insertedCount;
    }

    // Consulta de agregación típica en telemetría (ej. promedio de una métrica)
    getMetricAverage(metricName) {
        let sum = 0;
        let count = 0;
        for (let i = 0; i < this.columns.metric_name.length; i++) {
            if (this.columns.metric_name[i] === metricName) {
                sum += this.columns.metric_value[i];
                count++;
            }
        }
        return count === 0 ? 0 : sum / count;
    }

    getState() {
        return {
            connection: this.connectionInfo,
            total_records: this.columns.device_id.length,
            data: this.columns
        };
    }
}

module.exports = ColumnStoreMock;