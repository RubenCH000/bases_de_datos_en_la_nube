const criterios = [
    { id: 'queries', weight: 30 },
    { id: 'scale', weight: 20 },
    { id: 'consistency', weight: 15 },
    { id: 'cost', weight: 15 },
    { id: 'failures', weight: 10 },
    { id: 'reproducibility', weight: 10 },
];

const opciones = {
    document_dynamodb: [5, 5, 4, 4, 4, 5],
    graph_neo4j: [2, 3, 4, 2, 3, 3],
    column_cassandra: [4, 5, 3, 3, 4, 3],
    object_s3: [2, 5, 4, 5, 4, 3],
};
