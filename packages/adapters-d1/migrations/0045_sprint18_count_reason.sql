-- 0045 (S18-H3): motivo obligatorio en ajustes de conteo aprobados.
ALTER TABLE inventory_counts ADD COLUMN adjustment_reason TEXT;
