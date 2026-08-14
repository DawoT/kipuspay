import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Fase K (enterprise gaps): Quality Gates de staging (GTM-07/08/09/18,
 * Insights/KDS/offline, SLA 1h) requieren Proceso §8.1 A+V en staging.
 * Prohibido simular live flippeando FEATURE_* en wrangler local/repo.
 */
describe('Fase K — FEATURE_* residuales quedan en "0" (sin flip local)', () => {
  it('wrangler.jsonc no enciende flags de claims live / canary', () => {
    const wrangler = readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8');
    const liveSensitive = [
      'FEATURE_FISCAL_CPE',
      'FEATURE_FISCAL_RC',
      'FEATURE_LPDP',
      'FEATURE_ANALYTICS_AGENTIC_INSIGHTS',
      'FEATURE_ORDERS_KDS',
      'FEATURE_OFFLINE_SYNC',
      'FEATURE_ACID_OFFLINE_SALE',
      'FEATURE_BILLING_USAGE_OVERAGE',
    ];
    for (const key of liveSensitive) {
      const re = new RegExp(`"${key}"\\s*:\\s*"1"`);
      expect(wrangler, `${key} must stay off until staging QG A+V`).not.toMatch(re);
      expect(wrangler).toMatch(new RegExp(`"${key}"\\s*:\\s*"0"`));
    }
  });
});
