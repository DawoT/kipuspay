import { describe, expect, it } from 'vitest';
import { recommendPlan } from './plan-picker.js';

describe('picker de plan (M5A — premium UX)', () => {
  it('negocio de 1 local y 1 caja sin capacidades extra → Arranque', () => {
    expect(recommendPlan({ locales: 1, cajas: 1, capacidades: [] })).toBe('arranque');
  });

  it('segunda caja o segundo local → Crece', () => {
    expect(recommendPlan({ locales: 1, cajas: 3, capacidades: [] })).toBe('crece');
    expect(recommendPlan({ locales: 2, cajas: 1, capacidades: [] })).toBe('crece');
    expect(recommendPlan({ locales: 1, cajas: 1, capacidades: ['modo-dueno'] })).toBe('crece');
  });

  it('4 locales o capacidades de cadena (comandas, API, multi-local) → Cadena', () => {
    expect(recommendPlan({ locales: 4, cajas: 4, capacidades: [] })).toBe('cadena');
    expect(recommendPlan({ locales: 2, cajas: 2, capacidades: ['comandas'] })).toBe('cadena');
    expect(recommendPlan({ locales: 1, cajas: 1, capacidades: ['api'] })).toBe('cadena');
  });

  it('SLA dedicado o 30+ locales → Enterprise', () => {
    expect(recommendPlan({ locales: 30, cajas: 30, capacidades: [] })).toBe('enterprise');
    expect(recommendPlan({ locales: 3, cajas: 3, capacidades: ['sla'] })).toBe('enterprise');
  });

  it('la cadena gana a Crece cuando coinciden capacidades de ambos', () => {
    expect(recommendPlan({ locales: 1, cajas: 2, capacidades: ['modo-dueno', 'comandas'] })).toBe(
      'cadena',
    );
  });
});
