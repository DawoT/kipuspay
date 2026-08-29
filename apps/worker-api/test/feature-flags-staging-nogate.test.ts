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
      'FEATURE_SALES_DEBIT_NOTE',
      'FEATURE_GRE',
      'FEATURE_FISCAL_WITHHOLDINGS',
      'FEATURE_FISCAL_TRANSPORT_PLUGINS',
    ] as const;
    for (const key of liveSensitive) {
      expect(wrangler, `${key} must stay off until staging QG A+V`).not.toContain(`"${key}": "1"`);
      expect(wrangler).toContain(`"${key}": "0"`);
    }
  });

  it('FIXED: env.staging conserva DATA_BACKUP/PLATFORM_DR/REPORTING_ROLLUPS en "1" (anti-pisada S42/S48)', () => {
    const wranglerPath = join(dirname(fileURLToPath(import.meta.url)), '../wrangler.jsonc');
    const raw = readFileSync(wranglerPath, 'utf8');
    const stagingSection = raw.split('"env"')[1] ?? '';
    expect(stagingSection, 'FEATURE_DATA_BACKUP staging FIXED debe ser "1"').toContain(
      '"FEATURE_DATA_BACKUP": "1"',
    );
    expect(stagingSection).toContain('"FEATURE_PLATFORM_DR": "1"');
    expect(stagingSection).toContain('"FEATURE_REPORTING_ROLLUPS": "1"');
    const topSection = raw.split('"env"')[0];
    expect(topSection).toContain('"FEATURE_DATA_BACKUP": "0"');
    expect(topSection).toContain('"FEATURE_PLATFORM_DR": "0"');
    expect(topSection).toContain('"FEATURE_REPORTING_ROLLUPS": "0"');
  });

  it('FIXED: PUSH_VAPID_PUBLIC_KEY staging es VAPID v4 real non-empty B* (Flujo B §5.12.3)', () => {
    const wranglerPath = join(dirname(fileURLToPath(import.meta.url)), '../wrangler.jsonc');
    const wrangler = readFileSync(wranglerPath, 'utf8');
    // staging debe contener VAPID v4 real 87c B* — top-level debe ser "" (fail-closed)
    const stagingMatch = wrangler.match(
      /"env"\s*:\s*\{[^}]*"staging"[\s\S]*?"PUSH_VAPID_PUBLIC_KEY"\s*:\s*"([^"]+)"/,
    );
    expect(stagingMatch, 'PUSH_VAPID_PUBLIC_KEY staging FIXED v4 debe existir').not.toBeNull();
    const staging = stagingMatch![1];
    expect(staging).toMatch(/^B[A-Za-z0-9_-]{86}$/);
    expect(staging.length).toBe(87);
    const topMatch = wrangler.match(
      /"vars"\s*:\s*\{[\s\S]*?"PUSH_VAPID_PUBLIC_KEY"\s*:\s*"([^"]*)"/,
    );
    // top-level es el primer vars antes de env
    const topSection = wrangler.split('"env"')[0];
    expect(topSection).toContain('"PUSH_VAPID_PUBLIC_KEY": ""');
  });

  it('cohérence: FEATURE_OWNER_PUSH y FEATURE_MOBILE_PUSH staging coherentes (ambos 1, top 0)', () => {
    const wranglerPath = join(dirname(fileURLToPath(import.meta.url)), '../wrangler.jsonc');
    const wrangler = readFileSync(wranglerPath, 'utf8');
    expect(wrangler).toContain('"FEATURE_OWNER_PUSH": "1"');
    expect(wrangler).toContain('"FEATURE_MOBILE_PUSH": "1"');
    const topSection = wrangler.split('"env"')[0];
    // top-level debe ser 0 para ambos
    expect(topSection.match(/"FEATURE_OWNER_PUSH": "0"/)).not.toBeNull();
    expect(topSection.match(/"FEATURE_MOBILE_PUSH": "0"/)).not.toBeNull();
  });

  it('worker-fiscal wrangler git no enciende flags de drain/CPE/PSE', () => {
    const wranglerPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../worker-fiscal/wrangler.jsonc',
    );
    const wrangler = readFileSync(wranglerPath, 'utf8');
    for (const key of [
      'FEATURE_FISCAL_CPE',
      'FEATURE_FISCAL_RC',
      'FEATURE_FISCAL_CIRCUIT_BREAKER',
      'FEATURE_FISCAL_TRANSPORT_PLUGINS',
    ] as const) {
      expect(wrangler, `${key} must stay 0 in git`).not.toContain(`"${key}": "1"`);
      expect(wrangler).toContain(`"${key}": "0"`);
    }
    expect(wrangler).toContain('pse.kipuspay.staging.invalid');
  });

  it('staging usa pages.dev/workers.dev como canónico temporal (D0, sin dominio comprado)', () => {
    const wranglerPath = join(dirname(fileURLToPath(import.meta.url)), '../wrangler.jsonc');
    const wrangler = readFileSync(wranglerPath, 'utf8');
    expect(wrangler).toContain('kipuspay-app.pages.dev');
    expect(wrangler).toContain('POS_APP_ORIGIN');
    expect(wrangler).not.toMatch(/"POS_APP_ORIGIN": "https:\/\/app\.kipuspay\.com"/);
  });
});
