# Reporte M07 Evolución compatible de documentos

## Integrantes

- Ruben Carrera Hilario
- Maria de los Angeles Vazquez Esperon
- Josue David Vazquez Trujillo

## Objetivo

Implementar versionado y migración compatible de los documentos CDRL en DynamoDB sin romper a los consumidores que ya existen.

## Qué se hizo

### Migración y rollback (Ruben)

- `src/db/migracionCompatible.js` agrega `schema_version: 1` a los documentos que no tienen versión, con una condición que evita escribir dos veces.
- `scripts/migrar_m07.js` prepara tres fixtures sintéticos, guarda el respaldo, migra, vuelve a migrar para probar que es repetible y revisa que los campos del consumidor anterior no cambien.
- `scripts/rollback_m07.js` quita la versión solo a los documentos del respaldo y los compara con su copia original.

### Consumidor compatible (David)

- `src/db/consumidorEventos.js` lee v1 y v2 en el mismo lote y adapta los v1 a la forma de v2.
- `src/db/cdrlFixturesM07.js` tiene fixtures v1, v2, mixtos e inválidos.
- `scripts/generar_evidencia_m07.js` comprueba la compatibilidad y genera `artifacts/m07-compatibilidad.json`.

### Pruebas, ADR y evidencia (Maria)

- `tests/m07_compatibilidad.test.js` con caso normal, dos casos límite y un fallo declarado.
- `docs/ADR-005-evolucion-compatible-m07.md` con la decisión, la tabla de compatibilidad y los límites.
- `scripts/generar_evidencia_m07_pruebas.js` genera `evidence/m07-pruebas.json`.
- `make verify` ahora corre la migración, el rollback y las dos evidencias de M07.

## Cómo se ejecuta

```bash
make setup
make verify
make run
```

Comandos sueltos:

```bash
npm run m07:migrar
npm run m07:rollback
node scripts/generar_evidencia_m07.js
node scripts/generar_evidencia_m07_pruebas.js
```

## Resultados

| Criterio | Dónde se comprueba | Resultado |
|---|---|---|
| La versión anterior sigue legible | `artifacts/m07-compatibilidad.json`, prueba 1 | Se leen los v1 y v2 del lote mixto sin rechazos |
| La migración es repetible | `artifacts/m07-migracion.json`, prueba 2 | Primera ejecución 3 migrados, segunda 0 |
| Rollback probado | `artifacts/m07-rollback.json`, prueba 3 | 3 de 3 restaurados, sin faltantes ni diferencias |
| Fallo declarado | prueba 4 | `schema_version: 3` y v2 incompleto se rechazan sin detener el lote |

El detalle de la última ejecución está en `evidence/m07-pruebas.json` y la salida completa en `evidence/m07-make-verify.txt`.

## Seguridad

Se usan solo fixtures sintéticos. La configuración sale de variables de entorno y no se guardan credenciales, tokens, datos personales ni cadenas de conexión.
