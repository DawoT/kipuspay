import { describe, expect, it } from 'vitest';
import {
  ALLOWED_PLANS,
  diffCapabilities,
  extractStripePriceId,
  getCapabilitiesForPlan,
  isAllowedPlan,
  isSelfServePlan,
  PLAN_CAPABILITIES,
  planForStripePrice,
  provisionCapabilitiesForPlan,
  resolvePlanFromExtracted,
} from './plan-provision.js';

describe('plan-provision — mapping canónico (migration 0064)', () => {
  it('arranque = 12 caps base (pos.checkout etc)', () => {
    const caps = getCapabilitiesForPlan('arranque');
    expect(caps.length).toBe(12);
    expect(caps).toContain('pos.checkout');
    expect(caps).toContain('auth.cashier_login');
    expect(caps).not.toContain('owner.mode');
  });

  it('crece = 30 caps (arranque + 18) superset monotónico', () => {
    const arr = new Set(getCapabilitiesForPlan('arranque'));
    const crece = getCapabilitiesForPlan('crece');
    expect(crece.length).toBe(30);
    for (const c of arr) expect(crece).toContain(c);
    expect(crece).toContain('owner.mode');
    expect(crece).toContain('cash.blind_z');
    expect(crece).toContain('pricing.promotions');
    expect(crece).not.toContain('stock.transfers');
  });

  it('cadena = 52 caps (crece + 22)', () => {
    const crece = new Set(getCapabilitiesForPlan('crece'));
    const cadena = getCapabilitiesForPlan('cadena');
    expect(cadena.length).toBe(52);
    for (const c of crece) expect(cadena).toContain(c);
    expect(cadena).toContain('stock.transfers');
    expect(cadena).toContain('integrations.api');
    expect(cadena).toContain('inventory.locations');
    expect(cadena).not.toContain('orders.lifecycle');
  });

  it('enterprise = 77 caps (superset completo)', () => {
    const cadena = new Set(getCapabilitiesForPlan('cadena'));
    const ent = getCapabilitiesForPlan('enterprise');
    expect(ent.length).toBe(77);
    for (const c of cadena) expect(ent).toContain(c);
    expect(ent).toContain('orders.kds');
    expect(ent).toContain('analytics.forecasting');
    expect(ent).toContain('marketing.site');
  });

  it('provisionCapabilitiesForPlan alias', () => {
    expect(provisionCapabilitiesForPlan('cadena')).toEqual(getCapabilitiesForPlan('cadena'));
  });

  it('isAllowedPlan / isSelfServePlan', () => {
    expect(isAllowedPlan('arranque')).toBe(true);
    expect(isAllowedPlan('crece')).toBe(true);
    expect(isAllowedPlan('cadena')).toBe(true);
    expect(isAllowedPlan('enterprise')).toBe(true);
    expect(isAllowedPlan('gold')).toBe(false);
    expect(isSelfServePlan('enterprise')).toBe(false);
    expect(isSelfServePlan('crece')).toBe(true);
    expect(ALLOWED_PLANS.has('arranque')).toBe(true);
  });

  it('getCapabilitiesForPlan lanza INVALID_PLAN en plan desconocido', () => {
    expect(() => getCapabilitiesForPlan('gold')).toThrow(/INVALID_PLAN/);
    expect(() => getCapabilitiesForPlan('')).toThrow(/INVALID_PLAN/);
  });

  it('PLAN_CAPABILITIES contiene 4 planes con copia estable', () => {
    expect(Object.keys(PLAN_CAPABILITIES).sort()).toEqual([
      'arranque',
      'cadena',
      'crece',
      'enterprise',
    ]);
    // inmutabilidad superficial: el array no debe ser mutable por el caller (readonly)
    // pero JS no congela; verificamos contenido ordenado estable
    expect(PLAN_CAPABILITIES.arranque[0]).toBe('pos.checkout');
  });

  it('diffCapabilities toAdd / toRemoveIfPlanDefault', () => {
    const up = diffCapabilities('arranque', 'crece');
    expect(up.toAdd.length).toBe(18);
    expect(up.toAdd).toContain('owner.mode');
    expect(up.toRemoveIfPlanDefault.length).toBe(0);

    const down = diffCapabilities('cadena', 'arranque');
    expect(down.toAdd.length).toBe(0);
    expect(down.toRemoveIfPlanDefault.length).toBe(40); // 52-12
    expect(down.toRemoveIfPlanDefault).toContain('stock.transfers');
    expect(down.toRemoveIfPlanDefault).not.toContain('pos.checkout');

    const self = diffCapabilities('crece', 'crece');
    expect(self.toAdd.length).toBe(0);
    expect(self.toRemoveIfPlanDefault.length).toBe(0);
  });

  it('diffCapabilities lanza si plan inválido', () => {
    expect(() => diffCapabilities('gold', 'crece')).toThrow(/INVALID_PLAN/);
    expect(() => diffCapabilities('arranque', 'gold')).toThrow(/INVALID_PLAN/);
  });
});

