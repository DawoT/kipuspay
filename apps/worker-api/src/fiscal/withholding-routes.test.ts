import { describe, expect, it, vi } from 'vitest';
import { runPerceptionHttp, runRetentionHttp, type WithholdingEnv } from './withholding-routes.js';

const processPerceptionAtomic = vi.fn();
const processRetentionAtomic = vi.fn();

vi.mock('@kipuspay/adapters-d1', () => ({
  processPerceptionAtomic: (a: unknown, b: unknown, c: unknown, d: unknown, e: unknown, f: unknown, g: unknown) =>
    processPerceptionAtomic(a, b, c, d, e, f, g),
  processRetentionAtomic: (a: unknown, b: unknown, c: unknown, d: unknown, e: unknown, f: unknown, g: unknown) =>
    processRetentionAtomic(a, b, c, d, e, f, g),
}));

function envWith(overrides: Partial<WithholdingEnv> = {}): WithholdingEnv {
  return { FEATURE_FISCAL_WITHHOLDINGS: '1', DB: {}, ...overrides };
}

const actor = { tenantId: 't1', userId: 'u1', role: 'owner' };

describe('withholding routes (P1c)', () => {
  it('flag off → 404 FEATURE_OFF en percepción y retención', async () => {
    const env = envWith({ FEATURE_FISCAL_WITHHOLDINGS: '0' });
    expect((await runPerceptionHttp(env, actor, { originSaleId: 's1' })).status).toBe(404);
    expect((await runRetentionHttp(env, actor, { originSupplierInvoiceId: 'si1' })).status).toBe(
      404,
    );
  });

  it('valida campos requeridos', async () => {
    const res = await runPerceptionHttp(envWith(), actor, {});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });

  it('percepción: emite 201 con monto calculado', async () => {
    processPerceptionAtomic.mockResolvedValueOnce({
      perceptionId: 'p-1',
      series: 'P001',
      number: 12,
      baseAmountCents: 10_000,
      amountCents: 200,
      ratePercentage: 200,
      sunatStatus: 'PENDING' as const,
    });
    const res = await runPerceptionHttp(envWith(), actor, {
      branchId: 'b1',
      originSaleId: 's1',
      series: 'P001',
      category: 'goods',
      baseAmountCents: 10_000,
    });
    expect(res.status).toBe(201);
    expect(res.body.amountCents).toBe(200);
  });

  it('retención: guard del dominio → 422', async () => {
    processRetentionAtomic.mockRejectedValueOnce(new Error('INVALID_RETENTION_CATEGORY'));
    const res = await runRetentionHttp(envWith(), actor, {
      branchId: 'b1',
      originSupplierInvoiceId: 'si1',
      series: 'R001',
      category: 'goods2',
      baseAmountCents: 10_000,
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_RETENTION_CATEGORY');
  });

  it('retención: emite 201', async () => {
    processRetentionAtomic.mockResolvedValueOnce({
      retentionId: 'r-1',
      series: 'R001',
      number: 12,
      baseAmountCents: 10_000,
      amountCents: 600,
      ratePercentage: 600,
      sunatStatus: 'PENDING' as const,
    });
    const res = await runRetentionHttp(envWith(), actor, {
      branchId: 'b1',
      originSupplierInvoiceId: 'si1',
      series: 'R001',
      category: 'services',
      baseAmountCents: 10_000,
    });
    expect(res.status).toBe(201);
    expect(res.body.amountCents).toBe(600);
  });
});
