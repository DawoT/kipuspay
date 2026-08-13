/**
 * Ancho de papel 58/80 mm — autodetección (Sprint 53).
 * Regla: preferencia guardada > probe del dispositivo > null.
 * Fuera de {58, 80} nunca se acepta (fail-closed).
 */

export const PAPER_WIDTHS = [58, 80] as const;
export type PaperWidth = (typeof PAPER_WIDTHS)[number];

export function resolvePaperWidth(input: {
  readonly preferred: PaperWidth | null | undefined;
  readonly probed: PaperWidth | null;
}): PaperWidth | null {
  if (input.preferred === 58 || input.preferred === 80) return input.preferred;
  if (input.probed === 58 || input.probed === 80) return input.probed;
  return null;
}

export function paperWidthLabel(mm: PaperWidth): string {
  return `${mm} mm`;
}
