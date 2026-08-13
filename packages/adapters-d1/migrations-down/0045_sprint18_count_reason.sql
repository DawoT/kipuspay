-- Down 0045 (S18-H3): revierte la columna de motivo del conteo.
ALTER TABLE inventory_counts DROP COLUMN adjustment_reason;
DELETE FROM schema_meta WHERE key = 'inventory.counts.adjustment_reason';
