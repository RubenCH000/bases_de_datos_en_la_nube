const fs = require('fs');
const path = require('path');
const ColumnStoreMock = require('../src/db/columnStoreMock');
const fixtures = require('../src/db/cdrlFixtures');

console.log("-> Inicializando prototipo de Column Store...");
const store = new ColumnStoreMock();

console.log("-> Insertando fixtures CDRL...");
const insertedCount = store.insertMany(fixtures);
console.log(`   Se insertaron ${insertedCount} eventos sintéticos.`);

console.log("-> Ejecutando consulta analítica...");
const avgCpu = store.getMetricAverage('cpu_temperature');
console.log(`   Promedio calculado de cpu_temperature: ${avgCpu}`);

const evidenceData = {
    module: "M04 - Decisión arquitectónica NoSQL",
    author: "Josué David", 
    store_type: "Column Store",
    config_used: "Variables de entorno (simulado sin AWS)",
    fixtures_inserted: insertedCount,
    query_results: {
        metric: "cpu_temperature",
        average_calculated: avgCpu
    },
    database_state: store.getState(),
    generated_at: new Date().toISOString()
};

const artifactsDir = path.join(__dirname, '..', 'artifacts');
if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir);
}

const artifactPath = path.join(artifactsDir, 'm04-almacenamiento.json');
fs.writeFileSync(artifactPath, JSON.stringify(evidenceData, null, 2));

console.log(`\n[OK] Evidencia M04 guardada exitosamente en: artifacts/m04-almacenamiento.json`);
