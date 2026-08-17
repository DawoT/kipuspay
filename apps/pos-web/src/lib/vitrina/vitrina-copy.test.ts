import { describe, expect, it } from 'vitest';
import { vitrinaHeading, vitrinaPhaseLabel } from './vitrina-copy';

describe('vitrinaPhaseLabel', () => {
  it('no muestra el enum en inglés', () => {
    expect(vitrinaPhaseLabel('idle')).toBe('Esperando');
    expect(vitrinaPhaseLabel('charged')).toBe('Cobrado');
    expect(vitrinaPhaseLabel('idle').toUpperCase()).not.toBe('IDLE');
  });
});

describe('vitrinaHeading', () => {
  it('prioriza la marca del comercio', () => {
    expect(vitrinaHeading('Bodega San Martín')).toBe('Bodega San Martín');
  });

  it('no usa KipusPay como título cuando no hay marca', () => {
    expect(vitrinaHeading(undefined)).toBe('Tu compra');
    expect(vitrinaHeading('')).not.toMatch(/KipusPay/i);
  });
});
