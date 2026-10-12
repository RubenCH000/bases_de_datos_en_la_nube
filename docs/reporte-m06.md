# Reporte M06 Evolución auditoría y recuperación

## Integrantes

- Ruben Carrera Hilario
- Maria de los Angeles Vazquez Esperon
- Josue David Vazquez Trujillo

## Objetivo

El objetivo de M06 es permitir que dos versiones del documento CDRL convivan en DynamoDB, registrar operaciones importantes y comprobar la recuperación de documentos después de una falla controlada.

## Evolución del documento

Los eventos de la versión 1 mantienen la estructura utilizada en M05.

La versión 2 agrega:

- `schema_version`
- `firmware_version`
- `quality_score`

Los documentos antiguos no se modifican. Al leerlos, `src/db/eventoLector.js` los normaliza a la estructura actual sin inventar valores para los campos que no existían.

## Auditoría

La auditoría utiliza la tabla `audit_log` de DynamoDB.

Cada registro incluye:

- Identificador de auditoría.
- Actor.
- Acción realizada.
- Fecha.
- Número de documentos afectados.
- Resultado de la operación.

No se guardan contraseñas, tokens, cadenas de conexión ni documentos completos.

El archivo `src/db/auditLog.js` permite registrar y consultar las operaciones realizadas durante la recuperación.

## Falla controlada

El archivo `scripts/falla_controlada_m06.js` realiza las siguientes acciones:

1. Prepara cuatro fixtures sintéticos.
2. Crea un respaldo.
3. Borra los documentos respaldados.
4. Restaura los documentos.
5. Comprueba cuántos fueron recuperados.
6. Identifica documentos faltantes.
7. Mide el tiempo de recuperación.
8. Registra las operaciones en `audit_log`.

El script solamente elimina los cuatro documentos controlados de M06. No borra toda la tabla.

## Artefactos

El proceso genera los siguientes archivos:

```text
artifacts/m06-respaldo.json
artifacts/m06-recuperacion.json
artifacts/m06-auditoria.json
```

## Resultados

La ejecución de la falla controlada terminó correctamente.

Se respaldaron cuatro documentos sintéticos, después se eliminaron los mismos cuatro documentos y finalmente se restauraron desde el respaldo.

Los resultados obtenidos fueron:

- Documentos respaldados: 4.
- Documentos eliminados: 4.
- Documentos recuperados: 4.
- Documentos faltantes: 0.
- Tiempo de recuperación: registrado en `artifacts/m06-recuperacion.json`.
- Resultado final: `exito`.

Los resultados completos quedaron guardados en `artifacts/m06-recuperacion.json`.

## Ejecución

La preparación y la verificación se realizan con:

```bash
make setup
make verify
make run
```

`make setup` prepara PostgreSQL, DynamoDB Local y las tablas necesarias. `make verify` ejecuta las pruebas y genera las evidencias. `make run` inicia la aplicación.

## Limitaciones

- La recuperación se probó con DynamoDB Local.
- Se utilizaron cuatro documentos sintéticos.
- No se realizaron pruebas con carga de producción.
- El tiempo de recuperación depende del equipo donde se ejecuta.
- La tabla de auditoría no sustituye un servicio administrado de monitoreo.

## Conclusión

M06 permite que los eventos versión 1 y versión 2 convivan mediante un lector normalizado. También incorpora auditoría y un procedimiento controlado de respaldo, eliminación y restauración sin guardar información sensible.

La prueba recuperó los cuatro documentos y no dejó eventos faltantes.