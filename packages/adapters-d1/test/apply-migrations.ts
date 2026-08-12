import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

// Seguro llamar múltiples veces: solo aplica migraciones pendientes.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
// Sprint 48 (platform.dr): el shard DR del simulacro tiene el mismo schema.
await applyD1Migrations(env.DR_DB, env.TEST_MIGRATIONS);
