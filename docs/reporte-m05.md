# Reporte M05 Almacén documental

## Integrantes

- Ruben Carrera Hilario
- Maria de los Angeles Vazquez Esperon
- Josue David Vazquez Trujillo

## Objetivo

El objetivo de M05 fue implementar un almacén documental para eventos CDRL utilizando DynamoDB.

La solución permite guardar, consultar, actualizar y eliminar eventos, además de validar documentos y evitar registros duplicados.

## Implementación

Los principales archivos de M05 son:

```text
src/db/nosqlConfig.js
src/db/eventoValidador.js
src/db/documentStore.js
scripts/crear_tabla_m05.js
docs/ADR-003-almacen-documental-m05.md
docs/reporte-m05.md
```

La configuración utiliza DynamoDB Local en el puerto 8000 y variables de entorno.

## Modelo documental

Los eventos utilizan los campos:

```text
event_id
device_id
timestamp
metric_name
metric_value
```

`event_id` es la clave principal.

## Índices

El índice `gsi_device_timestamp` permite consultar eventos por dispositivo y tiempo.

El índice `gsi_metric_timestamp` permite consultar eventos por métrica y tiempo.

## Operaciones

El almacén permite:

- Guardar un evento.
- Obtenerlo por `event_id`.
- Actualizar `metric_value`.
- Eliminar un evento.
- Consultar por dispositivo.
- Consultar por métrica.

La inserción es idempotente. Repetir el mismo documento no crea un registro adicional.

## Validación

Los documentos incompletos, con campos adicionales o valores inválidos son rechazados antes de enviarse a DynamoDB.

## Pruebas

Las pruebas de M05 comprueban:

1. Caso normal.
2. Evento duplicado.
3. Evento inexistente.
4. Documento inválido como fallo declarado.

Las pruebas y la verificación completa se ejecutan con:

```bash
make verify
```

## Evidencia

El script `scripts/generar_evidencia_m05.js` genera los resultados en las carpetas `artifacts/` y `evidence/`.

## Ejecución

```bash
make setup
make verify
make run
```

## Resultados

La ejecución de `make verify` finalizó correctamente con 18 pruebas aprobadas y 0 fallidas. Se comprobaron el caso normal, el evento duplicado, el evento inexistente y el rechazo de documentos inválidos. Los resultados quedaron guardados en `artifacts/` y `evidence/`.

## Limitaciones

- Se utiliza DynamoDB Local.
- No se realizó una prueba con carga de producción.
- El comportamiento del servicio real puede variar según la región de AWS.

## Conclusión

DynamoDB permite almacenar los eventos como documentos y consultarlos mediante la clave principal y dos índices.

La validación evita documentos incorrectos y la inserción idempotente evita registros duplicados durante los reintentos.
