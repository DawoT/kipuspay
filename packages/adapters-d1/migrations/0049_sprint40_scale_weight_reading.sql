-- S40-H1 (FASE 6D): la balanza registra su lectura cruda en el heartbeat y el
-- motor valida el peso DEVICE contra esa lectura — cierra el bypass donde un
-- cashier enviaba peso arbitrario con measurementSource='DEVICE'.
ALTER TABLE scale_devices ADD COLUMN last_weight_microunits INTEGER;
INSERT INTO schema_meta(key, value) VALUES ('inventory.scale.s40h1', '1');
