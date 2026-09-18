import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test as base, type Page, type TestInfo } from '@playwright/test';

const execFileAsync = promisify(execFile);
export const apiOrigin = `http://127.0.0.1:${process.env.KIPUSPAY_LOCAL_STACK_API_PORT ?? ''}`;
export const posOrigin = `http://127.0.0.1:${process.env.KIPUSPAY_LOCAL_STACK_POS_PORT ?? ''}`;
const stateDir = process.env.KIPUSPAY_LOCAL_STACK_STATE_DIR ?? '';
const fixturesDir = dirname(fileURLToPath(import.meta.url));
const workerDir = resolve(fixturesDir, '../../../worker-api');
const wrangler = resolve(workerDir, 'node_modules/.bin/wrangler');

export interface D1Result<T> {
  readonly results: readonly T[];
  readonly success: boolean;
}

export async function queryD1<T>(sql: string): Promise<readonly T[]> {
  if (!stateDir) throw new Error('KIPUSPAY_LOCAL_STACK_STATE_DIR missing');
  const { stdout } = await execFileAsync(
    wrangler,
    [
      '--cwd',
      workerDir,
      'd1',
      'execute',
      'DB',
      '--local',
      '--persist-to',
      stateDir,
      '--command',
      sql,
      '--json',
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  const start = stdout.indexOf('[');
  const end = stdout.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error(`Wrangler returned non-JSON output: ${stdout}`);
  const payload = JSON.parse(stdout.slice(start, end + 1)) as readonly D1Result<T>[];
  if (!payload[0]?.success) throw new Error('D1 query failed');
  return payload[0].results;
}

export function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export async function attachEvidence(
  testInfo: TestInfo,
  name: string,
  evidence: Record<string, unknown>,
): Promise<void> {
  await testInfo.attach(name, {
    body: Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, 'utf8'),
    contentType: 'application/json',
  });
}

export async function installKnownCashSession(
  page: Page,
  tenantId: string,
  branchId: string,
  sessionId: string,
): Promise<void> {
  await page.evaluate(
    ({ tenant, branch, session }) => {
      localStorage.setItem(
        'kipuspay.onboarding.claim',
        JSON.stringify({ tenantId: tenant, branchId: branch, sessionId: session }),
      );
    },
    { tenant: tenantId, branch: branchId, session: sessionId },
  );
}

export async function loginSeedTenant(
  page: Page,
  tenantKey: string,
  role: 'owner' | 'cashier' = 'owner',
): Promise<{ tenantId: string; branchId: string; sessionId: string; token: string }> {
  const tenantId = `seed_${tenantKey}`;
  const branchId = `${tenantId}_branch`;
  const sessionId = `${tenantId}_${role}_session`;
  await page.goto(`${posOrigin}/login?tenant=${tenantId}`);
  await page.getByTestId('login-identifier').fill(`${tenantId}_${role}`);
  await page.getByTestId('login-pin').fill(process.env.KIPUSPAY_LOCAL_STACK_PIN ?? '4826');
  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${apiOrigin}/api/auth/cashier-login` &&
      response.request().method() === 'POST',
  );
  await page.getByTestId('login-submit').click();
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status()).toBe(200);
  await page.waitForURL((url) => url.origin === posOrigin && url.pathname === '/');
  const token = await page.evaluate(() => localStorage.getItem('kipuspay_token') ?? '');
  expect(token).toBeTruthy();
  return { tenantId, branchId, sessionId, token };
}

export const test = base;
export { expect };
