/**
 * Sprint 51 — equipo e invitaciones (Arquitectura §5.3 regla 36).
 *
 * El Owner/Admin invita cajeros y vendedores y les emite PIN de caja y/o badge
 * barcode. Todo badge generado por KipusPay usa el prefijo reservado `EMP-` +
 * identificador server-side, único por tenant y FUERA del espacio EAN-13/UPC
 * de productos (edge 1A, regla 34/36). Puro: sin D1, sin deps de red.
 */

import { VENDOR_PREFIX } from '@kipuspay/domain-catalog';

/** PIN de caja de tecleo rápido para la atribución <1 s en el carrito. */
export const CASHIER_PIN_LENGTH = 4;
/** Sufijo mínimo del badge EMP- (server-side; los dígitos del id no son el user id). */
export const BADGE_SUFFIX_LENGTH = 5;

export function isValidGeneratedBadge(badge: string): boolean {
  if (!badge.startsWith(VENDOR_PREFIX)) return false;
  const suffix = badge.slice(VENDOR_PREFIX.length);
  return suffix.length >= BADGE_SUFFIX_LENGTH && /^\d+$/.test(suffix);
}

/**
 * Genera un badge `EMP-<dígitos>` único dentro del set del tenant (las
 * colisiones se resuelven con reintentos); los badges jamás se editan a mano.
 */
export function generateBadgeBarcode(
  existingBadges: ReadonlySet<string>,
  rng: () => number = Math.random,
): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const suffix = Array.from({ length: BADGE_SUFFIX_LENGTH }, () => Math.floor(rng() * 10)).join(
      '',
    );
    const candidate = `${VENDOR_PREFIX}${suffix}`;
    if (!existingBadges.has(candidate)) return candidate;
  }
  throw new Error('BADGE_NAMESPACE_EXHAUSTED');
}

/** PIN de caja de 4 dígitos (tecleo rápido en el carrito, <1 s). */
export function generateCashierPin(rng: () => number = Math.random): string {
  const digits = Array.from({ length: CASHIER_PIN_LENGTH }, () => Math.floor(rng() * 10));
  if (digits[0] === 0) {
    // Evita PINs con 0 inicial que invitan a error de tecleo (longitud ambigua).
    digits[0] = 1 + Math.floor(rng() * 9);
  }
  return digits.join('');
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidInviteEmail(email: string): boolean {
  const value = normalizeInviteEmail(email);
  if (value.length === 0 || value.length > 254) return false;
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@')) return false;
  const [local, domain] = [value.slice(0, at), value.slice(at + 1)];
  if (local.length === 0 || domain.length < 3 || domain.includes('..')) return false;
  if (!domain.includes('.')) return false;
  return !/[^a-z0-9.!#$%&'*+/=?^_`{|}~-]/i.test(local);
}
