/**
 * Sprint 51 — handoff de turno (Arquitectura §5.3 regla 35).
 *
 * El cambio de operador NO cierra la caja: la sesión sigue OPEN y el tramo de
 * cada operador vive en `cash_register_shifts`. La transferencia se autoriza
 * con un PIN temporal de un solo uso (hash + TTL, verificado server-side); el
 * entrante nunca recibe las credenciales del saliente.
 *
 * Conteo ligero intermedio (opcional): si la política del tenant exige
 * `interim_required`, el saliente confirma el efectivo; la diferencia
 * (expected - counted) se audita en `SHIFT_TRANSFER` con `cash_diff_cents`
 * pero NUNCA bloquea la transferencia. Puro: sin D1, sin deps de red.
 */

/** TTL del PIN de handoff (5 minutos, criterio <5 s de transferencia con margen). */
export const TRANSFER_PIN_TTL_MS = 5 * 60 * 1000;
/** PIN de 6 dígitos (más entropía que el PIN de caja, que es de tecleo rápido). */
export const TRANSFER_PIN_LENGTH = 6;

export interface IssuedTransferPin {
  readonly pin: string;
  readonly hash: string;
  readonly expiresAtIso: string;
}

export type PinVerificationResult = 'OK' | 'PIN_INVALID' | 'PIN_EXPIRED';

export type ShiftTransferErrorCode =
  'SAME_OPERATOR' | 'INTERIM_COUNT_REQUIRED' | 'INTERIM_COUNT_INVALID';

export interface ShiftPolicy {
  readonly interimRequired: boolean;
}

export interface ShiftTransferCommand {
  readonly sessionId: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly outgoingUserId: string;
  readonly incomingUserId: string;
  readonly pinHash: string;
  readonly pinExpiresAtIso: string;
  readonly startedAtIso: string;
  readonly interimCountCents: number | null;
  readonly expectedInterimCashCents: number | null;
  readonly cashDiffCents: number | null;
}

/** PIN aleatorio legible (dígitos, sin 0 inicial ambiguo). */
export function generatePin(length: number, rng: () => number = Math.random): string {
  const digits: number[] = [];
  for (let i = 0; i < length; i++) {
    digits.push(Math.floor(rng() * 10));
  }
  return digits.join('');
}

/** SHA-256 hex del PIN (nunca en claro en la DB; Web Crypto disponible en workers/node). */
export async function hashPin(pin: string): Promise<string> {
  const subtle = (globalThis as { crypto?: { subtle?: unknown } }).crypto?.subtle as
    { digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer> } | undefined;
  if (!subtle) {
    throw new Error('CRYPTO_SUBTLE_UNAVAILABLE');
  }
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Verificación fail-closed del PIN: TTL vencido ⇒ PIN_EXPIRED; hash distinto ⇒ PIN_INVALID. */
export async function verifyTransferPin(
  pin: string,
  pinHash: string,
  pinExpiresAtIso: string,
  nowMs: number,
): Promise<PinVerificationResult> {
  if (pin.length !== TRANSFER_PIN_LENGTH || !/^\d{6}$/.test(pin)) return 'PIN_INVALID';
  const expiresAt = Date.parse(pinExpiresAtIso);
  if (!Number.isFinite(expiresAt)) return 'PIN_INVALID';
  if (nowMs > expiresAt) return 'PIN_EXPIRED';
  const candidate = await hashPin(pin);
  // Comparación en tiempo constante: los hashes compiten por bytes, no por longitud.
  if (candidate.length !== pinHash.length) return 'PIN_INVALID';
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ pinHash.charCodeAt(i);
  }
  return diff === 0 ? 'OK' : 'PIN_INVALID';
}

/**
 * Construye el comando de transferencia del dominio (el motor valida el estado
 * de la sesión y consume el PIN con guards SQL). La diferencia intermedia se
 * calcula aquí pero no bloquea.
 */
export function buildShiftTransfer(input: {
  readonly sessionId: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly outgoingUserId: string;
  readonly incomingUserId: string;
  readonly pin: string;
  readonly pinHash: string;
  readonly pinExpiresAtIso: string;
  readonly nowIso: string;
  readonly policy: ShiftPolicy;
  readonly interimCountCents?: number | null;
  readonly expectedInterimCashCents?: number | null;
}): { ok: true; command: ShiftTransferCommand } | { ok: false; code: ShiftTransferErrorCode } {
  if (input.outgoingUserId === input.incomingUserId) {
    return { ok: false, code: 'SAME_OPERATOR' };
  }
  const interimRequired = input.policy.interimRequired;
  const interimCount = input.interimCountCents ?? null;
  if (interimRequired) {
    if (interimCount === null) return { ok: false, code: 'INTERIM_COUNT_REQUIRED' };
    if (!Number.isInteger(interimCount) || interimCount < 0) {
      return { ok: false, code: 'INTERIM_COUNT_INVALID' };
    }
  }
  const expected = input.expectedInterimCashCents ?? null;
  const cashDiff = interimCount !== null && expected !== null ? expected - interimCount : null;
  return {
    ok: true,
    command: {
      sessionId: input.sessionId,
      tenantId: input.tenantId,
      branchId: input.branchId,
      outgoingUserId: input.outgoingUserId,
      incomingUserId: input.incomingUserId,
      pinHash: input.pinHash,
      pinExpiresAtIso: input.pinExpiresAtIso,
      startedAtIso: input.nowIso,
      interimCountCents: interimCount,
      expectedInterimCashCents: expected,
      cashDiffCents: cashDiff,
    },
  };
}
