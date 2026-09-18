import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const script = resolve('scripts/deploy-worker-api-staging.sh');

function runProfile(profile = '') {
  const dir = mkdtempSync(join(tmpdir(), 'kipuspay-staging-deploy-'));
  const argsFile = join(dir, 'wrangler-args.txt');
  const fakeWrangler = join(dir, 'wrangler');
  writeFileSync(fakeWrangler, `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > "${argsFile}"\n`);
  chmodSync(fakeWrangler, 0o755);
  try {
    const result = spawnSync('bash', [script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        STAGING_DEPLOY_PROFILE: profile,
      },
    });
    return {
      ...result,
      args: result.status === 0 ? readFileSync(argsFile, 'utf8') : '',
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('deploy-worker-api-staging', () => {
  it('rejects a deploy without an explicit staging profile', () => {
    const result = runProfile();
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/STAGING_DEPLOY_PROFILE/);
  });

  it('enables only the Sprint 48 flags and keeps LPDP disabled', () => {
    const result = runProfile('s48-dr');
    expect(result.status, result.stderr).toBe(0);
    expect(result.args).toContain('FEATURE_DATA_BACKUP:1');
    expect(result.args).toContain('FEATURE_PLATFORM_DR:1');
    expect(result.args).toContain('FEATURE_ANALYTICS_AGENTIC_INSIGHTS:0');
    expect(result.args).toContain('FEATURE_LPDP:0');
    expect(result.args).not.toContain('FEATURE_LPDP:1');
  });

  it('has an exact allowlist for every deployable profile and no LPDP profile', () => {
    const expected = {
      baseline: [],
      's43-orders': ['FEATURE_ORDERS_CUSTOMER_ORDERS'],
      's44-recurring': ['FEATURE_SALES_RECURRING', 'RECURRING_MANUAL_RUN_ENABLED'],
      's45-push': ['FEATURE_MOBILE_PUSH', 'FEATURE_CLIENT_MOBILE_POS'],
      's46-forecast': ['FEATURE_ANALYTICS_FORECASTING'],
      's48-dr': ['FEATURE_DATA_BACKUP', 'FEATURE_PLATFORM_DR'],
      's49-insights': ['FEATURE_ANALYTICS_AGENTIC_INSIGHTS'],
    };
    const flags = [
      'FEATURE_ORDERS_CUSTOMER_ORDERS',
      'FEATURE_SALES_RECURRING',
      'RECURRING_MANUAL_RUN_ENABLED',
      'FEATURE_MOBILE_PUSH',
      'FEATURE_CLIENT_MOBILE_POS',
      'FEATURE_ANALYTICS_FORECASTING',
      'FEATURE_DATA_BACKUP',
      'FEATURE_PLATFORM_DR',
      'FEATURE_ANALYTICS_AGENTIC_INSIGHTS',
      'FEATURE_LPDP',
    ];

    for (const [profile, enabled] of Object.entries(expected)) {
      const result = runProfile(profile);
      expect(result.status, `${profile}: ${result.stderr}`).toBe(0);
      for (const flag of flags) {
        expect(result.args).toContain(`${flag}:${enabled.includes(flag) ? '1' : '0'}`);
      }
    }

    for (const blocked of ['s47-lpdp', 'LPDP']) {
      const result = runProfile(blocked);
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/desconocido|no autorizado/i);
    }
  });
});
