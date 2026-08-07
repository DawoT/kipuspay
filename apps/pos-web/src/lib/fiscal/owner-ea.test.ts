import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  assertAnularEaUiReady,
  canOfferAnularEa,
  simulateEaClearCycles,
  submitAnularEa,
  type FiscalBacklogItem,
} from './owner-ea.js';

describe('owner E-A', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('solo ofrece Anular en estados no aceptados', () => {
    expect(canOfferAnularEa('DEADLINE_EXCEEDED')).toBe(true);
    expect(canOfferAnularEa('QUARANTINED')).toBe(true);
    expect(canOfferAnularEa('ACCEPTED')).toBe(false);
  });

  it('exige confirmación + motivo', () => {
    expect(() =>
      assertAnularEaUiReady({
        originSaleId: 's1',
        confirmed: false,
        motiveCode: '01',
        series: 'FC01',
      }),
    ).toThrow('EA_CONFIRMATION_REQUIRED');
    expect(() =>
      assertAnularEaUiReady({
        originSaleId: 's1',
        confirmed: true,
        motiveCode: '',
        series: 'FC01',
      }),
    ).toThrow('EA_MOTIVE_REQUIRED');
  });

  it('100 ciclos → 0 atrapados', () => {
    const items: FiscalBacklogItem[] = Array.from({ length: 100 }, (_, i) => ({
      saleId: `s${i}`,
      sunatStatus: i % 3 === 0 ? 'QUARANTINED' : i % 3 === 1 ? 'REJECTED' : 'DEADLINE_EXCEEDED',
      documentType: '01',
      totalCents: 100,
      suggestCreditNoteEa: true,
    }));
    const { remaining, cleared } = simulateEaClearCycles(items, () => true);
    expect(cleared).toBe(100);
    expect(remaining).toBe(0);
  });

  it('submitAnularEa POST', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ creditNoteSaleId: 'nc1' }),
        }),
      ),
    );
    const res = await submitAnularEa('https://api.example', 'Bearer t', {
      originSaleId: 's1',
      confirmed: true,
      motiveCode: '01',
      series: 'FC01',
    });
    expect(res.ok).toBe(true);
    expect(res.creditNoteSaleId).toBe('nc1');
  });
});
