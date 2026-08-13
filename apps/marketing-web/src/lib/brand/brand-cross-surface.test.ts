import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * S15-H3: auditoría cruzada de marca "Ledger Minimalism" (Arquitectura §0.2).
 * La identidad canónica (tinta #14161c, sello #0f6b4c, alerta #b5461d, ámbar
 * #d99a3d) debe existir en AMBAS superficies. En el dark del POS, el texto usa
 * variantes bright (#3dbb86/#e88a5e) para cumplir WCAG AA — los canónicos
 * permanecen en gradientes y en el light theme. Si un hex canónico desaparece
 * de una superficie, este test falla.
 */

const MKT_CSS = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');
const POS_CSS = readFileSync(new URL('../../../../pos-web/src/app.css', import.meta.url), 'utf8');

/** ¿El hex canónico existe en el CSS (cualquier contexto)? */
function hasHex(css: string, hex: string): boolean {
  return css.toLowerCase().includes(hex);
}

describe('brand tokens cross-surface (S15-H3)', () => {
  it('tinta #14161c presente en ambas superficies', () => {
    expect(hasHex(MKT_CSS, '#14161c')).toBe(true);
    expect(hasHex(POS_CSS, '#14161c')).toBe(true);
  });

  it('sello #0f6b4c presente en ambas superficies (identidad canónica)', () => {
    expect(hasHex(MKT_CSS, '#0f6b4c')).toBe(true);
    expect(hasHex(POS_CSS, '#0f6b4c')).toBe(true);
  });

  it('alerta #b5461d presente en ambas superficies (identidad canónica)', () => {
    expect(hasHex(MKT_CSS, '#b5461d')).toBe(true);
    expect(hasHex(POS_CSS, '#b5461d')).toBe(true);
  });

  it('ámbar #d99a3d presente en ambas superficies', () => {
    expect(hasHex(MKT_CSS, '#d99a3d')).toBe(true);
    expect(hasHex(POS_CSS, '#d99a3d')).toBe(true);
  });
});
