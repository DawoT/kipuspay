import { describe, expect, it } from 'vitest';
import {
  CORD_COLORS,
  CORD_VALUES,
  FIBER_PRIMARY,
  MOTIF_KINDS,
  clampCordCount,
  cordColor,
  cordValue,
  loomX,
  motifIds,
} from './quipu-motif.js';

describe('quipu-motif', () => {
  it('expone las cinco variantes semanticas', () => {
    expect(MOTIF_KINDS).toEqual(['loom', 'tension', 'reconnect', 'network', 'seal']);
  });

  it('motifIds es estable y sanitiza el prefijo', () => {
    expect(motifIds('home-offline').gap).toBe('home-offline-gap');
    expect(motifIds('a/b c').gap).toBe('abc-gap');
    expect(motifIds('').gap).toBe('motif-gap');
  });

  it('clampCordCount limita a 1..7', () => {
    expect(clampCordCount(0)).toBe(1);
    expect(clampCordCount(5)).toBe(5);
    expect(clampCordCount(99)).toBe(7);
  });

  it('loomX reparte cordeles de forma uniforme', () => {
    expect(loomX(0, 5)).toBe(28);
    expect(loomX(4, 5)).toBe(292);
    expect(loomX(0, 1)).toBe(28);
  });

  it('reutiliza la paleta de cordeles de marca', () => {
    expect(FIBER_PRIMARY).toBe('#3a4150');
    expect(CORD_COLORS.restaurantes).toMatch(/^#/);
  });

  it('cada rubro tiene un valor tejido y un color propios', () => {
    for (const slug of Object.keys(CORD_VALUES)) {
      expect(cordValue(slug)).toBeGreaterThanOrEqual(100);
      expect(cordValue(slug)).toBeLessThanOrEqual(999);
      expect(cordColor(slug)).toMatch(/^#/);
    }
  });

  it('slugs desconocidos caen a valores neutrales', () => {
    expect(cordValue('otro')).toBe(0);
    expect(cordColor('otro')).toBe('#f3efe6');
  });
});
