import { describe, expect, it, vi } from 'vitest';
import { runRemissionGuideHttp, type GreEnv } from './remission-guide-routes.js';

const processRemissionGuideAtomic = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('@kipuspay/adapters-d1', () => ({
  appendAuditEvent: vi.fn(async () => undefined),
  readAuditChainHead: vi.fn(async () => null),
  auditChainClaimStatements: vi.fn(() => []),
  processRemissionGuideAtomic: (...args: unknown[]) => processRemissionGuideAtomic(...args),
}));

function envWith(overrides: Partial<GreEnv> = {}): GreEnv {
  return { FEATURE_GRE: '1', DB: {}, ...overrides };
}

const actor = { tenantId: 't1', userId: 'u1', role: 'owner' };

const REQUEST = {
  series: 'T001',
  transferReasonCode: '01',
  transportModeCode: '01',
  vehiclePlate: 'ABC-123',
  carrier: { documentType: '01', documentNumber: '12345678', name: 'Carlos Ruiz' },
  origin: { ubigeo: '150101', address: 'Av. Lima 100' },
  destination: { ubigeo: '070101', address: 'Jr. Callao 200' },
  transferStartedAt: '2026-08-12T15:00:00.000Z',
  items: [{ productId: 'p1', quantityMicrounits: 5_000_000, uomCode: 'NIU' }],
};

describe('remission guide routes (P1b)', () => {
  it('flag off → 404 FEATURE_OFF', async () => {
    const res = await runRemissionGuideHttp(envWith({ FEATURE_GRE: '0' }), actor, REQUEST);
    expect(res.status).toBe(404);
  });

  it('valida campos incompletos', async () => {
    const res = await runRemissionGuideHttp(envWith(), actor, { series: 'T001' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });

  it('emite GRE y devuelve serie-número 201', async () => {
    processRemissionGuideAtomic.mockResolvedValueOnce({
      remissionGuideId: 'g-1',
      series: 'T001',
      number: 8,
      transferReasonCode: '01',
      sunatStatus: 'PENDING' as const,
    });
    const res = await runRemissionGuideHttp(envWith(), actor, { branchId: 'b1', ...REQUEST });
    expect(res.status).toBe(201);
    expect(res.body.number).toBe(8);
    expect(res.body.sunatStatus).toBe('PENDING');
  });

  it('guard del dominio → 422 con código', async () => {
    processRemissionGuideAtomic.mockRejectedValueOnce(new Error('INVALID_TRANSFER_REASON'));
    const res = await runRemissionGuideHttp(envWith(), actor, { branchId: 'b1', ...REQUEST });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_TRANSFER_REASON');
  });
});
