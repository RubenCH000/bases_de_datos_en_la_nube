# ADR 005 Evolución compatible de documentos (M07)

## Estado

Aceptado.

## Contexto

Desde M06 la tabla `cdrl_eventos` tiene dos versiones del evento: los v1 sin `schema_version` (los de M05) y los v2 con `schema_version: 2`, `firmware_version` y `quality_score`. En M06 se decidió no reescribir los v1 y normalizarlos al leer.

M07 pide versionar y migrar los documentos sin romper a los consumidores que ya existen: la versión anterior debe seguir siendo legible durante la transición, la migración debe poder repetirse, el rollback debe estar probado y este ADR debe dejar claros la compatibilidad y los límites.

## Decisión

### 1. Migración mínima: marcar la versión, no cambiar el contenido

`src/db/migracionCompatible.js` busca los documentos que no tienen `schema_version` y solo les agrega `schema_version: 1`. No convierte los v1 a v2 ni inventa `firmware_version` o `quality_score`.

Así, después de la migración todos los documentos tienen una versión explícita, pero los cinco campos que lee el consumidor anterior (`event_id`, `device_id`, `timestamp`, `metric_name`, `metric_value`) quedan iguales. `scripts/migrar_m07.js` lo comprueba campo por campo y lo guarda en `artifacts/m07-migracion.json` como `consumidor_anterior_conservado`.

Antes de cambiar algo, el script escribe el respaldo de los documentos en `artifacts/m07-respaldo.json`.

### 2. Repetible por condición en DynamoDB

Cada escritura usa `ConditionExpression: attribute_exists(event_id) AND attribute_not_exists(schema_version)`. Si el documento ya tiene versión, DynamoDB rechaza el cambio y la migración lo cuenta como `omitido`. Por eso correrla dos veces da el mismo estado final: la segunda ejecución registra `migrados: 0`.

Esto también cubre dos procesos migrando al mismo tiempo: solo uno puede escribir la versión.

### 3. Consumidor que acepta las dos versiones

`src/db/consumidorEventos.js` lee v1 y v2 en el mismo lote y entrega todo con la forma de v2. Los v1 salen con `firmware_version` y `quality_score` en `null` y con `adaptado_al_vuelo: true`. Un documento que no se puede leer se rechaza y se reporta, pero no detiene el resto del lote.

Esto hace que el orden de despliegue no importe: el consumidor nuevo lee documentos migrados y sin migrar, y el consumidor anterior sigue leyendo los mismos cinco campos.

### 4. Rollback acotado

`scripts/rollback_m07.js` toma los `event_id` del respaldo y ejecuta `REMOVE schema_version` solo cuando `schema_version = 1`. Un v2 nunca se toca. Después compara cada documento con su copia del respaldo y guarda el resultado en `artifacts/m07-rollback.json`. Repetir el rollback tampoco cambia nada.

## Compatibilidad

| Lector \ Documento | v1 sin versión | v1 migrado (`schema_version: 1`) | v2 |
|---|---|---|---|
| Consumidor anterior (5 campos) | Sí | Sí | Sí, ignora los campos nuevos |
| Consumidor M07 | Sí, adaptado | Sí, adaptado | Sí |

Versiones soportadas: 1 y 2 (`VERSIONES_SOPORTADAS` en `eventoValidador.js`). Cualquier otra se rechaza al escribir, al migrar (`DocumentoNoMigrableError`) y al consumir (`EventoNoConsumibleError`).

## Límites

- La migración no rellena datos de v2. Un v1 migrado sigue sin `firmware_version` ni `quality_score`; si se necesitan, tienen que venir del dispositivo.
- El rollback quita `schema_version: 1` de todos los documentos que aparecen en el respaldo. Si un documento ya tenía `schema_version: 1` antes de migrar, el rollback también se lo quitaría. Por eso el respaldo solo debe incluir documentos que la migración marcó (en `migrar_m07.js` son fixtures sintéticos sin versión).
- La migración usa `Scan`, que lee toda la tabla. Sirve para el volumen del laboratorio; con millones de eventos habría que hacerlo por partes y con límite de capacidad.
- Un documento inválido no se migra y queda reportado en `errores`; la migración no lo corrige.
- No hay transacciones entre documentos. Si la migración se corta a la mitad, unos quedan marcados y otros no, pero el consumidor lee los dos casos y volver a correr la migración termina el trabajo.

## Pruebas

`tests/m07_compatibilidad.test.js` usa un cliente DynamoDB en memoria con las mismas condiciones que la migración y el rollback:

1. Caso normal: migra los v1 sin versión y el consumidor lee el lote mixto completo.
2. Caso límite: la segunda ejecución de la migración no cambia nada; un lote vacío no falla.
3. Caso límite: el rollback regresa los v1 a su forma original y no toca un v2.
4. Fallo declarado: `schema_version: 3` y un v2 incompleto no se migran ni se consumen, y el resto del lote sí.

`make verify` además corre la migración y el rollback contra DynamoDB Local y junta todo en `evidence/m07-pruebas.json`.

## Consecuencias

- Todos los documentos nuevos y migrados tienen versión explícita, lo que facilita una futura v3.
- Mantener dos versiones obliga a conservar el adaptador del consumidor hasta que no queden v1 en la tabla.
- Cada cambio de esquema futuro debe venir con su respaldo, su condición de idempotencia y su rollback probado, igual que este.
