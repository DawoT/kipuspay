/** Resolución de ancho de línea (§10) — 58mm→32 / 80mm→48; fallback 58. */

export function resolveLineWidth(paperWidthMm: number, fallbackLineWidth?: number): number {
  if (paperWidthMm === 80) return 48;
  if (paperWidthMm === 58) return 32;
  if (fallbackLineWidth === 48) return 48;
  return 32;
}

export function maxItemNameLen(lineWidth: number): number {
  return lineWidth > 32 ? 26 : 14;
}
