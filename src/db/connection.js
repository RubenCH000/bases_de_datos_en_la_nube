require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'cdrl',
    user: process.env.POSTGRES_USER || 'cdrl_dev',
    password: process.env.POSTGRES_PASSWORD || 'cdrl_dev_only',
});

module.exports = { pool };