import { describe, expect, it } from 'vitest';
import {
  CORD_COLORS,
  FIBER_PRIMARY,
  MARK_KNOT_Y_MAX,
  MARK_KNOT_Y_MIN,
  MOTIF_KINDS,
  SECTION_MARK_STATES,
  cordColor,
  cordValue,
  markKnotY,
  markKnotYFromProgress,
  motifIds,
  sectionScrollProgress,
} from './quipu-motif.js';

describe('quipu-motif', () => {
  it('expone solo reconnect como motivo ilustrado mid-page', () => {
    expect(MOTIF_KINDS).toEqual(['reconnect']);
  });

  it('expone los estados del margen de seccion', () => {
    expect(SECTION_MARK_STATES).toEqual(['entry', 'synced', 'reconciled']);
  });

  it('motifIds es estable y sanitiza el prefijo', () => {
    expect(motifIds('home-offline').gap).toBe('home-offline-gap');
    expect(motifIds('a/b c').gap).toBe('abc-gap');
    expect(motifIds('').gap).toBe('motif-gap');
  });

  it('markKnotY baja el nudo segun la etapa', () => {
    expect(markKnotY('entry')).toBeLessThan(markKnotY('synced'));
    expect(markKnotY('synced')).toBeLessThan(markKnotY('reconciled'));
  });

  it('sectionScrollProgress clampa extremos y mide el mid', () => {
    expect(sectionScrollProgress({ top: 900, height: 400 }, 800)).toBe(0);
    expect(sectionScrollProgress({ top: -400, height: 400 }, 800)).toBe(1);
    expect(sectionScrollProgress({ top: 200, height: 400 }, 800)).toBeCloseTo(0.5, 5);
  });

  it('markKnotYFromProgress interpola el rango del viewBox', () => {
    expect(markKnotYFromProgress(0)).toBe(MARK_KNOT_Y_MIN);
    expect(markKnotYFromProgress(1)).toBe(MARK_KNOT_Y_MAX);
    expect(markKnotYFromProgress(0.5)).toBeCloseTo((MARK_KNOT_Y_MIN + MARK_KNOT_Y_MAX) / 2, 5);
    expect(markKnotYFromProgress(-1)).toBe(MARK_KNOT_Y_MIN);
    expect(markKnotYFromProgress(2)).toBe(MARK_KNOT_Y_MAX);
  });

  it('reutiliza la paleta de fibra de marca', () => {
    expect(FIBER_PRIMARY).toBe('#3a4150');
    expect(CORD_COLORS.restaurantes).toMatch(/^#/);
  });

  it('cordValue y cordColor resuelven slugs conocidos', () => {
    expect(cordValue('retail')).toBe(312);
    expect(cordValue('desconocido')).toBe(0);
    expect(cordColor('farmacias')).toMatch(/^#/);
    expect(cordColor('x')).toMatch(/^#/);
  });
});
