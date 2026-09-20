require('dotenv').config();
const { adminPool } = require('../src/db/connection');

function validarNombre(nombre) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(nombre)) {
        throw new Error(`nombre de rol invalido: ${nombre}`);
    }
}

function identificador(nombre) {
    validarNombre(nombre);
    return `"${nombre.replace(/"/g, '""')}"`;
}

function literal(valor) {
    return `'${String(valor).replace(/'/g, "''")}'`;
}

async function asegurarRol(nombre, password) {
    if (!nombre || !password) {
        throw new Error('faltan usuario o password en las variables de entorno');
    }

    const existe = await adminPool.query(
        'SELECT 1 FROM pg_roles WHERE rolname = $1',
        [nombre]
    );

    if (existe.rowCount === 0) {
        await adminPool.query(
            `CREATE ROLE ${identificador(nombre)} LOGIN PASSWORD ${literal(password)}`
        );
    } else {
        await adminPool.query(
            `ALTER ROLE ${identificador(nombre)} LOGIN PASSWORD ${literal(password)}`
        );
    }
}

async function main() {
    const db = process.env.POSTGRES_DB || 'cdrl';
    const migrator = process.env.MIGRATOR_USER;
    const writer = process.env.WRITER_USER;
    const reader = process.env.READER_USER;
    const operator = process.env.OPERATOR_USER;

    await asegurarRol(migrator, process.env.MIGRATOR_PASSWORD);
    await asegurarRol(writer, process.env.WRITER_PASSWORD);
    await asegurarRol(reader, process.env.READER_PASSWORD);
    await asegurarRol(operator, process.env.OPERATOR_PASSWORD);

    const migratorId = identificador(migrator);
    const writerId = identificador(writer);
    const readerId = identificador(reader);
    const operatorId = identificador(operator);
    const roles = [migratorId, writerId, readerId, operatorId].join(', ');

    await adminPool.query(
        `REVOKE ALL ON DATABASE ${identificador(db)} FROM PUBLIC`
    );
    await adminPool.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await adminPool.query('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC');
    await adminPool.query('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC');

    await adminPool.query(
        `GRANT CONNECT ON DATABASE ${identificador(db)} TO ${roles}`
    );
    await adminPool.query(`GRANT USAGE ON SCHEMA public TO ${roles}`);

    await adminPool.query(`GRANT CREATE ON SCHEMA public TO ${migratorId}`);
    await adminPool.query(`ALTER TABLE dispositivos OWNER TO ${migratorId}`);
    await adminPool.query(`ALTER TABLE sensores OWNER TO ${migratorId}`);
    await adminPool.query(`ALTER TABLE lecturas_telemetria OWNER TO ${migratorId}`);
    await adminPool.query(
        `ALTER FUNCTION validar_rango_lectura() OWNER TO ${migratorId}`
    );

    await adminPool.query(
        `GRANT SELECT ON dispositivos, sensores, lecturas_telemetria TO ${readerId}`
    );

    await adminPool.query(
        `GRANT INSERT ON lecturas_telemetria TO ${writerId}`
    );
    await adminPool.query(
        `GRANT SELECT (id) ON lecturas_telemetria TO ${writerId}`
    );
    await adminPool.query(
        `GRANT SELECT (id, valor_min, valor_max) ON sensores TO ${writerId}`
    );
    await adminPool.query(
        `GRANT USAGE ON SEQUENCE lecturas_telemetria_id_seq TO ${writerId}`
    );

    console.log('roles M03 configurados con minimo privilegio');
    await adminPool.end();
}

main().catch((err) => {
    console.error('fallo configurando roles:', err);
    process.exit(1);
});