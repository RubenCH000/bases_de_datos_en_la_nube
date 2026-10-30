# Reporte M08 Paginación, índices y rendimiento

## Integrantes

- Ruben Carrera Hilario
- Maria de los Angeles Vazquez Esperon
- Josue David Vazquez Trujillo

## Objetivo

Paginar de forma estable las consultas de eventos por dispositivo, justificar el índice con una medición contra una línea base y documentar el trade-off.

## Qué se hizo

### Paginación y fixtures (Ruben)

- `src/db/paginacionEventos.js` consulta `gsi_device_timestamp` con `Query`, regresa páginas de 25 eventos (máximo 100) y un cursor que guarda el rango de la primera página.
- `src/db/cdrlFixturesM08.js` y `scripts/cargar_fixtures_m08.js` cargan 360 eventos sintéticos (3 dispositivos × 120).

### Benchmark (David)

- `scripts/benchmark_m08.js` compara `Scan` + filtro (sin índice) contra `Query` en el índice con paginación, con calentamiento, 30 iteraciones, p50, p95 y el entorno, y genera `artifacts/m08-benchmark.json`.
- `make setup` carga los fixtures y `make verify` / `make artifact` corren el benchmark.

### Pruebas, ADR y evidencia (Maria)

- `tests/m08_paginacion.test.js` con caso normal, dos casos límite y un fallo declarado (cursor inválido).
- `docs/ADR-006-paginacion-rendimiento-m08.md` con la decisión, el trade-off y los límites.
- `scripts/generar_evidencia_m08_pruebas.js` genera `evidence/m08-pruebas.json` y `make verify` lo corre después del benchmark.

## Cómo se ejecuta

```bash
make setup
make verify
make run
```

Comandos sueltos:

```bash
npm run m08:fixtures
node scripts/benchmark_m08.js
node --test tests/m08_paginacion.test.js
node scripts/generar_evidencia_m08_pruebas.js
```

## Resultados

Entorno: DynamoDB Local en Docker, Node v24.19.0, Windows. Muestra: 30 iteraciones después de 2 de calentamiento, dispositivo `NODE-CDRL-M08A`, página de 25 eventos.

| Consulta | p50 | p95 | Documentos evaluados por consulta |
|---|---|---|---|
| Línea base: `Scan` + `FilterExpression` | 33.294 ms | 38.527 ms | 395 |
| `Query` en `gsi_device_timestamp` + cursor | 7.347 ms | 8.468 ms | 25 |

El índice bajó el p50 un 77.93 % (4.53 veces más rápido), el p95 un 78.02 % y los documentos leídos un 93.67 %. La línea base lee toda la tabla aunque solo regrese 25 eventos, así que su costo seguiría creciendo con la tabla; el `Query` lee solo la página.

| Criterio | Dónde se comprueba | Resultado |
|---|---|---|
| Paginación estable | prueba 1 y 2, recorrido en el benchmark | 120 de 120 eventos, sin duplicados; un evento nuevo no entra al recorrido empezado |
| Casos límite | prueba 3 | Límites 1, 60 y 100, dispositivo vacío y límites fuera de rango |
| Fallo declarado | prueba 4 | 7 cursores inválidos rechazados con `CursorInvalidoError` sin consultar DynamoDB |
| Índice justificado con medición | `artifacts/m08-benchmark.json` | p50, p95, muestra y entorno de Scan contra Query |
| Trade-off documentado | ADR 006 | Costo de escritura y almacenamiento del GSI contra lecturas acotadas |

Los tiempos son de un entorno local y cambian un poco en cada ejecución; lo que se compara es la diferencia entre las dos consultas en el mismo entorno. El detalle de la última ejecución está en `evidence/m08-pruebas.json` y la salida completa en `evidence/m08-make-verify.txt`.

## Seguridad

Se usan solo fixtures sintéticos. La configuración sale de variables de entorno y no se guardan credenciales, tokens, datos personales ni cadenas de conexión. El cursor solo contiene el dispositivo, el rango y la clave del último evento.
