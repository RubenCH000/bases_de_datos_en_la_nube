-- Invariantes para M02.
-- Ya no confiamos solo en el codigo: la base tambien rechaza datos invalidos.
-- Escrito para poder correrse mas de una vez sin tronar (idempotente).
 
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_sensores_rango'
  ) THEN
    ALTER TABLE sensores ADD CONSTRAINT chk_sensores_rango CHECK (valor_min < valor_max);
  END IF;
END $$;
 
CREATE OR REPLACE FUNCTION validar_rango_lectura() RETURNS TRIGGER AS $$
DECLARE
  minimo NUMERIC;
  maximo NUMERIC;
BEGIN
  SELECT valor_min, valor_max INTO minimo, maximo
  FROM sensores WHERE id = NEW.sensor_id;
 
  IF NEW.valor < minimo OR NEW.valor > maximo THEN
    RAISE EXCEPTION 'valor fuera de rango para el sensor %', NEW.sensor_id;
  END IF;
 
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
 
DROP TRIGGER IF EXISTS trg_validar_rango ON lecturas_telemetria;
 
CREATE TRIGGER trg_validar_rango
  BEFORE INSERT ON lecturas_telemetria
  FOR EACH ROW
  EXECUTE FUNCTION validar_rango_lectura();