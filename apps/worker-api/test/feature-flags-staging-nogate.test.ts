import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Fase K (enterprise gaps): Quality Gates de staging requieren Proceso §8.1 A+V.
 * Prohibido simular live flippeando FEATURE_* en wrangler local/repo.
 * Vive fuera de `src/` para no pelear con tsconfig tipado solo Cloudflare Workers.
 */
describe('Fase K — FEATURE_* residuales quedan en "0" (sin flip local)', () => {
  it('wrangler.jsonc no enciende flags de claims live / canary', () => {
    const wranglerPath = join(dirname(fileURLToPath(import.meta.url)), '../wrangler.jsonc');
    const wrangler = readFileSync(wranglerPath, 'utf8');
    const liveSensitive = [
      'FEATURE_FISCAL_CPE',
      'FEATURE_FISCAL_RC',
      'FEATURE_LPDP',
      'FEATURE_ANALYTICS_AGENTIC_INSIGHTS',
      'FEATURE_ORDERS_KDS',
      'FEATURE_OFFLINE_SYNC',
      'FEATURE_ACID_OFFLINE_SALE',
      'FEATURE_BILLING_USAGE_OVERAGE',
    ] as const;
    for (const key of liveSensitive) {
      expect(wrangler, `${key} must stay off until staging QG A+V`).not.toContain(`"${key}": "1"`);
      expect(wrangler).toContain(`"${key}": "0"`);
    }
  });
});
