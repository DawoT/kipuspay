import { describe, expect, it } from 'vitest';
import {
  judgeOfflineSaleConcurrency,
  judgeOfflineSaleMidBatchAbort,
  type OfflineSaleAttemptEvidence,
  type OfflineSaleConcurrencyInput,
} from './offline-sale-concurrency.js';

const N = 8;

function cleanAttempts(): OfflineSaleAttemptEvidence[] {
  return Array.from({ length: N }, (_, i) => ({
    offlineSaleId: `off-gd-${i}`,
    outcome: 'SUCCESS' as const,
    explicitError: null,
    correlativeNumber: i + 1,
    totalAmountCents: 1180,
  }));
}

function cleanInput(): OfflineSaleConcurrencyInput {
  return {
    attempts: cleanAttempts(),
    post: {
      saleRows: N,
      saleItemRows: N,
      salePaymentRows: N,
      stockAfter: 2,
      seriesCurrentNumberAfter: 8,
      residualAtomicGuards: 0,
    },
    stockBefore: 10,
    seriesCurrentNumberBefore: 0,
    qtyPerSale: 1,
    itemsPerSale: 1,
    expectedTotalCentsPerSale: 1180,
  };
}

function withAttempt(
  input: OfflineSaleConcurrencyInput,
  index: number,
  patch: Partial<OfflineSaleAttemptEvidence>,
): OfflineSaleAttemptEvidence[] {
  return input.attempts.map((a, i) => (i === index ? { ...a, ...patch } : a));
}

describe('Game Day 001 E1 — juez concurrencia offline (contrato detectores)', () => {
  it('GREEN: ráfaga limpia 8/8 con correlativos 1..8 dictamina PASS', () => {
    const judgement = judgeOfflineSaleConcurrency(cleanInput());
    expect(judgement).toEqual({ verdict: 'PASS', successes: N, rejections: 0, failures: [] });
  });

  it('detecta intento silencioso (ni éxito ni error explícito)', () => {
    const input = cleanInput();
    const attempts = withAttempt(input, 3, { outcome: 'REJECTED', explicitError: null });
    const judgement = judgeOfflineSaleConcurrency({ ...input, attempts });
    expect(judgement.verdict).toBe('FAIL');
    expect(judgement.failures).toContain('silencio:off-gd-3');
  });

  it('detecta correlativo duplicado', () => {
    const input = cleanInput();
    const judgement = judgeOfflineSaleConcurrency({
      ...input,
      attempts: withAttempt(input, 7, { correlativeNumber: 1 }),
    });
    expect(judgement.verdict).toBe('FAIL');
    expect(judgement.failures).toContain('correlativos_duplicados');
  });

  it('detecta salto injustificado en la serie', () => {
    const input = cleanInput();
    const judgement = judgeOfflineSaleConcurrency({
      ...input,
      attempts: withAttempt(input, 7, { correlativeNumber: 9 }),
    });
    expect(judgement.verdict).toBe('FAIL');
    expect(judgement.failures).toContain('correlativos_con_saltos');
  });

  it('detecta total *_cents inexacto', () => {
    const input = cleanInput();
    const judgement = judgeOfflineSaleConcurrency({
      ...input,
      attempts: withAttempt(input, 2, { totalAmountCents: 1179 }),
    });
    expect(judgement.verdict).toBe('FAIL');
    expect(judgement.failures).toContain('total_inexacto:off-gd-2');
  });

  it('detecta escritura parcial: venta sin items ni pagos', () => {
    const input = cleanInput();
    const judgement = judgeOfflineSaleConcurrency({
      ...input,
      post: { ...input.post, saleItemRows: N - 1, salePaymentRows: N - 1 },
    });
    expect(judgement.verdict).toBe('FAIL');
    expect(judgement.failures).toEqual(
      expect.arrayContaining(['items_parciales', 'pagos_parciales']),
    );
  });

  it('detecta venta fantasma y desync de serie/stock', () => {
    const input = cleanInput();
    const judgement = judgeOfflineSaleConcurrency({
      ...input,
      post: { ...input.post, saleRows: N + 1 },
    });
    expect(judgement.verdict).toBe('FAIL');
    expect(judgement.failures).toContain('ventas_parciales_o_fantasma');

    const judgementSerie = judgeOfflineSaleConcurrency({
      ...cleanInput(),
      post: { ...cleanInput().post, seriesCurrentNumberAfter: 7 },
    });
    // Los correlativos 1..8 son consistentes entre sí; la desync es del contador.
    expect(judgementSerie.failures).toEqual(['serie_desincronizada']);

    const judgementStock = judgeOfflineSaleConcurrency({
      ...cleanInput(),
      post: { ...cleanInput().post, stockAfter: 3 },
    });
    expect(judgementStock.failures).toContain('stock_inconsistente');
  });

  it('rechazo explícito legítimo sigue siendo PASS si el resto cuadra', () => {
    const input = cleanInput();
    const attempts: OfflineSaleAttemptEvidence[] = input.attempts.map((a, i) => {
      if (i === 6) {
        return {
          ...a,
          outcome: 'REJECTED' as const,
          explicitError: 'INSUFFICIENT_STOCK',
          correlativeNumber: null,
          totalAmountCents: null,
        };
      }
      // 7 éxitos → correlativos válidos 1..7.
      return { ...a, correlativeNumber: i < 6 ? i + 1 : 7 };
    });
    const judgement = judgeOfflineSaleConcurrency({
      ...input,
      attempts,
      post: {
        saleRows: 7,
        saleItemRows: 7,
        salePaymentRows: 7,
        stockAfter: 3,
        seriesCurrentNumberAfter: 7,
        residualAtomicGuards: 0,
      },
    });
    expect(judgement).toEqual({ verdict: 'PASS', successes: 7, rejections: 1, failures: [] });
  });
});

