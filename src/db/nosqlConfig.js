// Configuración del almacén NoSQL por variables de entorno.
// Desde M05 el almacén elegido es DynamoDB (DynamoDB Local en Docker como respaldo).
require('dotenv').config();

const host = process.env.NOSQL_HOST || 'localhost';
const port = Number(process.env.DYNAMODB_PORT || 8000);

const nosqlConfig = {
    host,
    port,
    endpoint: process.env.DYNAMODB_ENDPOINT || `http://${host}:${port}`,
    region: process.env.AWS_REGION || 'us-east-1',
    table: process.env.DYNAMODB_TABLE || 'cdrl_eventos',
    // Se conserva para el prototipo columnar de M04.
    keyspace: process.env.NOSQL_KEYSPACE || 'telemetry_cdrl',
};

module.exports = nosqlConfig;
