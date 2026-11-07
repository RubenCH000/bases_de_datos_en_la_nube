# ADR 007 Control de acceso por colección y operación, y auditoría sin secretos (M09)

## Estado

Aceptado.

## Contexto

Hasta M08 cualquier código que importara `documentStore.js` podía leer, escribir, actualizar o borrar en `cdrl_eventos` y en `audit_log`. La auditoría de M06 registraba operaciones, pero no había nada que impidiera una escritura indebida, y una petición rechazada no dejaba rastro.

M09 pide controles por colección y operación, probar el abuso (lecturas y escrituras no autorizadas deben fallar), eventos de auditoría con actor, acción, recurso y resultado sin registrar secretos, y documentar y probar una remediación.

DynamoDB Local no aplica políticas IAM: acepta cualquier credencial. Por eso el control vive en la aplicación y se diseña con la misma forma que tendría una política IAM en AWS (recurso = tabla, acción = operación de DynamoDB).

## Decisión

### 1. Matriz de permisos explícita, negada por defecto

`src/security/nosqlAccessControl.js` define una `POLITICA_SEGURA` congelada (`Object.freeze`) de rol → colección → acciones:

| Rol | `cdrl_eventos` | `audit_log` |
|---|---|---|
| `lector` | `get`, `query` | — |
| `escritor` | `put` | — |
| `operador` | `update`, `delete` | — |
| `auditor` | — | `get`, `query` |
| `administrador` | todas | todas |

Todo lo que no aparece está prohibido: un rol desconocido, otra tabla o una acción fuera del catálogo (por ejemplo `scan`) da `false`. Nadie salvo el administrador puede borrar o escribir en `audit_log`, ni siquiera el auditor, así que el rastro no se puede limpiar desde la aplicación.

### 2. Toda operación pasa por un solo punto que autoriza y audita

`src/db/secureDocumentStore.js` envuelve cada operación (`obtenerEventoSeguro`, `guardarEventoSeguro`, `actualizarValorSeguro`, `eliminarEventoSeguro`, `consultarPorDispositivoSeguro`, `listarAuditoriaSeguro`) en `ejecutarOperacionAuditada`:

1. Valida que el contexto traiga `actor` y `rol`.
2. Autoriza contra la política **antes** de tocar DynamoDB. Si se niega, lanza `AccesoDenegadoError` y registra `denegado` con 0 documentos.
3. Ejecuta la operación. Si falla, registra `fallo` y propaga el error original.
4. Si sale bien, registra `exito` con el número de documentos afectados.

### 3. La auditoría guarda solo metadatos

`src/db/auditLog.js` escribe en `audit_log` únicamente `audit_id`, `actor`, `accion`, `recurso`, `fecha`, `documentos_afectados` y `resultado` (`exito`, `fallo` o `denegado`). Nunca copia el documento, sus valores, credenciales ni cadenas de conexión. `validarRegistro` rechaza registros incompletos, conteos negativos o resultados fuera de catálogo, y `audit_id` se escribe con `attribute_not_exists` para que un registro no se sobrescriba.

### 4. Los errores no se ocultan

- Si la operación falla, el error que sale es el de la operación, no el de la auditoría.
- Si la auditoría falla en una operación exitosa, se lanza el error: no se reporta éxito sin rastro.
- Si se niega el acceso y además falla la auditoría, se conserva el `AccesoDenegadoError` y se marca `auditoria_fallida = true`.

## Remediación documentada

`scripts/remediacion_m09.js` reproduce la vulnerabilidad y su corrección contra DynamoDB Local:

- **Antes:** una política insegura que le daba `put` al rol `lector`. El lector logra escribir un evento y la auditoría lo registra como `exito`.
- **Después:** con `POLITICA_SEGURA` (mínimo privilegio, `put` retirado al lector) la misma escritura se niega, y una lectura del `escritor` también. Ambas quedan como `denegado`.

El resultado queda en `artifacts/m09-remediacion.json`, que además revisa que ningún campo de la auditoría tenga nombres de secreto.

## Trade-off

| Opción | A favor | En contra |
|---|---|---|
| Sin control, confiar en el código (antes de M09) | Simple | Cualquier módulo puede escribir o borrar; el abuso no deja rastro |
| Control en la aplicación con matriz rol × colección × acción (elegida) | Funciona igual en DynamoDB Local y en AWS; se prueba sin infraestructura; cada intento queda auditado | Si alguien usa el cliente de DynamoDB directo, se salta el control; la matriz se mantiene a mano |
| Solo políticas IAM en AWS | El control lo aplica AWS aunque el código tenga errores | DynamoDB Local las ignora, no se puede probar en Docker y no audita los rechazos en nuestra tabla |
| Auditar el documento completo | Permite reconstruir qué cambió | Copia datos y posibles secretos a otra tabla con otra retención; viola el criterio de M09 |

En AWS lo ideal es combinar las dos: esta matriz en la aplicación y políticas IAM equivalentes por rol (por ejemplo, el rol de solo lectura con `dynamodb:GetItem` y `dynamodb:Query` sobre `cdrl_eventos`, y `Condition` sobre el índice) como segunda barrera.

## Límites

- El rol llega en el contexto de la llamada y no se verifica su identidad: en esta etapa no hay autenticación. Una capa de autenticación (Cognito, IAM o tokens firmados) tendría que fijarlo.
- `documentStore.js` sigue exportando las funciones sin control para los scripts de migración y fixtures. Quien las importe directamente se salta la autorización; por convención solo se usan en scripts de administración.
- `listarAuditoria` usa `Scan`, que crece con la tabla. Sirve para el laboratorio; con mucho volumen haría falta un índice por fecha o por actor.
- La auditoría no se firma ni se encadena (hash del registro anterior), así que alguien con acceso directo a DynamoDB podría alterarla.

## Pruebas

`tests/m09_seguridad.test.js` inyecta la operación y un registrador de auditoría en memoria, así que no depende del contenedor:

1. Caso normal: lector (`get`, `query`), escritor (`put`) y auditor (`query` en `audit_log`) operan y cada operación queda con actor, acción, recurso, documentos y `exito`.
2. Caso límite: la matriz completa rol × colección × acción coincide con el mínimo privilegio; roles, tablas o acciones desconocidas se niegan, y la política no se puede modificar en ejecución.
3. Caso límite: siete intentos de abuso (escrituras y lecturas no autorizadas, auditor sobre eventos, auditor borrando su rastro, rol inventado) fallan con `AccesoDenegadoError`, **no llegan a ejecutar la operación** y quedan como `denegado`.
4. Remediación: la política insegura deja escribir al lector y la segura lo niega, sin contaminar la política real.
5. Sin secretos: un documento con `password`, `api_token` y `connection_string` no deja ninguno de esos datos en la auditoría.
6. Fallo declarado: si DynamoDB falla se propaga el error y se registra `fallo`; si falla la auditoría no se oculta; un contexto sin actor se rechaza sin ejecutar nada.

`scripts/generar_evidencia_m09_pruebas.js` corre las pruebas, lee `artifacts/m09-remediacion.json` y deja los criterios en `evidence/m09-pruebas.json`.

## Consecuencias

- Cualquier operación nueva sobre DynamoDB debe entrar por `ejecutarOperacionAuditada` y tener su acción en la matriz.
- Un rol nuevo se agrega en `POLITICA_SEGURA` con solo las acciones que necesita.
- Los rechazos ahora son visibles en `audit_log`, lo que permite detectar intentos de abuso repetidos de un mismo actor.
