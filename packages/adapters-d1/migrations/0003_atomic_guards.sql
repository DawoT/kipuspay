-- SYN-12 / Arquitectura §6: guards SQL para abortar db.batch([...]) atómico
CREATE TABLE atomic_guards (
    id TEXT PRIMARY KEY,
    ok INTEGER NOT NULL CHECK (ok = 1),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
