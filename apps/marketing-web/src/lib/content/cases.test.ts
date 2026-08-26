import { describe, expect, it } from 'vitest';
import {
  allSimulations,
  casesForRubro,
  publishedCases,
  simulationForRubro,
  SUCCESS_CASES,
  type SuccessCase,
} from './cases.js';

describe('success cases and simulations', () => {
  it('no publica testimonios sin permiso (GTM-12)', () => {
    const raw: SuccessCase[] = [
      {
        id: 'c1',
        rubro: 'farmacias',
        businessName: 'Botica X',
        quote: 'Cuadramos caja sin pelearnos.',
        permissionGranted: false,
        published: true,
      },
      {
        id: 'c2',
        rubro: 'farmacias',
        businessName: 'Botica Y',
        quote: 'La primera venta fue el mismo dia.',
        permissionGranted: true,
        published: true,
      },
    ];
    expect(publishedCases(raw)).toHaveLength(1);
    expect(casesForRubro('farmacias', raw)[0]?.id).toBe('c2');
    expect(publishedCases()).toHaveLength(0);
    expect(SUCCESS_CASES).toHaveLength(0);
  });

  it('expone 6 simulaciones operativas de mostrador con métricas Antes vs Con KipusPay', () => {
    const sims = allSimulations();
    expect(sims).toHaveLength(6);

    const ids = sims.map((s) => s.id);
    expect(ids).toEqual([
      'cafeteria-especialidad',
      'minimarket-barrio',
      'botica-independiente',
      'taller-automotriz',
      'cadena-panaderias',
      'grifo-estacion-servicio',
    ]);

    expect(simulationForRubro('restaurantes')?.id).toBe('cafeteria-especialidad');
    expect(simulationForRubro('servicios')?.id).toBe('taller-automotriz');
    expect(simulationForRubro('cadenas')?.id).toBe('cadena-panaderias');
    expect(simulationForRubro('grifos')?.id).toBe('grifo-estacion-servicio');

    for (const sim of sims) {
      expect(sim.archetype.length).toBeGreaterThan(5);
      expect(sim.location.length).toBeGreaterThan(5);
      expect(sim.dailyTransactions).toMatch(/\d+\s*(tickets|despachos)\/d[íi]a/);
      expect(sim.headline.length).toBeGreaterThan(15);
      expect(sim.operationalChallenge.length).toBeGreaterThan(30);
      expect(sim.kipusSolution.length).toBeGreaterThan(30);
      expect(sim.ownerTakeaway.length).toBeGreaterThan(20);
      expect(sim.metrics.length).toBeGreaterThanOrEqual(3);

      for (const m of sim.metrics) {
        expect(m.label.length).toBeGreaterThan(5);
        expect(m.before.length).toBeGreaterThan(1);
        expect(m.withKipus.length).toBeGreaterThan(1);
        expect(m.improvement.length).toBeGreaterThan(2);
      }
    }
  });

  it('las simulaciones operativas no contienen jerga técnica prohibida', () => {
    const blob = allSimulations()
      .map(
        (s) =>
          `${s.archetype} ${s.headline} ${s.operationalChallenge} ${s.kipusSolution} ${s.ownerTakeaway} ${s.metrics.map((m) => `${m.label} ${m.before} ${m.withKipus} ${m.improvement}`).join(' ')}`,
      )
      .join(' ');
    expect(blob).not.toMatch(/\b(PSE|CDR|UBL|ACID|D1|Edge|Workers)\b/i);
    expect(blob).not.toMatch(/GTM-\d+/);
  });
});
