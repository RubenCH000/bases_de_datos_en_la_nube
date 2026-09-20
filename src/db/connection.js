require('dotenv').config();
const { Pool } = require('pg');

function obligatoria(nombre) {
    const valor = process.env[nombre];
    if (!valor) {
        throw new Error(`falta la variable de entorno ${nombre}`);
    }
    return valor;
}

function crearPool(variableUsuario, variablePassword) {
    return new Pool({
        host: process.env.POSTGRES_HOST || 'localhost',
        port: Number(process.env.POSTGRES_PORT || 5432),
        database: process.env.POSTGRES_DB || 'cdrl',
        user: obligatoria(variableUsuario),
        password: obligatoria(variablePassword),
    });
}

const adminPool = crearPool('POSTGRES_USER', 'POSTGRES_PASSWORD');
const migratorPool = crearPool('MIGRATOR_USER', 'MIGRATOR_PASSWORD');
const writerPool = crearPool('WRITER_USER', 'WRITER_PASSWORD');
const readerPool = crearPool('READER_USER', 'READER_PASSWORD');
const operatorPool = crearPool('OPERATOR_USER', 'OPERATOR_PASSWORD');

// Compatibilidad con pruebas y seed de M01 y M02.
const pool = adminPool;

module.exports = {
    pool,
    adminPool,
    migratorPool,
    writerPool,
    readerPool,
    operatorPool,
};