import { afterEach, describe, expect, it, vi } from 'vitest';
import { issueDebitNote } from './debit-note';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('debit note cliente (P1a)', () => {
  it('valida campos requeridos y monto', async () => {
    expect(
      await issueDebitNote({
        originSaleId: '',
        series: 'FC01',
        motiveCode: '02',
        amountCents: 100,
      }),
    ).toEqual({
      ok: false,
      message: expect.stringContaining('requeridos'),
    });
    expect(
      await issueDebitNote({
        originSaleId: 's1',
        series: 'FC01',
        motiveCode: '02',
        amountCents: 0,
      }),
    ).toEqual({
      ok: false,
      message: expect.stringContaining('entero positivo'),
    });
  });

  it('emite ND y devuelve serie-número', async () => {
    let sent: Record<string, unknown> | null = null;
    const fetchMock = vi.fn((_url: unknown, init?: RequestInit) => {
      const rawBody = init?.body;
      sent = JSON.parse(typeof rawBody === 'string' ? rawBody : '{}') as Record<string, unknown>;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            debitNoteId: 'dn-1',
            series: 'FC01',
            number: 42,
            amountCents: 5900,
            motiveCode: '02',
            mustSubmitByIso: '2026-08-16T00:00:00.000Z',
          }),
          { status: 201 },
        ),
      );
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);
    const res = await issueDebitNote({
      originSaleId: 's1',
      series: 'FC01',
      motiveCode: '02',
      amountCents: 5900,
      description: 'Aumento de valor',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.series).toBe('FC01');
    expect(res.number).toBe(42);
    expect(sent).toMatchObject({
      originSaleId: 's1',
      series: 'FC01',
      motiveCode: '02',
      amountCents: 5900,
    });
  });

  it('guard del servidor → mensaje legible', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ code: 'FISCAL_CDR_REQUIRED' }), { status: 422 }),
        ),
      ),
    );
    const res = await issueDebitNote({
      originSaleId: 's1',
      series: 'FC01',
      motiveCode: '02',
      amountCents: 100,
    });
    expect(res.ok).toBe(false);
  });

  it('sin red no lanza', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network'))),
    );
    const res = await issueDebitNote({
      originSaleId: 's1',
      series: 'FC01',
      motiveCode: '02',
      amountCents: 100,
    });
    expect(res.ok).toBe(false);
  });
});
