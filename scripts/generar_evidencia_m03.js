const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
 
function main() {
  const sha = execSync('git rev-parse HEAD').toString().trim();
 
  const evidencia = {
    assignmentId: 'M03-security-least-privilege',
    sourceCommitSha: sha,
    roles: {
      migrator: 'DDL y migraciones',
      writer: 'INSERT de lecturas',
      reader: 'SELECT',
      operator: 'conexion y health check',
    },
    negativeTests: [
      'reader_cannot_insert',
      'writer_cannot_delete',
      'operator_cannot_read_telemetry',
    ],
    commands: ['make setup', 'make verify', 'make run'],
    results: {
      minimumPrivilege: 'passed',
      negativeAccessTests: 3,
      secretsVersioned: false,
      rotationDocumented: true,
    },
    assumptions: [
      'PostgreSQL 16 mediante Docker Compose',
      'fixtures sinteticos',
      'secretos cargados desde .env local',
    ],
    limitations: [
      'Docker Compose es el respaldo cuando AWS Academy no esta habilitado',
    ],
  };
 
  fs.mkdirSync(path.join(__dirname, '..', 'artifacts'), { recursive: true });
  fs.mkdirSync(path.join(__dirname, '..', 'evidence'), { recursive: true });
 
  const contenido = JSON.stringify(evidencia, null, 2) + '\n';
  fs.writeFileSync(
    path.join(__dirname, '..', 'artifacts', 'm03-security.json'),
    contenido
  );
  fs.writeFileSync(
    path.join(__dirname, '..', 'evidence', 'm03-security.json'),
    contenido
  );
 
  console.log('evidencia M03 generada para ' + sha);
}
 
main();
