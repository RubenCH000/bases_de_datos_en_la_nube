# ADR 003 Almacén documental para eventos CDRL

## Estado

Aceptado.

## Contexto

CDRL recibe eventos generados por dispositivos. Cada evento tiene un identificador, dispositivo, fecha, nombre de métrica y valor.

M05 necesita guardar estos eventos como documentos, evitar duplicados, validar su estructura y consultarlos por dispositivo, métrica y rango de tiempo.

## Decisión

Se utilizará DynamoDB como almacén documental. Para las pruebas locales se utilizará DynamoDB Local mediante Docker Compose en el puerto 8000.

La configuración se obtiene mediante variables de entorno y no se guardan credenciales reales en el repositorio.

## Estructura del documento

```json
{
  "event_id": "evt_001",
  "device_id": "NODE-CDRL-01",
  "timestamp": 1790000000000,
  "metric_name": "cpu_temperature",
  "metric_value": 65.4
}
```

## Clave principal

La tabla `cdrl_eventos` utiliza `event_id` como partition key.

Esta clave se usa para obtener, actualizar y eliminar un evento. También permite comprobar si el evento ya existe.

## Índice por dispositivo

```text
Nombre: gsi_device_timestamp
Partition key: device_id
Sort key: timestamp
```

Este índice es utilizado por `consultarPorDispositivo()` para obtener los eventos de un dispositivo dentro de un rango de tiempo.

## Índice por métrica

```text
Nombre: gsi_metric_timestamp
Partition key: metric_name
Sort key: timestamp
```

Este índice es utilizado por `consultarPorMetrica()` para obtener las lecturas de una métrica dentro de un rango de tiempo.

Las consultas utilizan `Query` y no necesitan recorrer toda la tabla con `Scan`.

## Validación

Antes de guardar un evento se comprueba:

- Que tenga todos los campos obligatorios.
- Que no tenga campos adicionales.
- Que `event_id` y `device_id` tengan el formato correcto.
- Que `timestamp` sea un entero positivo.
- Que la métrica esté permitida.
- Que `metric_value` sea un número.

Los documentos inválidos generan `EventoInvalidoError`.

## Inserción idempotente

La inserción utiliza `attribute_not_exists(event_id)`.

Si se envía dos veces el mismo documento, no se crea otro registro. Si se utiliza el mismo `event_id` con datos diferentes, se genera `EventoDuplicadoError`.

## Consistencia costo y fallos

La consulta por `event_id` utiliza lectura consistente. La tabla trabaja con el modo `PAY_PER_REQUEST`, por lo que no necesita una capacidad fija. DynamoDB Local permite realizar la práctica sin costos.

Se consideran los siguientes fallos:

- Documento inválido.
- Evento duplicado con contenido diferente.
- Evento inexistente.
- Error de conexión con DynamoDB.
- Configuración incorrecta.

## Alternativa descartada

Se descartó utilizar `ColumnStoreMock` como solución final porque solamente es un prototipo en memoria y no representa un servicio persistente.

También se descartó Cassandra porque requiere más configuración y mantenimiento para un equipo pequeño.

## Consecuencias

La solución permite CRUD por identificador, consultas mediante índices, validación e inserciones idempotentes.

Como limitación, DynamoDB Local no representa completamente el rendimiento y comportamiento del servicio real en AWS.