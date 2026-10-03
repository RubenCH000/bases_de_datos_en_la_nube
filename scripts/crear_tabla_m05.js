// Crea la tabla documental de eventos y sus índices en DynamoDB (M05).
// Es idempotente: si la tabla ya existe no hace nada.
const {
    CreateTableCommand,
    DescribeTableCommand,
    ResourceNotFoundException,
    waitUntilTableExists,
} = require('@aws-sdk/client-dynamodb');
const { clienteBase, TABLA, INDICES } = require('../src/db/documentStore');

const definicionTabla = {
    TableName: TABLA,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
        { AttributeName: 'event_id', AttributeType: 'S' },
        { AttributeName: 'device_id', AttributeType: 'S' },
        { AttributeName: 'metric_name', AttributeType: 'S' },
        { AttributeName: 'timestamp', AttributeType: 'N' },
    ],
    KeySchema: [{ AttributeName: 'event_id', KeyType: 'HASH' }],
    GlobalSecondaryIndexes: [
        {
            IndexName: INDICES.porDispositivo,
            KeySchema: [
                { AttributeName: 'device_id', KeyType: 'HASH' },
                { AttributeName: 'timestamp', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
        },
        {
            IndexName: INDICES.porMetrica,
            KeySchema: [
                { AttributeName: 'metric_name', KeyType: 'HASH' },
                { AttributeName: 'timestamp', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
        },
    ],
};

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// DynamoDB Local tarda unos segundos en aceptar conexiones después de arrancar.
async function tablaExiste(intentos = 15) {
    for (let intento = 1; ; intento++) {
        try {
            await clienteBase.send(new DescribeTableCommand({ TableName: TABLA }));
            return true;
        } catch (error) {
            if (error instanceof ResourceNotFoundException) {
                return false;
            }
            if (intento >= intentos) {
                throw error;
            }
            await esperar(2000);
        }
    }
}

async function crearTabla() {
    if (await tablaExiste()) {
        console.log(`la tabla ${TABLA} ya existe`);
        return false;
    }

    await clienteBase.send(new CreateTableCommand(definicionTabla));
    await waitUntilTableExists({ client: clienteBase, maxWaitTime: 30 }, { TableName: TABLA });
    console.log(`tabla ${TABLA} creada con los indices ${Object.values(INDICES).join(', ')}`);
    return true;
}

if (require.main === module) {
    crearTabla().catch((error) => {
        console.error(`no se pudo crear la tabla: ${error.message}`);
        process.exit(1);
    });
}

module.exports = { crearTabla, definicionTabla };
