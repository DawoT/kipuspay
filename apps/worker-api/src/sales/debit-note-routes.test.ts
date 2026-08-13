import { describe, expect, it, vi } from 'vitest';
import { runDebitNoteHttp, type DebitNoteEnv } from './debit-note-routes.js';

const processDebitNoteAtomic = vi.fn();

vi.mock('@kipuspay/adapters-d1', () => ({
  processDebitNoteAtomic: (...args: unknown[]) => processDebitNoteAtomic(...args),
}));

function envWith(overrides: Partial<DebitNoteEnv> = {}): DebitNoteEnv {
  return { FEATURE_SALES_DEBIT_NOTE: '1', DB: {}, ...overrides };
}

const actor = { tenantId: 't1', userId: 'u1', role: 'cashier' };

describe('debit note routes (P1a, ADR-FISCAL-003)', () => {
  it('flag off → 404 FEATURE_OFF', async () => {
    const env = envWith({ FEATURE_SALES_DEBIT_NOTE: '0' });
    const res = await runDebitNoteHttp(env, actor, {
      originSaleId: 's1',
      series: 'FC01',
      motiveCode: '02',
      amountCents: 5900,
    });
    expect(res.status).toBe(404);
  });

  it('valida campos requeridos', async () => {
    const res = await runDebitNoteHttp(envWith(), actor, { originSaleId: 's1' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });

  it('emite ND y devuelve el documento 201', async () => {
    processDebitNoteAtomic.mockResolvedValueOnce({
      debitNoteId: 'dn-1',
      documentType: '08' as const,
      series: 'FC01',
      number: 42,
      amountCents: 5900,
      motiveCode: '02',
      mustSubmitByIso: '2026-08-16T00:00:00.000Z',
      requiresNoCdrAudit: false,
    });
    const res = await runDebitNoteHttp(envWith(), actor, {
      originSaleId: 's1',
      series: 'FC01',
      motiveCode: '02',
      amountCents: 5900,
      description: 'Aumento de valor',
    });
    expect(res.status).toBe(201);
    expect(res.body.number).toBe(42);
    expect(res.body.documentType).toBe('08');
    expect(processDebitNoteAtomic).toHaveBeenCalledWith(
      expect.anything(),
      't1',
      'u1',
      's1',
      { motiveCode: '02', amountCents: 5900, description: 'Aumento de valor' },
      'FC01',
      { ledgerArApEnabled: true },
    );
  });

  it('errores del motor → 422 con el código del guard', async () => {
    processDebitNoteAtomic.mockRejectedValueOnce(new Error('FISCAL_CDR_REQUIRED'));
    const res = await runDebitNoteHttp(envWith(), actor, {
      originSaleId: 's1',
      series: 'FC01',
      motiveCode: '02',
      amountCents: 100,
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('FISCAL_CDR_REQUIRED');
  });
});
