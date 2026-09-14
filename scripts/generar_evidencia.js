// junta el sha del commit y arma el json que pide la entrega
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
 
function main() {
  const sha = execSync('git rev-parse HEAD').toString().trim();
 
  const contrato = {
    hito: 'M01',
    commit: sha,
    entidades: ['dispositivos', 'sensores', 'lecturas_telemetria'],
    pruebas: ['caso_normal', 'caso_limite_vacio', 'caso_limite_exceso', 'fallo_declarado'],
  };
 
  fs.mkdirSync(path.join(__dirname, '..', 'artifacts'), { recursive: true });
  fs.mkdirSync(path.join(__dirname, '..', 'evidence'), { recursive: true });
 
  fs.writeFileSync(
    path.join(__dirname, '..', 'artifacts', 'm01-contrato-datos.json'),
    JSON.stringify(contrato, null, 2)
  );
  fs.writeFileSync(
    path.join(__dirname, '..', 'evidence', 'm01-data-contract.json'),
    JSON.stringify(contrato, null, 2)
  );
 
  console.log('evidencia generada con el commit ' + sha);
}
 
main();
