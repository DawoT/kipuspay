import { describe, expect, it } from 'vitest';
import {
  containsJargon,
  tourStepsFor,
  tourStorageKey,
  TOUR_DISMISSED,
  TOUR_COMPLETED,
  validateTourCopy,
  JARGON_TERMS,
  TOUR_STEPS,
} from './tour.js';

const ALL = new Set([
  'kds',
  'fefo',
  'scale',
  'promotions',
  'variants',
  'quick_add',
  'shift_handoff',
  'team_invite',
]);

describe('Product Tour (regla 37a)', () => {
  it('activa pasos SOLO por capability del tenant (ADR-ARCH-002, cero fork por vertical)', () => {
    const steps = tourStepsFor({
      vertical: 'restaurant',
      role: 'owner',
      capabilities: new Set(['kds', 'quick_add']),
      hasSold: false,
    });
    const targets = steps.map((s) => s.target);
    expect(targets).toContain('kds');
    expect(targets).toContain('catalog');
    expect(targets).not.toContain('fefo');
    expect(targets).not.toContain('scale');
  });

  it('el rubro solo elige el copy: kds aplica a restaurant, no a pharmacy', () => {
    const restaurant = tourStepsFor({
      vertical: 'restaurant',
      role: 'cashier',
      capabilities: new Set(['kds']),
      hasSold: false,
    });
    const pharmacy = tourStepsFor({
      vertical: 'pharmacy',
      role: 'cashier',
      capabilities: new Set(['kds', 'fefo']),
      hasSold: false,
    });
    expect(restaurant.map((s) => s.target)).toContain('kds');
    expect(pharmacy.map((s) => s.target)).not.toContain('kds');
    expect(pharmacy.map((s) => s.target)).toContain('fefo');
    expect(pharmacy.find((s) => s.target === 'fefo')?.body).toMatch(/farmacia/);
  });

  it('el rol filtra: shift/team son de Dueño, no de Cajero', () => {
    const owner = tourStepsFor({
      vertical: 'retail',
      role: 'owner',
      capabilities: ALL,
      hasSold: false,
    });
    const cashier = tourStepsFor({
      vertical: 'retail',
      role: 'cashier',
      capabilities: ALL,
      hasSold: false,
    });
    expect(owner.map((s) => s.target)).toContain('shift');
    expect(owner.map((s) => s.target)).toContain('team');
    expect(cashier.map((s) => s.target)).not.toContain('shift');
    expect(cashier.map((s) => s.target)).not.toContain('team');
  });

  it('se omite si el negocio ya vendió (criterio S52)', () => {
    const steps = tourStepsFor({
      vertical: 'retail',
      role: 'owner',
      capabilities: ALL,
      hasSold: true,
    });
    expect(steps).toHaveLength(0);
  });

  it('sin capabilities no hay tour', () => {
    const steps = tourStepsFor({
      vertical: 'retail',
      role: 'owner',
      capabilities: new Set(),
      hasSold: false,
    });
    expect(steps).toHaveLength(0);
  });

  it('clave de persistencia local por rubro (no re-aparece si se cierra)', () => {
    expect(tourStorageKey('restaurant')).toBe('kipus:tour:restaurant:state');
    expect(TOUR_DISMISSED).toBe('dismissed');
    expect(TOUR_COMPLETED).toBe('completed');
  });

  it('copy del tour sin jerga técnica (Staff Content)', () => {
    const result = validateTourCopy();
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('la validación de jerga detecta infracciones si aparecen', () => {
    const result = validateTourCopy([
      { target: 'x', title: 'Conecta tu WebUSB', body: 'usa la API', capability: 'scale' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.term)).toContain('WebUSB');
    expect(result.violations.map((v) => v.term)).toContain('API');
  });

  it('containsJargon: respeta límites de palabra y múltiples ocurrencias', () => {
    expect(containsJargon('usa la API del POS', 'API')).toBe(true);
    expect(containsJargon('APIs públicas', 'API')).toBe(false);
    expect(containsJargon('termina en la API', 'API')).toBe(true);
    expect(containsJargon('API API', 'API')).toBe(true);
    expect(containsJargon('sin nada', 'API')).toBe(false);
  });

  it('el catálogo usa solo capabilities conocidas y targets únicos', () => {
    const known = new Set([
      'kds',
      'fefo',
      'scale',
      'promotions',
      'variants',
      'quick_add',
      'shift_handoff',
      'team_invite',
    ]);
    expect(TOUR_STEPS.every((s) => known.has(s.capability))).toBe(true);
    expect(new Set(TOUR_STEPS.map((s) => s.target)).size).toBe(TOUR_STEPS.length);
    expect(JARGON_TERMS.length).toBeGreaterThan(0);
  });

  it('BLOQUEANTE GTM §3.3: slugs españoles restaurantes/farmacias mapean a KDS/FEFO', () => {
    const kdsEnabled = new Set(['kds', 'quick_add']);
    const fefoEnabled = new Set(['fefo', 'quick_add']);
    const restaurantesKds = tourStepsFor({
      vertical: 'restaurantes',
      role: 'cashier',
      capabilities: kdsEnabled,
      hasSold: false,
    });
    expect(restaurantesKds.map((s) => s.target)).toContain('kds');

    const farmaciasFefo = tourStepsFor({
      vertical: 'farmacias',
      role: 'cashier',
      capabilities: fefoEnabled,
      hasSold: false,
    });
    expect(farmaciasFefo.map((s) => s.target)).toContain('fefo');

    // Negativo: restaurantes no debe mostrar FEFO y farmacias no debe mostrar KDS
    const restaurantesFefo = tourStepsFor({
      vertical: 'restaurantes',
      role: 'cashier',
      capabilities: fefoEnabled,
      hasSold: false,
    });
    expect(restaurantesFefo.map((s) => s.target)).not.toContain('fefo');
    const farmaciasKds = tourStepsFor({
      vertical: 'farmacias',
      role: 'cashier',
      capabilities: kdsEnabled,
      hasSold: false,
    });
    expect(farmaciasKds.map((s) => s.target)).not.toContain('kds');
  });
});
