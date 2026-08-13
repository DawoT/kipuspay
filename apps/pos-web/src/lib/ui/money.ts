import { formatCents } from '../cents.js';

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
}

export function formatMoney(cents: number): string {
  return `S/ ${formatCents(cents)}`;
}
