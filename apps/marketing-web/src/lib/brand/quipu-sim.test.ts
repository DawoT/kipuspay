import { describe, expect, it } from 'vitest';
import { MOTIF_KINDS, SECTION_MARK_STATES } from './quipu-motif.js';

/**
 * El modulo quipu-sim fue retirado. Conserva el id de test del ledger 0243 (V-20).
 */
describe('quipu-sim', () => {
  it('fue sustituido por margen de seccion + reconnect offline', () => {
    expect(MOTIF_KINDS).toEqual(['reconnect']);
    expect(SECTION_MARK_STATES).toContain('entry');
  });
});
