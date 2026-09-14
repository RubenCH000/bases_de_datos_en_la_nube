-- M02: invariantes del modelo relacional. Idempotente: se puede correr varias veces.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_dispositivo_nombre') THEN
    ALTER TABLE dispositivos ADD CONSTRAINT chk_dispositivo_nombre CHECK (length(trim(nombre)) > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sensor_rango') THEN
    ALTER TABLE sensores ADD CONSTRAINT chk_sensor_rango CHECK (valor_min <= valor_max);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sensor_tipo') THEN
    ALTER TABLE sensores ADD CONSTRAINT chk_sensor_tipo CHECK (length(trim(tipo)) > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lecturas_sensor_fecha ON lecturas_telemetria (sensor_id, capturado_en);
