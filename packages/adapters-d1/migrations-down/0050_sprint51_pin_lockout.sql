ALTER TABLE users DROP COLUMN pin_attempts;
ALTER TABLE users DROP COLUMN pin_locked_until;
-- gitleaks:allow -- schema_meta key, no es secreto
DELETE FROM schema_meta WHERE key = 'ops.shift_handoff.s51h1';
