ALTER TABLE scale_devices DROP COLUMN last_weight_microunits;
DELETE FROM schema_meta WHERE key = 'inventory.scale.s40h1';
