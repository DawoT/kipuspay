import { describe, expect, it } from 'vitest';
import { PRICING_DISCLAIMERS, PRICING_PLANS } from './pricing.js';

describe('pricing content', () => {
  it('expone 4 planes GTM §4.1 sin copy sin limite en Arranque', () => {
    expect(PRICING_PLANS).toHaveLength(4);
    expect(PRICING_PLANS.map((p) => p.id)).toEqual(['arranque', 'crece', 'cadena', 'enterprise']);
    const arranque = PRICING_PLANS[0];
    expect(arranque?.limits.join(' ')).toMatch(/1,000/);
    expect(arranque?.limits.join(' ').toLowerCase()).not.toMatch(/sin l[ií]mite/);
  });

  it('descongela soporte prioritario Enterprise tras GTM-02 / SLA', () => {
    const enterprise = PRICING_PLANS.find((p) => p.id === 'enterprise');
    expect(enterprise?.limits.join(' ')).toMatch(/Soporte prioritario/);
    expect(enterprise?.limits.join(' ')).not.toMatch(/GTM-02/);
    expect(enterprise?.limits.join(' ')).not.toMatch(/tras aprobacion de SLA/i);
  });

  it('ancla el plan Crece como "Más elegido" (GTM §5.8)', () => {
    const crece = PRICING_PLANS.find((p) => p.id === 'crece');
    expect(crece?.badge).toBe('Más elegido');
  });

  it('el copy público de precios no filtra jerga interna (M1)', () => {
    const all = [
      ...PRICING_PLANS.flatMap((p) => [...p.limits, p.audience]),
      PRICING_DISCLAIMERS.cupo,
      PRICING_DISCLAIMERS.gracia,
    ].join(' ');
    expect(all).not.toMatch(/GTM-\d+/);
    expect(all).not.toMatch(/HTTP\s*\d{3}/);
    expect(all).not.toMatch(/Quality\s*Gate/i);
    expect(all).not.toMatch(/Sprint\s+\d+/);
  });

  it('publica cupo Arranque activo (GTM-04)', () => {
    expect(PRICING_DISCLAIMERS.cupo).toMatch(/1,000/);
    expect(PRICING_DISCLAIMERS.cupo).toMatch(/0\.05/);
    expect(PRICING_DISCLAIMERS.cupo).toMatch(/no reembolsa/);
    expect(PRICING_DISCLAIMERS.cupo).not.toMatch(/Sprint 27/);
    expect(PRICING_DISCLAIMERS.gracia).toMatch(/gracia/i);
  });
});
