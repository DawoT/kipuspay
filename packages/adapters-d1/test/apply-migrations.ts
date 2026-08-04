import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

// Seguro llamar múltiples veces: solo aplica migraciones pendientes.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