describe('plan-provision — Stripe price mapping', () => {
  const env = {
    STRIPE_PRICE_ARRANQUE: 'price_arr_123',
    STRIPE_PRICE_CRECE: 'price_crece_456',
    STRIPE_PRICE_CADENA: 'price_cadena_789',
  };

  it('planForStripePrice mapeo directo', () => {
    expect(planForStripePrice('price_arr_123', env)).toBe('arranque');
    expect(planForStripePrice('price_crece_456', env)).toBe('crece');
    expect(planForStripePrice('price_cadena_789', env)).toBe('cadena');
    expect(planForStripePrice('price_unknown', env)).toBeNull();
    expect(planForStripePrice('', env)).toBeNull();
    expect(planForStripePrice(null, env)).toBeNull();
    expect(planForStripePrice('  price_arr_123  ', env)).toBe('arranque'); // trim
  });

  it('extractStripePriceId soporta items.data price.id', () => {
    const obj = { items: { data: [{ price: { id: 'price_arr_123' } }] } };
    expect(extractStripePriceId(obj)).toBe('price_arr_123');
  });

  it('extractStripePriceId soporta plan.id y lines', () => {
    expect(extractStripePriceId({ plan: { id: 'price_crece_456' } })).toBe('price_crece_456');
    expect(extractStripePriceId({ items: { data: [{ plan: { id: 'price_cadena_789' } }] } })).toBe(
      'price_cadena_789',
    );
    expect(extractStripePriceId({ lines: { data: [{ price: { id: 'price_arr_123' } }] } })).toBe(
      'price_arr_123',
    );
  });

  it('extractStripePriceId soporta metadata plan_id marker', () => {
    expect(extractStripePriceId({ metadata: { plan_id: 'crece' } })).toBe('__plan:crece');
    expect(extractStripePriceId({ metadata: { plan_id: 'gold' } })).toBeNull(); // not allowed plan
    expect(extractStripePriceId({ metadata: {} })).toBeNull();
  });

  it('extractStripePriceId null en objeto vacío o sin price', () => {
    expect(extractStripePriceId(null)).toBeNull();
    expect(extractStripePriceId({})).toBeNull();
    expect(extractStripePriceId({ items: { data: [] } })).toBeNull();
    expect(extractStripePriceId({ items: { data: [{ price: {} }] } })).toBeNull();
    expect(extractStripePriceId({ items: { data: [{}] } })).toBeNull(); // hit return null at 237
    expect(extractStripePriceId({ lines: { data: [{}] } })).toBeNull();
  });

  it('resolvePlanFromExtracted maneja marker y price', () => {
    expect(resolvePlanFromExtracted('__plan:cadena', env)).toBe('cadena');
    expect(resolvePlanFromExtracted('__plan:gold', env)).toBeNull();
    expect(resolvePlanFromExtracted('price_crece_456', env)).toBe('crece');
    expect(resolvePlanFromExtracted(null, env)).toBeNull();
    expect(resolvePlanFromExtracted('', env)).toBeNull();
  });

  it('flujo E2E price → plan para webhook reconciliation', () => {
    const payload = { items: { data: [{ price: { id: 'price_cadena_789' } }] } };
    const extracted = extractStripePriceId(payload);
    const plan = resolvePlanFromExtracted(extracted, env);
    expect(plan).toBe('cadena');
    const caps = plan ? getCapabilitiesForPlan(plan) : [];
    expect(caps.length).toBe(52);
  });

  it('enterprise price no mapeado → null (no auto-upgrade a enterprise por price)', () => {
    // enterprise no tiene STRIPE_PRICE env self-serve; el webhook no debe auto-escalar a enterprise por price
    expect(planForStripePrice('price_enterprise', env)).toBeNull();
  });
});

describe('plan-provision — invariantes de calidad (V-02, V-04, hot path)', () => {
  it('caps no contienen duplicados ni strings vacíos', () => {
    for (const plan of ['arranque', 'crece', 'cadena', 'enterprise'] as const) {
      const caps = getCapabilitiesForPlan(plan);
      const set = new Set(caps);
      expect(set.size).toBe(caps.length);
      for (const c of caps) {
        expect(c.trim().length).toBeGreaterThan(0);
        expect(c).toMatch(/^[a-z]+\.[a-z_]+$/); // formato capability
      }
    }
  });

  it('susets monotónicos (CAL-08 complejidad baja si asserts lineales)', () => {
    const order: Array<'arranque' | 'crece' | 'cadena' | 'enterprise'> = [
      'arranque',
      'crece',
      'cadena',
      'enterprise',
    ];
    for (let i = 1; i < order.length; i += 1) {
      const prev = new Set(getCapabilitiesForPlan(order[i - 1]!));
      const curr = getCapabilitiesForPlan(order[i]!);
      for (const c of prev) expect(curr).toContain(c);
    }
  });
});
