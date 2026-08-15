/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- node:fs/url types unresolved under worker-api eslint project service */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Fase K (enterprise gaps): Quality Gates de staging (GTM-07/08/09/18,
 * Insights/KDS/offline, SLA 1h) requieren Proceso §8.1 A+V en staging.
 * Prohibido simular live flippeando FEATURE_* en wrangler local/repo.
 */
describe('Fase K — FEATURE_* residuales quedan en "0" (sin flip local)', () => {
  it('wrangler.jsonc no enciende flags de claims live / canary', () => {
    const wranglerPath = fileURLToPath(new URL('../../wrangler.jsonc', import.meta.url));
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
