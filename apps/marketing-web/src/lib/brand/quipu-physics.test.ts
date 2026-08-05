import { describe, expect, it } from 'vitest';
import { MOTIF_KINDS } from './quipu-motif.js';

/**
 * El modulo quipu-physics (Verlet) fue retirado. Conserva el id de test del ledger 0245 (V-20).
 */
describe('quipu-physics', () => {
  it('fue sustituido por el sistema editorial fibra + un nudo', () => {
    expect(MOTIF_KINDS).toEqual(['reconnect']);
  });
});
