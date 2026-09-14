-- Contrato de datos de telemetria: dispositivos, sensores y sus lecturas.
-- Con esto basta para lo que pide el hito, nada mas.
 
CREATE TABLE IF NOT EXISTS dispositivos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL
);
 
CREATE TABLE IF NOT EXISTS sensores (
  id SERIAL PRIMARY KEY,
  dispositivo_id INTEGER NOT NULL REFERENCES dispositivos(id),
  tipo VARCHAR(60) NOT NULL,     -- ej: temperatura, humedad
  valor_min NUMERIC NOT NULL,    -- rango que se considera valido
  valor_max NUMERIC NOT NULL
);
 
CREATE TABLE IF NOT EXISTS lecturas_telemetria (
  id SERIAL PRIMARY KEY,
  sensor_id INTEGER NOT NULL REFERENCES sensores(id),
  valor NUMERIC NOT NULL,
  capturado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);