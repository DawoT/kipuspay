import { describe, expect, it } from 'vitest';
import { buildBriefing, type BriefingInput } from './briefing.js';

describe('insights briefing determinista (Sprint 49)', () => {
  const input: BriefingInput = {
    tenantId: 't1',
    reportDate: '2026-08-03',
    sales: { grossSalesCents: 118000, docCount: 42 },
    breakage: [{ productName: 'Café', daysCovered: 3, suggestedReorderQty: 10 }],
    cashExceptions: [{ branchCode: 'C01', diffCents: -5000 }],
  };

  it('genera 3 viñetas (ventas, quiebre, excepciones) con números verbatim', () => {
    const briefing = buildBriefing(input);
    expect(briefing.bullets).toHaveLength(3);
    expect(briefing.bullets[0]).toContain('S/ 1180.00');
    expect(briefing.bullets[1]).toContain('Café');
    expect(briefing.bullets[2]).toContain('C01');
    expect(briefing.reportDate).toBe('2026-08-03');
  });

  it('copy sin jerga y sin promesas ("datos del servidor")', () => {
    const briefing = buildBriefing(input);
    const text = briefing.bullets.join(' ');
    expect(text).not.toMatch(/PII|LLM|AI/);
    expect(briefing.disclaimer).toMatch(/Datos del día/);
  });

  it('sin excepciones de caja la viñeta lo dice, no la omite en silencio', () => {
    const briefing = buildBriefing({ ...input, cashExceptions: [] });
    expect(briefing.bullets[2]).toMatch(/Sin diferencias/i);
  });

  it('sin quiebre la viñeta lo dice; con excepciones reporta sucursal y monto', () => {
    const noBreakage = buildBriefing({ ...input, breakage: [] });
    expect(noBreakage.bullets[1]).toMatch(/Sin alertas de quiebre/i);
    const withCash = buildBriefing({
      ...input,
      cashExceptions: [{ branchCode: 'C02', diffCents: -5000 }],
    });
    expect(withCash.bullets[2]).toMatch(/C02/);
    expect(withCash.bullets[2]).toContain('S/ -50.00');
  });

  it('edge 1C: atribuye la diferencia al turno correcto (viñeta por tramo)', () => {
    const briefing = buildBriefing({
      ...input,
      cashShifts: [
        { operator: 'ana@tienda.pe', cashDiffCents: 5000 },
        { operator: 'luis@tienda.pe', cashDiffCents: -2000 },
      ],
    });
    expect(briefing.bullets).toHaveLength(4);
    expect(briefing.bullets[3]).toMatch(/Por turnos:/);
    expect(briefing.bullets[3]).toContain('ana@tienda.pe');
    expect(briefing.bullets[3]).toContain('faltan S/ 50.00');
    expect(briefing.bullets[3]).toContain('luis@tienda.pe');
    expect(briefing.bullets[3]).toContain('sobran S/ 20.00');
  });

  it('sin tramos con diferencia no añade viñeta de turnos', () => {
    const briefing = buildBriefing({ ...input, cashShifts: [] });
    expect(briefing.bullets).toHaveLength(3);
  });
});
