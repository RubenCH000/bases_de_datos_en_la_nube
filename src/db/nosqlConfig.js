// Configuración por variables de entorno para cumplir con la rúbrica M04
require('dotenv').config();

const nosqlConfig = {
    host: process.env.NOSQL_HOST || 'localhost',
    port: process.env.NOSQL_PORT || 9042, 
    keyspace: process.env.NOSQL_KEYSPACE || 'telemetry_cdrl',
    user: process.env.NOSQL_USER || 'default_user',
    password: process.env.NOSQL_PASSWORD || 'default_pass'
};

module.exports = nosqlConfig;