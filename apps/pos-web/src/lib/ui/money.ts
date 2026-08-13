import { formatCents } from '../cents.js';

import { formatCents } from '$lib/cents';

function isDigitsOnly(value: string): boolean {
  if (value.length === 0) return false;
  for (const ch of value) {
    if (ch < '0' || ch > '9') return false;
  }
  return true;
}

export function parseSolesToCents(input: string): number | null {
  const raw = input
    .trim()
    .replace(',', '.')
    .replace(/[\s'’]/g, '');
  if (!raw) return null;
  const dot = raw.indexOf('.');
  if (dot !== -1 && raw.indexOf('.', dot + 1) !== -1) return null;
  const whole = dot === -1 ? raw : raw.slice(0, dot);
  const fraction = dot === -1 ? undefined : raw.slice(dot + 1);
  if (!isDigitsOnly(whole)) return null;
  if (fraction === undefined) return Number(whole);
  if (!isDigitsOnly(fraction) || fraction.length > 2) return null;
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));

  // G2 (auditoría staff): tope de 9 dígitos enteros — 999.999.999.99 soles
  // excede los 2^31-1 cents seguros; parse manual sin float intermedio.
  if (whole.length > 9) return null;
  if (fraction === undefined) return parseInt(whole, 10);
  if (!isDigitsOnly(fraction) || fraction.length > 2) return null;
  const fractionCents = parseInt(fraction.padEnd(2, '0'), 10);
  return parseInt(whole, 10) * 100 + fractionCents;
}

export function formatMoney(cents: number): string {
  return `S/ ${formatCents(cents)}`;
}
