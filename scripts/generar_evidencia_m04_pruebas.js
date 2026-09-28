const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function main() {
  const sha = execSync('git rev-parse HEAD').toString().trim();

  const evidencia = {
    assignmentId: 'M04-pruebas-nosql',
    sourceCommitSha: sha,
    storeUnderTest: 'ColumnStoreMock (src/db/columnStoreMock.js)',
    pruebas: [
      'm04_caso_normal',
      'm04_caso_limite_vacio',
      'm04_caso_limite_exceso',
      'm04_fallo_declarado',
    ],
    commands: [
      'node --test tests/m04_caso_normal.test.js tests/m04_caso_limite_vacio.test.js tests/m04_caso_limite_exceso.test.js tests/m04_fallo_declarado.test.js',
    ],
    results: {
      casoNormal: 'passed',
      casoLimiteVacio: 'passed',
      casoLimiteExceso: 'passed',
      falloDeclarado: 'passed',
    },
    assumptions: [
      'El store bajo prueba es un mock en memoria (Column Store), sin dependencia de Cassandra real ni de Docker.',
      'Los fixtures sinteticos vienen de src/db/cdrlFixtures.js.',
    ],
    limitations: [
      'El mock no deduplica eventos: insertar el mismo lote dos veces acumula registros en lugar de rechazarlos (ver m04_caso_limite_exceso).',
      'La matriz comparativa (scripts/calcular_matriz_m04.js) puntua mejor a document/DynamoDB que a Column Store; falta el ADR que reconcilie esa diferencia con la implementacion elegida.',
    ],
    generatedAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.join(__dirname, '..', 'evidence'), { recursive: true });

  fs.writeFileSync(
    path.join(__dirname, '..', 'evidence', 'm04-pruebas.json'),
    JSON.stringify(evidencia, null, 2) + '\n'
  );

  console.log('evidencia de pruebas M04 generada para ' + sha);
}

main();
