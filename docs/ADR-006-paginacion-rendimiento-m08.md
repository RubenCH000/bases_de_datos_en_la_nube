# ADR 006 Paginación estable e índice por dispositivo (M08)

## Estado

Aceptado.

## Contexto

La consulta más común sobre `cdrl_eventos` es "los eventos de un dispositivo en un rango de tiempo". Hasta M07 se resolvía de dos formas: con `Scan` (en la migración) o con un `Query` sobre `gsi_device_timestamp` que regresaba todo de una vez, sin límite de página.

M08 pide paginación estable, un índice justificado con mediciones y un trade-off documentado. Con unos cuantos eventos cualquier forma funciona; el problema aparece cuando un dispositivo acumula miles de lecturas y una sola respuesta ya no cabe ni en tiempo ni en tamaño (DynamoDB corta cada respuesta en 1 MB).

## Decisión

### 1. Query sobre `gsi_device_timestamp`, no Scan

El índice `gsi_device_timestamp` (partición `device_id`, orden `timestamp`) ya existe desde M05. Con `Query` DynamoDB lee solo los elementos de ese dispositivo y ese rango, ya ordenados. Con `Scan` + `FilterExpression` lee la tabla completa y filtra después: el costo crece con el tamaño de la tabla, no con el tamaño del resultado.

`scripts/benchmark_m08.js` mide las dos opciones con los mismos fixtures (3 dispositivos × 120 eventos, `src/db/cdrlFixturesM08.js`) y guarda p50, p95, tamaño de muestra, entorno y elementos evaluados en `artifacts/m08-benchmark.json`.

### 2. Cursor opaco que congela el rango

`src/db/paginacionEventos.js` regresa páginas de 25 eventos por defecto (máximo 100) y un `siguiente_cursor`. El cursor es Base64URL de un JSON con:

- `version` del formato del cursor,
- `device_id`,
- `limite`,
- `desde` y `hasta`,
- `last_evaluated_key` que regresó DynamoDB.

La primera página fija `hasta` (como máximo, la hora actual). Las páginas siguientes reutilizan ese mismo rango, así que un evento que llega a mitad del recorrido no se mete entre páginas ni desplaza a los demás. Para verlo hay que empezar un recorrido nuevo.

Se usa `LastEvaluatedKey` en vez de `offset` porque DynamoDB no tiene saltos por posición: un offset obligaría a leer y descartar todas las páginas anteriores.

### 3. El cursor se valida antes de consultar

Antes de llamar a DynamoDB se revisa que el cursor sea Base64URL, que tenga JSON válido, la versión soportada, un rango coherente, una clave completa, que pertenezca al mismo dispositivo y que el límite no cambie. Cualquier falla lanza `CursorInvalidoError` y no se hace la consulta.

## Trade-off

| Opción | A favor | En contra |
|---|---|---|
| `Scan` + filtro (línea base) | No necesita índice; sirve para cualquier filtro | Lee toda la tabla en cada consulta; el p95 crece con la tabla aunque el resultado sea pequeño |
| `Query` en GSI + cursor (elegida) | Lee solo lo que regresa; orden por tiempo gratis; páginas de tamaño fijo | El GSI ocupa almacenamiento y cada escritura en la tabla también escribe en el índice |
| Paginación por `offset` | Fácil de entender ("página 3") | DynamoDB no la soporta; habría que leer las páginas anteriores |

El índice cuesta en escrituras y almacenamiento, pero en CDRL se escriben eventos una sola vez y se consultan muchas veces por dispositivo, así que conviene pagar ese costo.

## Límites

- El GSI es de consistencia eventual: un evento recién escrito puede tardar un poco en aparecer en el `Query`.
- El cursor no está firmado. Alguien puede modificarlo a mano; la validación evita cursores mal formados o de otro dispositivo, pero no oculta los datos que trae (no contiene nada sensible, solo claves y el rango).
- Si un evento se borra a mitad del recorrido, simplemente deja de aparecer; si se escribe uno con `timestamp` dentro del rango ya recorrido, no se ve hasta el siguiente recorrido.
- Cuando el total es múltiplo exacto del límite, DynamoDB deja un último cursor y la página siguiente llega vacía. El recorrido termina bien, pero cuesta una lectura más.
- Las mediciones son de DynamoDB Local en Docker con pocos cientos de eventos. Sirven para comparar Scan contra Query en el mismo entorno, no como tiempos esperados en AWS.

## Pruebas

`tests/m08_paginacion.test.js` usa un cliente DynamoDB en memoria que se comporta como el `Query` del índice (orden, `ExclusiveStartKey` y `LastEvaluatedKey` al llenarse el límite):

1. Caso normal: los 120 eventos de un dispositivo salen en 5 páginas (25 × 4 + 20), en orden y sin duplicados.
2. Caso límite: un evento nuevo que llega después de la primera página no aparece en el recorrido; un recorrido nuevo sí lo ve.
3. Caso límite: límites 1 y 100, total múltiplo del límite, dispositivo sin eventos y límites fuera de rango.
4. Fallo declarado: cursores inválidos (no Base64URL, no JSON, versión 2, clave incompleta, rango alterado, otro dispositivo, otro límite) se rechazan con `CursorInvalidoError` sin consultar DynamoDB.

`make verify` además recorre la paginación contra DynamoDB Local en el benchmark y junta todo en `evidence/m08-pruebas.json`.

## Consecuencias

- Las consultas por dispositivo tienen un costo acotado por página y no dependen del tamaño de la tabla.
- Cualquier consulta nueva que no encaje en `gsi_device_timestamp` o `gsi_metric_timestamp` necesita su propio índice o se queda en Scan; hay que medirla antes de agregar índices.
- Si cambia el formato del cursor se sube `VERSION_CURSOR` y los cursores viejos se rechazan en lugar de interpretarse mal.
