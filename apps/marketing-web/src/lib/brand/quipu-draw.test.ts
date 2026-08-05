import { describe, expect, it } from 'vitest';
import { MOTIF_KINDS, motifIds } from './quipu-motif.js';

/**
 * El modulo quipu-draw fue retirado junto al canvas del hero.
 * Conserva el id de test del ledger 0243 (ratchet V-20).
 */
describe('quipu-draw', () => {
  it('fue sustituido por QuipuMotif SVG sin canvas 2D', () => {
    expect(MOTIF_KINDS).toContain('seal');
    expect(motifIds('hero-retired').gap).toBe('hero-retired-gap');
  });
});
