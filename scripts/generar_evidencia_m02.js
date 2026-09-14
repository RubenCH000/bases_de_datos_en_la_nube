// arma el json de evidencia del hito M02
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function main() {
  const sha = execSync('git rev-parse HEAD').toString().trim();

  const contrato = {
    hito: 'M02',
    commit: sha,
    invariantes: [
      'sensores.valor_min < sensores.valor_max',
      'trigger valida el rango de la lectura contra su sensor',
    ],
    consultas_parametrizadas: ['obtenerLecturasPorSensor', 'obtenerLecturasPorRangoFechas'],
    pruebas: ['caso_normal', 'caso_vacio', 'caso_limite', 'fallo_declarado'],
  };

  fs.mkdirSync(path.join(__dirname, '..', 'artifacts'), { recursive: true });
  fs.mkdirSync(path.join(__dirname, '..', 'evidence'), { recursive: true });

  fs.writeFileSync(
    path.join(__dirname, '..', 'artifacts', 'm02-relational-model.json'),
    JSON.stringify(contrato, null, 2)
  );
  fs.writeFileSync(
    path.join(__dirname, '..', 'evidence', 'm02-relational-model.json'),
    JSON.stringify(contrato, null, 2)
  );

  console.log('evidencia M02 generada con el commit ' + sha);
}

main();
