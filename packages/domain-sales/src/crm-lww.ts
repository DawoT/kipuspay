/**
 * CRM LWW — SYN-08: Last-Write-Wins por profile_updated_at (reloj servidor).
 * Puro: sin D1. El adaptador aplica el plan (INSERT/UPDATE, nunca UPSERT INTO).
 */

export const PROFILE_SKEW_MS = 6 * 3600 * 1000;

export interface CrmProfileInput {
  readonly clientDocumentType: string;
  readonly clientDocumentNumber: string;
  readonly clientName: string;
  readonly clientEmail?: string | undefined;
  readonly clientPhone?: string | undefined;
  readonly clientAddress?: string | undefined;
  readonly clientProfileUpdatedAt?: string | undefined;
}

export interface ExistingCustomer {
  readonly id: string;
  readonly profileUpdatedAtIso: string;
  readonly piiErased: boolean;
  readonly deleted: boolean;
}

export type CrmLwwPlan =
  | { readonly kind: 'SKIP_ANONYMOUS' }
  | { readonly kind: 'BLOCK_ERASED' }
  | {
      readonly kind: 'INSERT';
      readonly customerId: string;
      readonly profileUpdatedAtIso: string;
    }
  | {
      readonly kind: 'UPDATE';
      readonly customerId: string;
      readonly profileUpdatedAtIso: string;
    }
  | {
      readonly kind: 'KEEP';
      readonly customerId: string;
    };

/** Ajusta timestamp de dispositivo a ventana ±6h del servidor. */
export function adjustProfileTimestampMs(deviceTsMs: number, serverNowMs: number): number {
  if (!Number.isFinite(deviceTsMs)) throw new Error('INVALID_PROFILE_TIMESTAMP');
  return Math.min(
    Math.max(deviceTsMs, serverNowMs - PROFILE_SKEW_MS),
    serverNowMs + PROFILE_SKEW_MS,
  );
}

export function isAnonymousDocument(documentNumber: string): boolean {
  return !documentNumber.trim() || documentNumber === '00000000';
}

/**
 * Decide INSERT / UPDATE / KEEP / BLOCK sin UPSERT INTO.
 * `newCustomerId` solo se usa si kind=INSERT.
 */
export function planCrmLww(
  input: CrmProfileInput,
  existing: ExistingCustomer | null,
  serverNowMs: number,
  newCustomerId: string,
): CrmLwwPlan {
  if (isAnonymousDocument(input.clientDocumentNumber)) {
    return { kind: 'SKIP_ANONYMOUS' };
  }
  if (existing?.piiErased || existing?.deleted) {
    return { kind: 'BLOCK_ERASED' };
  }

  const rawTs = input.clientProfileUpdatedAt
    ? Date.parse(input.clientProfileUpdatedAt)
    : serverNowMs;
  const adjusted = adjustProfileTimestampMs(rawTs, serverNowMs);
  const profileUpdatedAtIso = new Date(adjusted).toISOString();

  if (!existing) {
    return { kind: 'INSERT', customerId: newCustomerId, profileUpdatedAtIso };
  }

  const existingMs = Date.parse(existing.profileUpdatedAtIso);
  if (!Number.isFinite(existingMs) || existingMs <= adjusted) {
    return {
      kind: 'UPDATE',
      customerId: existing.id,
      profileUpdatedAtIso,
    };
  }
  return { kind: 'KEEP', customerId: existing.id };
}

/** SYN-11 cliente: último perfil del mismo localClientId gana antes de chunking. */
export function consolidateLocalClientProfiles<
  T extends {
    readonly localClientId?: string | undefined;
    readonly clientProfileUpdatedAt?: string | undefined;
  },
>(sales: readonly T[]): T[] {
  const lastByLocal = new Map<string, T>();
  for (const sale of sales) {
    const lid = sale.localClientId?.trim();
    if (!lid) continue;
    const prev = lastByLocal.get(lid);
    if (!prev) {
      lastByLocal.set(lid, sale);
      continue;
    }
    const prevTs = Date.parse(prev.clientProfileUpdatedAt ?? '') || 0;
    const nextTs = Date.parse(sale.clientProfileUpdatedAt ?? '') || 0;
    if (nextTs >= prevTs) lastByLocal.set(lid, sale);
  }
  return sales.map((sale) => {
    const lid = sale.localClientId?.trim();
    if (!lid) return sale;
    const winner = lastByLocal.get(lid);
    if (!winner || winner === sale) return sale;
    // Apply winner profile fields onto this sale's snapshot for CRM write consistency
    return { ...sale, ...pickProfile(winner) };
  });
}

function pickProfile<T extends Record<string, unknown>>(sale: T): Partial<T> {
  const keys = [
    'clientName',
    'clientEmail',
    'clientPhone',
    'clientAddress',
    'clientProfileUpdatedAt',
    'clientDocumentType',
    'clientDocumentNumber',
  ] as const;
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in sale) out[k] = sale[k];
  }
  return out as Partial<T>;
}
