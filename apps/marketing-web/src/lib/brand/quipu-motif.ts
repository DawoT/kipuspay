/**
 * Utilidades puras del cordel narrativo (fuera del hero).
 * Sin DOM: verificable por test y seguro en SSR.
 */

import { CORD_COLORS, CORD_DEFAULT, PRIMARY_CORD } from './quipu-colors.js';

export type MotifKind = 'loom' | 'tension' | 'reconnect' | 'network' | 'seal';

export const MOTIF_KINDS: readonly MotifKind[] = [
  'loom',
  'tension',
  'reconnect',
  'network',
  'seal',
];

/** El cordel primario del telar coincide con la paleta de marca. */
export const FIBER_PRIMARY = PRIMARY_CORD;

export { CORD_COLORS };

/**
 * Valor tejido de cada cordel de rubro: la cantidad y altura de los nudos del
 * telar codifica estas cifras por posicion. Es geometria de marca, no una
 * metrica de negocio: los numeros son estables por slug y documentados aqui
 * para que el dibujo sea verificable por test.
 */
export const CORD_VALUES: Readonly<Record<string, number>> = {
  restaurantes: 231,
  farmacias: 123,
  retail: 312,
  servicios: 213,
  cadenas: 132,
};

/** Valor tejido de un slug (0 si no es un rubro conocido). */
export function cordValue(slug: string): number {
  return CORD_VALUES[slug] ?? 0;
}

/** Color de fibra de un slug (con fallback neutral). */
export function cordColor(slug: string): string {
  return CORD_COLORS[slug] ?? CORD_DEFAULT;
}

/** Ids SVG estables a partir de un prefijo (evita Math.random en SSR). */
export function motifIds(prefix: string): { readonly gap: string } {
  const safe = prefix.replace(/[^a-zA-Z0-9_-]/g, '') || 'motif';
  return { gap: `${safe}-gap` };
}

/** Escala de cordeles/ramas permitida por motivo. */
export function clampCordCount(count: number): number {
  return Math.max(1, Math.min(7, Math.trunc(count)));
}

/** Posicion X de un cordel en un telar de ancho `span` con `n` colgantes. */
export function loomX(index: number, n: number, origin = 28, span = 264): number {
  if (n <= 1) return origin;
  return origin + index * (span / (n - 1));
}
