/**
 * Casos de éxito — GTM §7.3 / GTM-12.
 * Solo `permissionGranted: true` puede mostrarse como testimonio vivo.
 * Campo `rubro` (content slug) — no fork UI por vertical (ADR-ARCH-002 / V-07).
 */

import type { VerticalSlug } from './types.js';

export interface SuccessCase {
  readonly id: string;
  readonly rubro: VerticalSlug;
  readonly businessName: string;
  readonly quote: string;
  readonly permissionGranted: boolean;
  readonly published: boolean;
}

/** Soft-launch: sin permisos reales → lista publicable vacía (empty state honesto). */
export const SUCCESS_CASES: readonly SuccessCase[] = [];

export function publishedCases(cases: readonly SuccessCase[] = SUCCESS_CASES): SuccessCase[] {
  return cases.filter((c) => c.permissionGranted && c.published);
}

export function casesForRubro(
  rubro: VerticalSlug,
  cases: readonly SuccessCase[] = SUCCESS_CASES,
): SuccessCase[] {
  return publishedCases(cases).filter((c) => c.rubro === rubro);
}
