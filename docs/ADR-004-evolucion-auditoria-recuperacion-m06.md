# ADR 004 Evolución, auditoría y recuperación del almacén de eventos (M06)

## Estado

Aceptado.

## Contexto

En M05 el evento CDRL tiene cinco campos y el validador rechaza cualquier campo adicional. Ahora los dispositivos con firmware nuevo también envían la versión de firmware y una calificación de calidad de la lectura.

La tabla `cdrl_eventos` ya tiene eventos guardados con la estructura anterior. M06 pide que la versión antigua y la nueva convivan o migren según una estrategia, que una operación quede auditada sin secretos y que se pueda recuperar un fixture después de una falla controlada.

## Evolución del documento

### Versiones

**Versión 1** (M05). No tiene `schema_version`.

```json
{
  "event_id": "evt_001",
  "device_id": "NODE-CDRL-A1",
  "timestamp": 1790000000000,
  "metric_name": "cpu_temperature",
  "metric_value": 45.2
}
```

**Versión 2** (M06). Agrega `schema_version`, `firmware_version` y `quality_score`.

```json
{
  "schema_version": 2,
  "event_id": "evt_v2_001",
  "device_id": "NODE-CDRL-A1",
  "timestamp": 1790000001500,
  "metric_name": "cpu_temperature",
  "metric_value": 46.8,
  "firmware_version": "2.1.0",
  "quality_score": 0.97
}
```

### Decisión: convivencia y normalización al leer

Los documentos v1 no se reescriben. Las dos versiones conviven en la misma tabla y la aplicación las lee a través de `src/db/eventoLector.js`, que entrega siempre la forma de la versión actual.

Se eligió esta estrategia porque:

- Una migración masiva escribe todos los documentos de golpe, consume capacidad de escritura y, si falla a la mitad, deja la tabla en un estado difícil de verificar.
- Los eventos de telemetría casi no se vuelven a modificar después de guardarse, así que reescribirlos no aporta valor.
- La clave primaria y los índices `gsi_device_timestamp` y `gsi_metric_timestamp` no cambian, por lo que las consultas de M05 funcionan igual para las dos versiones.

### Cómo se detecta la versión

- Si el documento no tiene `schema_version`, se considera v1, porque es la única forma en que existían antes de M06.
- Si tiene `schema_version`, debe ser 1 o 2. Cualquier otra versión se rechaza al escribir (`EventoInvalidoError`) y al leer (`VersionNoSoportadaError`).

### Validación al escribir (`src/db/eventoValidador.js`)

- Se mantienen todas las reglas de M05.
- Un documento v1 no puede traer `firmware_version` ni `quality_score`. Se siguen rechazando los campos que no pertenecen a su versión.
- En v2, `firmware_version` y `quality_score` son obligatorios.
- `firmware_version` debe tener el formato `X.Y.Z`.
- `quality_score` debe ser un número entre 0 y 1, incluyendo ambos extremos.

### Normalización al leer (`src/db/eventoLector.js`)

`normalizarEvento()` devuelve:

- `schema_version: 2` para todos los documentos.
- `version_origen` con la versión con la que se guardó (1 o 2), para poder separar los datos reales de los completados.
- `firmware_version` y `quality_score` en `null` cuando el documento es v1. No se inventa un valor, porque un número falso podría parecer una lectura real del sensor.

El almacén ofrece `obtenerEventoNormalizado()` y `consultarPorDispositivoNormalizado()`. `obtenerEvento()` sigue devolviendo el documento tal como está guardado, para los respaldos y la auditoría.

`resumirVersiones()` cuenta cuántos documentos hay de cada versión. Si más adelante se decide migrar los v1, este conteo permite saber cuánto falta.

La comparación de idempotencia de `guardarEvento()` usa la forma normalizada. Así, un reintento idéntico no se duplica, y un `event_id` repetido con otra versión o con otros datos genera `EventoDuplicadoError`.

### Fixtures

`src/db/cdrlFixtures.js` exporta el mismo arreglo v1 de siempre, para no romper M04 y M05, y además:

- `fixtures.v2`: dos eventos v2 con otros `event_id`.
- `fixtures.mixtos`: los cuatro v1 y los dos v2 juntos.

### Pruebas de evolución (`tests/m06_evolucion.test.js`)

- Caso normal: los fixtures v1 y v2 son válidos y se leen con la misma forma.
- Caso límite: `quality_score` acepta 0 y 1, pero rechaza 1.01.
- Caso límite: un v1 con campos de v2 se rechaza, y un v1 con `schema_version: 1` explícito se acepta.
- Fallo declarado: `schema_version: 3` y un v2 sin `firmware_version` no se guardan.
- Coexistencia en DynamoDB Local: un v1 y un v2 del mismo dispositivo se guardan y la consulta por índice los devuelve normalizados.

### Alternativa descartada

Se descartó migrar todos los documentos v1 a v2 con un script. Habría que escribir valores en `null` en todos los eventos históricos sin ganar información nueva, y el riesgo de una migración interrumpida es mayor que el de mantener un lector que conoce dos versiones.

### Consecuencias

- La aplicación tiene que leer con el lector normalizado. Leer directo de la tabla devuelve documentos de dos formas.
- Las consultas que filtren o promedien `quality_score` deben ignorar los `null` de los eventos v1.
- Para agregar una versión 3 habrá que actualizar el validador, el lector y sus pruebas.

## Auditoría

Sección a cargo de la parte de auditoría y recuperación del equipo.

## Recuperación ante falla controlada

Sección a cargo de la parte de auditoría y recuperación del equipo.
