// corre los archivos .sql de db/migrations en orden
const fs = require('fs');
const path = require('path');
const { pool } = require('./connection');

async function migrar() {
    const carpeta = path.join(__dirname, '..', '..', 'db', 'migrations');
    const archivos = fs.readdirSync(carpeta).filter(f => f.endsWith('.sql')).sort();

    for (const archivo of archivos) {
        const sql = fs.readFileSync(path.join(carpeta, archivo), 'utf8');
        console.log('aplicando ' + archivo);
        await pool.query(sql);
    }

    console.log('listas las migraciones');
    await pool.end();
}

migrar().catch((err) => {
    console.error('fallo la migracion', err);
    process.exit(1);
});