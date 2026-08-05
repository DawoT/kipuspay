import { describe, expect, it } from 'vitest';
import { MOTIF_KINDS, motifIds } from './quipu-motif.js';

/**
 * El modulo quipu-draw fue retirado. Conserva el id de test del ledger 0243 (V-20).
 */
describe('quipu-draw', () => {
  it('fue sustituido por SVG hairline sin canvas 2D', () => {
    expect(MOTIF_KINDS).toContain('reconnect');
    expect(motifIds('hero-retired').gap).toBe('hero-retired-gap');
  });
});
