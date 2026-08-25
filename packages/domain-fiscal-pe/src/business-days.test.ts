/**
 * H5 (auditoría 0031) — tope E-A: la NC de anulación sin CDR solo procede
 * dentro de los primeros 10 días hábiles del mes siguiente a la emisión del
 * CPE originario (regla SUNAT de modificación/anulación por error de RUC o
 * descripción). Función pura, reloj inyectado, calendario Lima (UTC-5).
 *
 * LIMITACIÓN DOCUMENTADA: v1 excluye solo sábados/domingos. El calendario de
 * feriados de Perú NO está modelado (feriados nacionales, refs. decreto
 * supreno) — un feriado entre semana se cuenta como día hábil. El error es
 * conservador SOLO en contra del emisor si el 10° hábil cae en un feriado
 * (el tope real sería un día más tarde); nunca al revés.
 */
import { describe, expect, it } from 'vitest';
import {
  EA_DEADLINE_BUSINESS_DAYS,
  assertEaAnulacionDeadline,
  isWithinEaAnulacionDeadline,
  tenthBusinessDayEndOfNextMonthLima,
} from './business-days.js';

/** ISO Lima-naive → ms UTC (issued_at_lima se almacena 'YYYY-MM-DD HH:MM:SS'). */
function limaNaiveMs(s: string): number {
  return Date.parse(`${s.replace(' ', 'T')}Z`) + 5 * 3600 * 1000;
}

describe('tenthBusinessDayEndOfNextMonthLima (H5)', () => {
  it('constante expuesta: 10 días hábiles', () => {
    expect(EA_DEADLINE_BUSINESS_DAYS).toBe(10);
  });

  it('emisión 03-ago-2026 → tope fin del 10° hábil de septiembre = lun 14-sep 23:59:59.999 Lima', () => {
    // Sep 2026: 1(mar) 2(mié) 3(jue) 4(vie) [5-6 fin de] 7(lun) 8 9 10 11 [12-13 fin] 14(lun) ← 10°
    const issued = limaNaiveMs('2026-08-03 10:00:00');
    const deadline = tenthBusinessDayEndOfNextMonthLima(issued);
    expect(deadline).toBe(Date.parse('2026-09-15T04:59:59.999Z'));
  });

  it('salta fines de semana completos (sáb+dom consecutivos)', () => {
    // Si contara días corridos, el 10° sería 10-sep (jue); con exclusión es 14-sep.
    const issued = limaNaiveMs('2026-08-31 23:59:59');
    const deadline = tenthBusinessDayEndOfNextMonthLima(issued);
    expect(deadline).toBe(Date.parse('2026-09-15T04:59:59.999Z'));
  });

  it('rollover de año: emisión dic-2026 → tope en enero 2027 (jue 14-ene)', () => {
    // Ene 2027: 1(vie) 2-3(fin) 4(lun) 5 6 7 8 [9-10] 11 12 13 14(jue) ← 10°
    const issued = limaNaiveMs('2026-12-15 08:30:00');
    const deadline = tenthBusinessDayEndOfNextMonthLima(issued);
    expect(deadline).toBe(Date.parse('2027-01-15T04:59:59.999Z'));
  });

  it('emisión el último día del mes (domingo) → mes siguiente completo', () => {
    // 31-ene-2027 es domingo; feb-2027: 1(lun)..5(vie) [6-7] 8..12(vie) ← 10°
    const issued = limaNaiveMs('2027-01-31 18:00:00');
    const deadline = tenthBusinessDayEndOfNextMonthLima(issued);
    expect(deadline).toBe(Date.parse('2027-02-13T04:59:59.999Z'));
  });
});

describe('isWithinEaAnulacionDeadline (H5)', () => {
  const issued = limaNaiveMs('2026-08-03 10:00:00');

  it('dentro del tope: cualquier momento hasta fin del 10° hábil', () => {
    expect(isWithinEaAnulacionDeadline(issued, Date.parse('2026-09-01T12:00:00Z'))).toBe(true);
    expect(isWithinEaAnulacionDeadline(issued, Date.parse('2026-09-14T12:00:00Z'))).toBe(true);
    // Último instante del tope: 23:59:59.999 Lima del 14-sep.
    expect(isWithinEaAnulacionDeadline(issued, Date.parse('2026-09-15T04:59:59.999Z'))).toBe(true);
  });

  it('fuera del tope: desde el primer instante del día siguiente hábil', () => {
    // 15-sep 00:00 Lima == 05:00 UTC.
    expect(isWithinEaAnulacionDeadline(issued, Date.parse('2026-09-15T05:00:00Z'))).toBe(false);
    expect(isWithinEaAnulacionDeadline(issued, Date.parse('2026-10-01T12:00:00Z'))).toBe(false);
  });
});

describe('assertEaAnulacionDeadline (H5 guard tipado)', () => {
  const issued = limaNaiveMs('2026-08-03 10:00:00');

  it('dentro del tope → no lanza', () => {
    expect(() =>
      assertEaAnulacionDeadline({
        originIssuedAtMs: issued,
        nowMs: Date.parse('2026-09-10T12:00:00Z'),
      }),
    ).not.toThrow();
  });

  it('después del tope → CREDIT_NOTE_EA_DEADLINE_EXCEEDED', () => {
    expect(() =>
      assertEaAnulacionDeadline({
        originIssuedAtMs: issued,
        nowMs: Date.parse('2026-09-20T12:00:00Z'),
      }),
    ).toThrow(/CREDIT_NOTE_EA_DEADLINE_EXCEEDED/);
  });
});
