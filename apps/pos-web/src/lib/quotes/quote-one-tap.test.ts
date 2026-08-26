import { describe, expect, it, vi } from 'vitest';
import {
  buildOneTapConvertPayload,
  humanQuoteError,
  isOneTapAllowed,
  mapQuoteErrorToMessage,
  validateOneTapRequest,
} from './quote-one-tap.js';

describe('taller one-tap (cotización → factura 1 clic, TDD RED)', () => {
  it('isOneTapAllowed: solo si quotes activo y estado aprobable', () => {
    expect(isOneTapAllowed(true, 'APPROVED')).toBe(true);
    expect(isOneTapAllowed(true, 'SENT')).toBe(true);
    expect(isOneTapAllowed(false, 'APPROVED')).toBe(false);
    expect(isOneTapAllowed(true, 'CANCELLED')).toBe(false);
    expect(isOneTapAllowed(true, 'EXPIRED')).toBe(false);
  });

  it('validateOneTapRequest: exige quoteId y no excede fecha vencida', () => {
    const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const past = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    expect(validateOneTapRequest({ quoteId: 'q1', validUntilIso: future })).toEqual({ ok: true });
    const pastRes = validateOneTapRequest({ quoteId: 'q1', validUntilIso: past });
    expect(pastRes.ok).toBe(false);
    if (!pastRes.ok) expect(pastRes.code).toBe('QUOTE_EXPIRED');

    const empty = validateOneTapRequest({ quoteId: '' });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.code).toBe('QUOTE_ID_REQUIRED');
  });

  it('validateOneTapRequest: valida totalCents entero ≥0', () => {
    expect(validateOneTapRequest({ quoteId: 'q1', totalCents: 1500 }).ok).toBe(true);
    expect(validateOneTapRequest({ quoteId: 'q1', totalCents: 1.5 }).ok).toBe(false);
    expect(validateOneTapRequest({ quoteId: 'q1', totalCents: -1 }).ok).toBe(false);
  });

  it('buildOneTapConvertPayload: arma payload servidor con cents intactos y placa normalizada', () => {
    const payload = buildOneTapConvertPayload({
      quoteId: 'q123',
      branchId: 'b1',
      cashRegisterSessionId: 's1',
      series: 'F001',
      documentType: '01',
      plate: 'abc-123',
      customerName: 'Taller López',
      totalCents: 15000,
    });
    expect(payload.quoteId).toBe('q123');
    expect(payload.series).toBe('F001');
    expect(payload.plate).toBe('ABC123'); // normalizada
    expect(payload.totalCents).toBe(15000);
  });

  it('buildOneTapConvertPayload: placa vacía no envía plate', () => {
    const payload = buildOneTapConvertPayload({
      quoteId: 'q1',
      branchId: 'b1',
      cashRegisterSessionId: 's1',
      series: 'B001',
      documentType: '03',
    });
    expect(payload.plate).toBeUndefined();
  });

  it('humanQuoteError: mensaje sin jerga técnica', () => {
    expect(humanQuoteError('QUOTE_EXPIRED')).toBe('La cotización venció. Crea una nueva para cobrar.');
    expect(humanQuoteError('QUOTE_NOT_FOUND')).toBe('No encontramos esa cotización. Verifica el código.');
    expect(humanQuoteError('UNKNOWN_CODE')).not.toMatch(/Error 500|Exception|stack/i);
  });

  it('mapQuoteErrorToMessage: alias puro humanQuoteError', () => {
    expect(mapQuoteErrorToMessage('QUOTE_EXPIRED')).toBe(humanQuoteError('QUOTE_EXPIRED'));
  });

  it('one-tap feedback <100ms (premium UX, p95)', async () => {
    const samples: number[] = [];
    for (let i = 0; i < 30; i++) {
      const t0 = performance.now();
      validateOneTapRequest({ quoteId: `q-${i}`, totalCents: 1000 + i });
      // simulamos micro trabajo premium + feedback visual
      void buildOneTapConvertPayload({
        quoteId: `q-${i}`,
        branchId: 'b1',
        cashRegisterSessionId: 's1',
        series: 'F001',
        documentType: '01',
      });
      samples.push(performance.now() - t0);
    }
    const p95 = [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1] ?? Infinity;
    expect(p95).toBeLessThan(100);
  });

  it('capability gating: sin isSalesQuotesEnabled no permite one-tap', () => {
    // El gating real vive en la UI via isSalesQuotesEnabled(); aquí probamos helper puro.
    // Si feature off, la UI no renderiza botón — helper debe reflejar bloqueo.
    vi.resetModules();
    expect(isOneTapAllowed(false, 'APPROVED')).toBe(false);
  });
});
