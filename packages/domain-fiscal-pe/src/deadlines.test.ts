import { describe, expect, it } from 'vitest';
import {
  ALERT_T24_MS,
  ALERT_T6_MS,
  boletaMustSubmitByEndOfLimaDay,
  evaluateDeadline,
  evaluateDeadlineBatch,
  facturaMustSubmitBy,
  summaryDateLima,
} from './deadlines.js';

describe('deadlines fiscales', () => {
  const base = {
    id: 'sale-1',
    documentType: '01',
    sunatStatus: 'PENDING',
    alertT24Sent: false,
    alertT6Sent: false,
  };

  it('emite T24H cuando remaining ≤ 24h', () => {
    const must = 1_000_000 + ALERT_T24_MS;
    const action = evaluateDeadline({ ...base, mustSubmitByMs: must }, 1_000_000 + 1);
    expect(action).toEqual({ id: 'sale-1', alert: 'T24H', suggestCreditNoteEa: false });
  });

  it('emite T6H cuando remaining ≤ 6h', () => {
    const must = 1_000_000 + ALERT_T6_MS;
    const action = evaluateDeadline(
      { ...base, mustSubmitByMs: must, alertT24Sent: true },
      1_000_000 + 1,
    );
    expect(action).toEqual({ id: 'sale-1', alert: 'T6H', suggestCreditNoteEa: false });
  });

  it('DEADLINE_EXCEEDED sugiere NC E-A', () => {
    const action = evaluateDeadline(
      { ...base, mustSubmitByMs: 1_000_000, alertT24Sent: true, alertT6Sent: true },
      1_000_001,
    );
    expect(action).toEqual({
      id: 'sale-1',
      alert: 'DEADLINE_EXCEEDED',
      suggestCreditNoteEa: true,
    });
  });

  it('ignora ACCEPTED', () => {
    expect(evaluateDeadline({ ...base, sunatStatus: 'ACCEPTED', mustSubmitByMs: 1 }, 2)).toBeNull();
  });

  it('batch + helpers Lima', () => {
    const issued = Date.parse('2026-08-01T18:00:00.000Z'); // 13:00 Lima
    expect(summaryDateLima(issued)).toBe('2026-08-01');
    expect(facturaMustSubmitBy(issued)).toBe(issued + 3 * 24 * 3600 * 1000);
    expect(boletaMustSubmitByEndOfLimaDay(issued)).toBeGreaterThan(issued);
    expect(evaluateDeadlineBatch([], 0)).toEqual([]);
  });

  it('batch con candidato pendiente agrega su acción', () => {
    const action = evaluateDeadlineBatch(
      [
        { ...base, id: 'sale-b', mustSubmitByMs: 1_000_000, alertT24Sent: true, alertT6Sent: true },
        { ...base, id: 'sale-ok', sunatStatus: 'ACCEPTED', mustSubmitByMs: 1 },
      ],
      1_000_001,
    );
    expect(action).toEqual([
      { id: 'sale-b', alert: 'DEADLINE_EXCEEDED', suggestCreditNoteEa: true },
    ]);
  });
});
