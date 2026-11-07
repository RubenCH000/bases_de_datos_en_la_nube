# Reporte M09 Seguridad NoSQL y auditoría

## Integrantes

- Ruben Carrera Hilario
- Maria de los Angeles Vazquez Esperon
- Josue David Vazquez Trujillo

## Objetivo

Diseñar controles por colección y operación sobre DynamoDB, probar el abuso y demostrar una auditoría útil que no registre secretos, con una remediación documentada y probada.

## Qué se hizo

### Controles, auditoría y remediación (Ruben)

- `src/security/nosqlAccessControl.js`: matriz de mínimo privilegio rol × colección × acción (`lector`, `escritor`, `operador`, `auditor`, `administrador` sobre `cdrl_eventos` y `audit_log`) y `AccesoDenegadoError`.
- `src/db/secureDocumentStore.js`: cada operación se autoriza antes de llegar a DynamoDB y deja un registro `exito`, `fallo` o `denegado`.
- `src/db/auditLog.js`: la auditoría guarda solo actor, acción, recurso, fecha, documentos afectados y resultado.
- `scripts/remediacion_m09.js` (`npm run m09:remediacion`): reproduce la política insegura (lector con `put`) y la corrige; genera `artifacts/m09-remediacion.json`.

### Pruebas, ADR y evidencia (Maria)

- `tests/m09_seguridad.test.js` con caso normal, dos casos límite, la remediación, la revisión de secretos y un fallo declarado.
- `docs/ADR-007-seguridad-nosql-auditoria-m09.md` con la matriz, el trade-off contra IAM y los límites.
- `scripts/generar_evidencia_m09_pruebas.js` genera `evidence/m09-pruebas.json` con las pruebas y los criterios de M09.

### Integración y cierre (David)

- Agregar la remediación y la evidencia de pruebas a `make verify` y `make artifact`.
- Correr `make verify` real y guardar la salida en `evidence/m09-make-verify.txt`.
- Poner el tag `week-10-final` en `main` con todo fusionado y sacar el SHA para Classroom.

## Cómo se ejecuta

```bash
make setup
make verify
make run
```

Comandos sueltos:

```bash
npm run m09:remediacion
node --test tests/m09_seguridad.test.js
node scripts/generar_evidencia_m09_pruebas.js
```

## Resultados

Pruebas: 6 de 6 aprobadas (`evidence/m09-pruebas.json`).

| Criterio | Dónde se comprueba | Resultado |
|---|---|---|
| Lecturas no autorizadas fallan | prueba 3 y remediación | El escritor no puede leer eventos, el lector no puede leer la auditoría y el auditor no puede leer eventos: `AccesoDenegadoError` sin ejecutar la consulta |
| Escrituras no autorizadas fallan | prueba 3 y remediación | El lector no puede crear ni borrar, el auditor no puede borrar la auditoría y un rol inventado no puede escribir |
| Mínimo privilegio por colección y operación | prueba 2 | 5 roles × 2 colecciones × 5 acciones coinciden con la matriz; lo desconocido se niega |
| Eventos con actor, acción, recurso y resultado | prueba 1 y `artifacts/m09-remediacion.json` | Cada operación, permitida o negada, deja su registro |
| Sin secretos en la auditoría | prueba 5 y revisión en la remediación | `password`, `token` y `connection_string` del documento no aparecen en la auditoría |
| Remediación documentada y probada | prueba 4, ADR 007 y la remediación contra DynamoDB Local | Con la política insegura el lector escribía (`exito`); con la segura se niega (`denegado`) |
| Fallo declarado | prueba 6 | Si DynamoDB o la auditoría fallan, el error se propaga y queda `fallo`; un contexto sin actor se rechaza sin ejecutar nada |

Remediación contra DynamoDB Local (`artifacts/m09-remediacion.json`):

| Paso | Actor | Acción | Resultado auditado |
|---|---|---|---|
| Antes, política insegura | lector | `put` en `cdrl_eventos` | `exito` (vulnerabilidad) |
| Después, política segura | lector | `put` en `cdrl_eventos` | `denegado` |
| Lectura no autorizada | escritor | `get` en `cdrl_eventos` | `denegado` |

## Seguridad

Se usan solo fixtures sintéticos. La configuración sale de variables de entorno y no se guardan credenciales, tokens, datos personales ni cadenas de conexión. Los valores sensibles de la prueba 5 son falsos y solo existen para comprobar que la auditoría no los copia.
