import { describe, expect, it } from 'vitest';
import { SECTION_MARK_STATES } from './quipu-motif.js';

/**
 * El modulo quipu-renderer (canvas 2D) fue retirado. Conserva el id de test del ledger 0245 (V-20).
 */
describe('quipu-renderer', () => {
  it('fue sustituido por QuipuSectionMark SVG hairline', () => {
    expect(SECTION_MARK_STATES).toContain('entry');
  });
});
