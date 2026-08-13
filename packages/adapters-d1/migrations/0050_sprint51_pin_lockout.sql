-- S51-H1 (FASE 6G): lockout del PIN de caja — 5 fallos → bloqueo 15 min
-- (el resolve de PIN de 4 dígitos es enumerable sin rate-limit).
ALTER TABLE users ADD COLUMN pin_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN pin_locked_until DATETIME;
INSERT INTO schema_meta(key, value) VALUES ('ops.shift_handoff.s51h1', '1');