describe('Game Day 001 E2 — juez aborto a mitad de batch (contrato detectores)', () => {
  const cleanE2 = () => ({
    threwExplicitError: 'CHAOS_MIDBATCH_ABORT',
    statementsInPlan: 9,
    abortAfterStatement: 4,
    postCounts: { sales: 0, saleItems: 0, salePayments: 0, auditEvents: 5, atomicGuards: 0 },
    baseline: { stockBefore: 10, seriesCurrentNumberBefore: 3, auditEventsBefore: 5 },
    stockAfter: 10,
    seriesCurrentNumberAfter: 3,
  });

  it('GREEN: aborto limpio revierte todo y dictamina PASS', () => {
    expect(judgeOfflineSaleMidBatchAbort(cleanE2())).toBe('PASS');
  });

  it('detecta filas residuales de la venta abortada', () => {
    const corrupted = { ...cleanE2(), postCounts: { ...cleanE2().postCounts, sales: 1 } };
    expect(judgeOfflineSaleMidBatchAbort(corrupted)).toBe('FAIL');

    const items = { ...cleanE2(), postCounts: { ...cleanE2().postCounts, saleItems: 2 } };
    expect(judgeOfflineSaleMidBatchAbort(items)).toBe('FAIL');

    const payments = { ...cleanE2(), postCounts: { ...cleanE2().postCounts, salePayments: 1 } };
    expect(judgeOfflineSaleMidBatchAbort(payments)).toBe('FAIL');
  });

  it('detecta correlativo consumido, stock mutado y auditoría tocada', () => {
    const serie = { ...cleanE2(), seriesCurrentNumberAfter: 4 };
    expect(judgeOfflineSaleMidBatchAbort(serie)).toBe('FAIL');

    const stock = { ...cleanE2(), stockAfter: 9 };
    expect(judgeOfflineSaleMidBatchAbort(stock)).toBe('FAIL');

    const audit = {
      ...cleanE2(),
      postCounts: { ...cleanE2().postCounts, auditEvents: 6 },
    };
    expect(judgeOfflineSaleMidBatchAbort(audit)).toBe('FAIL');
  });

  it('falla sin error explícito o si la inyección no fue a mitad del plan', () => {
    const silent = { ...cleanE2(), threwExplicitError: null };
    expect(judgeOfflineSaleMidBatchAbort(silent)).toBe('FAIL');

    const tooEarly = { ...cleanE2(), abortAfterStatement: 0 };
    expect(judgeOfflineSaleMidBatchAbort(tooEarly)).toBe('FAIL');

    const tooLate = { ...cleanE2(), abortAfterStatement: 9 };
    expect(judgeOfflineSaleMidBatchAbort(tooLate)).toBe('FAIL');
  });
});
