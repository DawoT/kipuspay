import { describe, expect, it, vi } from 'vitest';
import {
  isLedgerStoreCreditEnabled,
  runAdjustStoreCreditHttp,
  runExpireStoreCreditHttp,
  runIssueStoreCreditHttp,
  runOwnerStoreCreditHttp,
} from './store-credit-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

vi.mock('@kipuspay/adapters-d1', () => ({
  appendAuditEvent: vi.fn(async () => undefined),
  readAuditChainHead: vi.fn(async () => null),
  auditChainClaimStatements: vi.fn(() => []),
  processStoreCreditIssueAtomic: vi.fn(() =>
    Promise.resolve({
      status: 'SUCCESS',
      txnId: 'tx1',
      accountId: 'acc1',
      nextBalanceCents: 11800,
      amountCents: 11800,
    }),
  ),
  processStoreCreditExpireAtomic: vi.fn(() =>
    Promise.resolve({ status: 'SUCCESS', txnId: 'tx2', nextBalanceCents: 0 }),
  ),
  processStoreCreditAdjustAtomic: vi.fn(() =>
    Promise.resolve({ status: 'SUCCESS', txnId: 'tx3', nextBalanceCents: 500 }),
  ),
}));

function env(over: Partial<WorkerEnv> = {}, approverRole: string | null = 'admin'): WorkerEnv {
  return {
    FEATURE_LEDGER_STORE_CREDIT: '1',
    DB: {
      prepare(sql: string) {
        const stmt = {
          bind() {
            return stmt;
          },
          first: () => {
            if (sql.includes('FROM users')) {
              return Promise.resolve(approverRole ? { role: approverRole } : null);
            }
            return Promise.resolve({ cents: 0 });
          },
          all: () => Promise.resolve({ results: [], success: true, meta: {} }),
        };
        return stmt;
      },
    },
    ...over,
  } as unknown as WorkerEnv;
}

describe('store-credit-routes', () => {
  it('default off', () => {
    expect(isLedgerStoreCreditEnabled({} as unknown as WorkerEnv)).toBe(false);
  });

  it('404 when flag off', async () => {
    const issued = runIssueStoreCreditHttp({
      FEATURE_LEDGER_STORE_CREDIT: '0',
    } as unknown as WorkerEnv);
    expect(issued.status).toBe(404);
    const res = await runExpireStoreCreditHttp(
      { FEATURE_LEDGER_STORE_CREDIT: '0' } as unknown as WorkerEnv,
      't1',
      'u1',
      'admin',
      {},
    );
    expect(res.status).toBe(404);
  });

  it('T-1: reporte Dueño con cashier → 403 FORBIDDEN_ROLE', async () => {
    const res = await runOwnerStoreCreditHttp(env(), 't1', 'cashier');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_ROLE');
  });

  it('issue via sale engine only; expire/adjust/owner 200', async () => {
    const issued = runIssueStoreCreditHttp(env());
    expect(issued.status).toBe(400);
    expect(issued.body.code).toBe('STORE_CREDIT_ISSUE_VIA_SALE');
    const expired = await runExpireStoreCreditHttp(env(), 't1', 'u1', 'admin', {
      customerId: 'c1',
      branchId: 'b1',
    });
    expect(expired.status).toBe(200);
    const forbidden = await runAdjustStoreCreditHttp(env(), 't1', 'u1', 'cashier', {
      customerId: 'c1',
      branchId: 'b1',
      amountCents: 100,
      adjustSign: 'CREDIT',
    });
    expect(forbidden.status).toBe(403);
    const adjusted = await runAdjustStoreCreditHttp(env(), 't1', 'u1', 'owner', {
      customerId: 'c1',
      branchId: 'b1',
      amountCents: 100,
      adjustSign: 'CREDIT',
    });
    expect(adjusted.status).toBe(200);

    // S35-H1: autorizador arbitrario (no admin/owner) → 403 FORBIDDEN_ROLE.
    const ghostAuth = await runAdjustStoreCreditHttp(env({}, 'cashier'), 't1', 'u1', 'owner', {
      customerId: 'c1',
      branchId: 'b1',
      amountCents: 100,
      adjustSign: 'CREDIT',
      authorizedByUserId: 'cajero-coludido',
    });
    expect(ghostAuth.status).toBe(403);
    expect(ghostAuth.body.code).toBe('FORBIDDEN_ROLE');

    // Autorizador admin/owner real → procede.
    const realAuth = await runAdjustStoreCreditHttp(env({}, 'admin'), 't1', 'u1', 'owner', {
      customerId: 'c1',
      branchId: 'b1',
      amountCents: 100,
      adjustSign: 'CREDIT',
      authorizedByUserId: 'supervisor-real',
    });
    expect(realAuth.status).toBe(200);
    const owner = await runOwnerStoreCreditHttp(env(), 't1', 'owner');
    expect(owner.status).toBe(200);
    expect(owner.body).toHaveProperty('issuedCents');
  });
});
