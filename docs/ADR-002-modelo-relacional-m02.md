# ADR-002: Modelo relacional, migraciones y consultas (M02)

## Estado
Aceptado

## Modelo
- `dispositivos (id PK, nombre NOT NULL)`
- `sensores (id PK, dispositivo_id FK -> dispositivos, tipo, valor_min, valor_max)`
- `lecturas_telemetria (id PK, sensor_id FK -> sensores, valor, capturado_en)`

## Invariantes
- Llaves foraneas: no hay sensor sin dispositivo ni lectura sin sensor.
- `NOT NULL` en todos los campos de negocio.
- `CHECK valor_min <= valor_max`, nombre y tipo no vacios (migracion 002).
- La aplicacion rechaza lecturas fuera del rango del sensor (fallo declarado).

## Migraciones
`001_init.sql` y `002_invariantes.sql` son idempotentes (`IF NOT EXISTS`); `npm run migrate` se puede repetir sin error.

## Consultas
Todas las consultas usan parametros `$1, $2` de `pg` (sin concatenar texto). Ver `db/queries/consultas.sql`.

## Pruebas
caso normal, caso limite vacio, caso limite exceso y fallo declarado en `tests/` (`npm test`, requiere Postgres con `docker compose up -d postgres`).
