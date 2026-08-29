import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

// Aplica migraciones D1 reales (workerd) para el volumen push SLO.
// Seguro llamar múltiples veces: solo aplica pendientes.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
