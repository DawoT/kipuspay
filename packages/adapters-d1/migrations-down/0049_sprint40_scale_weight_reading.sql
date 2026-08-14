ALTER TABLE scale_devices DROP COLUMN last_weight_microunits;
-- gitleaks:allow -- schema_meta key, no es secreto
DELETE FROM schema_meta WHERE key = 'inventory.scale.s40h1';
