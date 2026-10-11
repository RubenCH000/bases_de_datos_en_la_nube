// Crea la tabla de auditoría de M06 en DynamoDB.
// Es idempotente: si la tabla ya existe, no la vuelve a crear.
const {
    CreateTableCommand,
    DescribeTableCommand,
    ResourceNotFoundException,
    waitUntilTableExists,
} = require('@aws-sdk/client-dynamodb');

const { clienteBase } = require('../src/db/documentStore');
const { TABLA_AUDITORIA } = require('../src/db/auditLog');

const definicionTablaAuditoria = {
    TableName: TABLA_AUDITORIA,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
        {
            AttributeName: 'audit_id',
            AttributeType: 'S',
        },
    ],
    KeySchema: [
        {
            AttributeName: 'audit_id',
            KeyType: 'HASH',
        },
    ],
};

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function tablaExiste(intentos = 15) {
    for (let intento = 1; intento <= intentos; intento++) {
        try {
            await clienteBase.send(new DescribeTableCommand({
                TableName: TABLA_AUDITORIA,
            }));

            return true;
        } catch (error) {
            if (error instanceof ResourceNotFoundException) {
                return false;
            }

            if (intento === intentos) {
                throw error;
            }

            await esperar(2000);
        }
    }

    return false;
}

async function crearTablaAuditoria() {
    if (await tablaExiste()) {
        console.log(`la tabla ${TABLA_AUDITORIA} ya existe`);
        return false;
    }

    await clienteBase.send(new CreateTableCommand(definicionTablaAuditoria));

    await waitUntilTableExists(
        {
            client: clienteBase,
            maxWaitTime: 30,
        },
        {
            TableName: TABLA_AUDITORIA,
        },
    );

    console.log(`tabla ${TABLA_AUDITORIA} creada`);
    return true;
}

if (require.main === module) {
    crearTablaAuditoria().catch((error) => {
        console.error(`no se pudo crear la tabla de auditoria: ${error.message}`);
        process.exit(1);
    });
}

module.exports = {
    crearTablaAuditoria,
    definicionTablaAuditoria,
};