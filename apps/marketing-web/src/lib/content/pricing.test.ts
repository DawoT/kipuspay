import { describe, expect, it } from 'vitest';
import {
  PRICING_DISCLAIMERS,
  PRICING_PLANS,
  pricingFeatureAvailability,
  pricingFeatureText,
} from './pricing.js';

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
      ...PRICING_PLANS.flatMap((p) => [
        ...p.limits,
        p.audience,
        ...p.features.map((f) => pricingFeatureText(f)),
      ]),
      PRICING_DISCLAIMERS.cupo,
      PRICING_DISCLAIMERS.gracia,
    ].join(' ');
    expect(all).not.toMatch(/GTM-\d+/);
    expect(all).not.toMatch(/HTTP\s*\d{3}/);
    expect(all).not.toMatch(/Quality\s*Gate/i);
    expect(all).not.toMatch(/Sprint\s+\d+/);
    expect(all).not.toMatch(/SEV-\d/);
  });

  describe('inclusiones por plan — documento maestro Parte I §2.1/§6 (M4B)', () => {
    function features(planId: string): string {
      return (PRICING_PLANS.find((p) => p.id === planId)?.features ?? [])
        .map((f) => pricingFeatureText(f))
        .join(' ');
    }

    it('Arranque: venta, emisión, impresión 58/80, vitrina, arqueo, alta rápida y venta genérica', () => {
      const f = features('arranque');
      for (const expected of [
        'boleta',
        'factura',
        'impresión de tickets 58',
        'vitrina',
        'arqueo',
        'escáner',
        'venta rápida',
      ]) {
        expect(f.toLowerCase()).toContain(expected);
      }
    });

    it('Crece: Modo Dueño móvil, push, PWA, Z ciego, PIN descuentos, handoff, FEFO, BOM, promos, variantes, apartados, series, balanza, comisiones', () => {
      const f = features('crece');
      for (const expected of [
        'modo dueño',
        'push',
        'caja móvil',
        'arqueo z ciego',
        'descuentos',
        'turno',
        'lotes',
        'recetas',
        'promociones',
        'variantes',
        'apartados',
        'series',
        'balanza',
        'comisiones',
      ]) {
        expect(f.toLowerCase()).toContain(expected);
      }
    });

    it('Cadena: KDS, transferencias, 3-way, importadores, Yape/Plin, export contable, API, puntos, devoluciones NC, diario, cotizaciones, vales, cuotas, racks, pedidos WhatsApp, membresías, analítica con disclaimer y DR', () => {
      const f = features('cadena');
      for (const expected of [
        'comandas',
        'transferencias',
        'recepción',
        'importador',
        'yape',
        'contable',
        'api',
        'puntos',
        'devolucion',
        'diario',
        'cotizacion',
        'vales',
        'cuotas',
        'rack',
        'whatsapp',
        'membresía',
        'analítica',
        'continuidad',
      ]) {
        expect(f.toLowerCase()).toContain(expected);
      }
      expect(f.toLowerCase()).toMatch(/estimación, no garantía|estimacion, no garantia/);
      expect(f.toLowerCase()).not.toContain('no disponibles hoy');
    });

    it('Enterprise: SLA prioritario 1 hora y asistente de insights diario', () => {
      const f = features('enterprise');
      expect(f.toLowerCase()).toContain('1 hora');
      expect(f.toLowerCase()).toContain('asistente');
      expect(f.toLowerCase()).toContain('account manager');
    });
  });

  it('claims en preparación no se venden como live (PUBLIC_CLAIMS / GTM freeze)', () => {
    const needles: RegExp[] = [
      /comandas|\bkds\b/i,
      /arqueo z/i,
      /\bdr\b|desastres/i,
      /asistente gerente|insights/i,
      /whatsapp/i,
      /membresías|membresias/i,
      /envío a sunat|envio a sunat/i,
      /push operacional|caja móvil pwa|caja movil pwa/i,
    ];
    for (const plan of PRICING_PLANS) {
      for (const feature of plan.features) {
        const text = pricingFeatureText(feature);
        if (needles.some((n) => n.test(text))) {
          expect(pricingFeatureAvailability(feature), text).toBe('preparing');
        }
      }
    }
  });

  it('FEFO/lotes y merma están descongelados y vendibles (GTM-16/GTM-13)', () => {
    for (const plan of PRICING_PLANS) {
      for (const feature of plan.features) {
        const text = pricingFeatureText(feature);
        if (/fefo|vencimientos/i.test(text)) {
          expect(pricingFeatureAvailability(feature), text).toBe('available');
        }
      }
    }
  });

  it('publica cupo Arranque activo (GTM-04)', () => {
    expect(PRICING_DISCLAIMERS.cupo).toMatch(/1,000/);
    expect(PRICING_DISCLAIMERS.cupo).toMatch(/0\.05/);
    expect(PRICING_DISCLAIMERS.cupo).toMatch(/no reembolsa/);
    expect(PRICING_DISCLAIMERS.cupo).not.toMatch(/Sprint 27/);
    expect(PRICING_DISCLAIMERS.gracia).toMatch(/gracia/i);
  });
});
