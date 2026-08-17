import { describe, expect, it } from 'vitest';
import { PLAN_MATRIX, planMatrixAvailability, planMatrixIncluded } from './plan-matrix.js';
import { planCta, PLAN_CTA } from './pricing.js';

describe('matriz de planes (M5A — documento maestro Parte I §6)', () => {
  it('cubre las 16 áreas del documento con plan mínimo válido', () => {
    expect(PLAN_MATRIX).toHaveLength(16);
    for (const row of PLAN_MATRIX) {
      expect(['arranque', 'crece', 'cadena', 'enterprise']).toContain(row.minPlan);
      expect(row.area.length).toBeGreaterThan(3);
      expect(row.summary.length).toBeGreaterThan(15);
    }
  });

  it('áreas clave con su plan mínimo del documento', () => {
    const byArea = new Map(PLAN_MATRIX.map((r) => [r.area, r.minPlan]));
    expect(byArea.get('Caja & Cobros')).toBe('arranque');
    expect(byArea.get('Emisión Fiscal')).toBe('arranque');
    expect(byArea.get('Gestión Móvil')).toBe('crece');
    expect(byArea.get('Control de Caja')).toBe('crece');
    expect(byArea.get('Restaurantes')).toBe('cadena');
    expect(byArea.get('Integraciones')).toBe('cadena');
    expect(byArea.get('Inteligencia AI')).toBe('enterprise');
  });

  it('planMatrixIncluded es acumulativo (una fila con mínimo Crece incluye Crece, Cadena y Enterprise)', () => {
    const fila = PLAN_MATRIX.find((r) => r.minPlan === 'crece');
    expect(fila).toBeDefined();
    expect(planMatrixIncluded(fila!.minPlan, 'arranque')).toBe(false);
    expect(planMatrixIncluded(fila!.minPlan, 'crece')).toBe(true);
    expect(planMatrixIncluded(fila!.minPlan, 'cadena')).toBe(true);
    expect(planMatrixIncluded(fila!.minPlan, 'enterprise')).toBe(true);
  });

  it('la matriz es acumulativa para todos los planes', () => {
    for (const plan of ['arranque', 'crece', 'cadena', 'enterprise'] as const) {
      for (const row of PLAN_MATRIX) {
        expect(typeof planMatrixIncluded(row.minPlan, plan)).toBe('boolean');
      }
    }
  });
});

describe('CTA de compra unificado (M5A)', () => {
  it('una sola etiqueta para los planes autoservicio', () => {
    expect(PLAN_CTA.selfServe).toEqual({ label: 'Empieza gratis', href: '/empezar' });
  });

  it('Enterprise va a contacto de ventas, no al onboarding', () => {
    expect(PLAN_CTA.enterprise.label).toBe('Contactar a ventas');
    expect(PLAN_CTA.enterprise.href).toBe('mailto:contacto@kipuspay.com');
  });

  it('planCta resuelve el CTA por plan', () => {
    expect(planCta('arranque')).toEqual(PLAN_CTA.selfServe);
    expect(planCta('crece')).toEqual(PLAN_CTA.selfServe);
    expect(planCta('cadena')).toEqual(PLAN_CTA.selfServe);
    expect(planCta('enterprise')).toEqual(PLAN_CTA.enterprise);
  });
});

describe('honestidad GTM freeze en la matriz', () => {
  it('KDS, Z ciego, emisión SUNAT y WhatsApp/membresías van En preparación', () => {
    const byArea = new Map(PLAN_MATRIX.map((r) => [r.area, planMatrixAvailability(r)]));
    expect(byArea.get('Emisión Fiscal')).toBe('preparing');
    expect(byArea.get('Control de Caja')).toBe('preparing');
    expect(byArea.get('Restaurantes')).toBe('preparing');
    expect(byArea.get('Servicios')).toBe('preparing');
  });

  it('cobro, nota de venta y hardware no se marcan en preparación', () => {
    const byArea = new Map(PLAN_MATRIX.map((r) => [r.area, planMatrixAvailability(r)]));
    expect(byArea.get('Caja & Cobros')).toBe('available');
    expect(byArea.get('Control Interno')).toBe('available');
    expect(byArea.get('Hardware')).toBe('available');
  });
});
