-- Consultas parametrizadas ($1, $2...) usadas desde src/services/telemetriaService.js con pg.
-- Rango valido de un sensor
SELECT valor_min, valor_max FROM sensores WHERE id = $1;
-- Insertar lectura
INSERT INTO lecturas_telemetria (sensor_id, valor) VALUES ($1, $2) RETURNING id, sensor_id, valor;
-- Lecturas de un sensor
SELECT id, valor FROM lecturas_telemetria WHERE sensor_id = $1;
