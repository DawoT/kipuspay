/**
 * LPDP-01 — Consentimiento explícito por propósito (Arquitectura §5.3 regla 32a).
 * Puro: sin D1. El adaptador persiste el plan (INSERT/UPDATE, nunca UPSERT INTO).
 */

export const CONSENT_PURPOSES = ['messaging_whatsapp', 'marketing'] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const UNKNOWN_CONSENT_PURPOSE = 'UNKNOWN_CONSENT_PURPOSE';

export interface ConsentRecord {
  readonly purpose: string;
  readonly granted: boolean;
  readonly grantedAtIso: string | null;
  readonly revokedAtIso: string | null;
}

export type ConsentChangePlan =
  | { readonly kind: 'GRANT'; readonly grantedAtIso: string }
  | { readonly kind: 'REVOKE'; readonly revokedAtIso: string }
  | { readonly kind: 'NOOP' };

/** Valida que el propósito pertenezca al catálogo canónico. */
export function isConsentPurpose(value: string): value is ConsentPurpose {
  return (CONSENT_PURPOSES as readonly string[]).includes(value);
}

/** Lanza UNKNOWN_CONSENT_PURPOSE si el propósito no está en el catálogo. */
export function assertConsentPurpose(value: string): asserts value is ConsentPurpose {
  if (!isConsentPurpose(value)) throw new Error(UNKNOWN_CONSENT_PURPOSE);
}

/**
 * Decide el cambio de consentimiento (LPDP-01): GRANT sella granted_at, REVOKE
 * sella revoked_at. NOOP cuando ya está en el estado pedido. Idempotente.
 */
export function planConsentChange(
  purpose: string,
  granted: boolean,
  nowIso: string,
  current?: ConsentRecord,
): ConsentChangePlan {
  assertConsentPurpose(purpose);
  if (granted) {
    if (current && current.granted && current.revokedAtIso === null) return { kind: 'NOOP' };
    return { kind: 'GRANT', grantedAtIso: nowIso };
  }
  if (current && !current.granted && current.revokedAtIso !== null) return { kind: 'NOOP' };
  return { kind: 'REVOKE', revokedAtIso: nowIso };
}

/**
 * Un consentimiento está vigente solo si granted=1 y no hay revocación posterior
 * a la fecha de consulta. 0 PII usada para un propósito sin consentimiento vigente.
 */
export function isConsentActive(consent: ConsentRecord, asOfIso: string): boolean {
  if (!consent.granted) return false;
  if (consent.revokedAtIso === null) return true;
  return consent.revokedAtIso > asOfIso;
}
