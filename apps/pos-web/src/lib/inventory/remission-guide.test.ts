import { afterEach, describe, expect, it, vi } from 'vitest';
import { issueRemissionGuide, type RemissionGuideInput } from './remission-guide';

const INPUT: RemissionGuideInput = {
  branchId: 'b1',
  series: 'T001',
  transferReasonCode: '13',
  transportModeCode: '02',
  vehiclePlate: 'ABC-123',
  carrierDocumentType: '01',
  carrierDocumentNumber: '12345678',
  carrierName: 'Carlos Ruiz',
  originUbigeo: '150101',
  originAddress: 'Av. Lima 100',
  destinationUbigeo: '070101',
  destinationAddress: 'Jr. Callao 200',
  transferStartedAt: '2026-08-12T15:00:00.000Z',
  items: [{ productId: 'p1', quantityMicrounits: 5_000_000, uomCode: 'NIU' }],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('remission guide cliente (P1b)', () => {
  it('valida campos requeridos', async () => {
    const res = await issueRemissionGuide({ ...INPUT, series: '' });
    expect(res.ok).toBe(false);
  });

  it('emite GRE y devuelve serie-número', async () => {
    let sent: Record<string, unknown> | null = null;
    const fetchMock = vi.fn((_url: unknown, init?: RequestInit) => {
      const rawBody = init?.body;
      sent = JSON.parse(typeof rawBody === 'string' ? rawBody : '{}') as Record<string, unknown>;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            remissionGuideId: 'g-1',
            series: 'T001',
            number: 8,
            transferReasonCode: '13',
            sunatStatus: 'PENDING',
          }),
          { status: 201 },
        ),
      );
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);
    const res = await issueRemissionGuide(INPUT);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.series).toBe('T001');
    expect(res.number).toBe(8);
    expect(sent).toMatchObject({ branchId: 'b1', series: 'T001', transferReasonCode: '13' });
  });

  it('guard del servidor → mensaje legible', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ code: 'INVALID_TRANSFER_REASON' }), { status: 422 }),
        ),
      ),
    );
    const res = await issueRemissionGuide(INPUT);
    expect(res.ok).toBe(false);
  });
});
