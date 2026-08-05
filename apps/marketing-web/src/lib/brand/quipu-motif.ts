/**
 * Sistema editorial: fibra oscura + un nudo.
 * Motivos mid-page reducidos; el markup de seccion vive en QuipuSectionMark.
 */

import { CORD_COLORS, CORD_DEFAULT, PRIMARY_CORD } from './quipu-colors.js';

/** Unico motivo ilustrado permitido mid-page (gesto offline). */
export type MotifKind = 'reconnect';

export const MOTIF_KINDS: readonly MotifKind[] = ['reconnect'];

/** Estados del margen de seccion (hairline + un nudo). */
export type SectionMarkState = 'entry' | 'synced' | 'reconciled';

export const SECTION_MARK_STATES: readonly SectionMarkState[] = ['entry', 'synced', 'reconciled'];

export const FIBER_PRIMARY = PRIMARY_CORD;

export { CORD_COLORS };

export const CORD_VALUES: Readonly<Record<string, number>> = {
  restaurantes: 231,
  farmacias: 123,
  retail: 312,
  servicios: 213,
  cadenas: 132,
};

export function cordValue(slug: string): number {
  return CORD_VALUES[slug] ?? 0;
}

export function cordColor(slug: string): string {
  return CORD_COLORS[slug] ?? CORD_DEFAULT;
}

export function motifIds(prefix: string): { readonly gap: string } {
  const safe = prefix.replace(/[^a-zA-Z0-9_-]/g, '') || 'motif';
  return { gap: `${safe}-gap` };
}

/** Rango Y del nudo en el viewBox 24x120 (hairline). */
export const MARK_KNOT_Y_MIN = 28;
export const MARK_KNOT_Y_MAX = 92;

/** Posicion Y del nudo unico segun estado (fallback SSR / reduced-motion). */
export function markKnotY(state: SectionMarkState): number {
  if (state === 'synced') return 64;
  if (state === 'reconciled') return MARK_KNOT_Y_MAX;
  return MARK_KNOT_Y_MIN;
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/**
 * Progreso 0..1 de una seccion en el viewport.
 * 0 = seccion acaba de entrar por abajo; 1 = seccion acaba de salir por arriba.
 */
export function sectionScrollProgress(
  rect: { top: number; height: number },
  viewportH: number,
): number {
  const travel = viewportH + Math.max(rect.height, 1);
  return clamp01((viewportH - rect.top) / travel);
}

/** Y del nudo segun progreso de scroll (viewBox 24x120). */
export function markKnotYFromProgress(progress: number): number {
  const p = clamp01(progress);
  return MARK_KNOT_Y_MIN + (MARK_KNOT_Y_MAX - MARK_KNOT_Y_MIN) * p;
}
