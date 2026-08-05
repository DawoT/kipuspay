import { describe, expect, it } from 'vitest';
import { MOTIF_KINDS } from './quipu-motif.js';

/**
 * El modulo quipu-sim fue retirado: el hero es solo video/poster y el
 * cordel narrativo vive en motivos SVG (quipu-motif). Este archivo conserva
 * el id de test del ledger 0243 para el ratchet V-20.
 */
describe('quipu-sim', () => {
  it('fue sustituido por motivos SVG one-shot fuera del hero', () => {
    expect(MOTIF_KINDS).toEqual(['loom', 'tension', 'reconnect', 'network', 'seal']);
  });
});
