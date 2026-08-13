/**
 * Sprint 17 — movimientos de caja y reimpresión COPIA (ADR-0012).
 * El umbral de autorización lo impone el servidor (S17-H1); sobre el umbral
 * la UI pide el PIN del supervisor, minta un token de 90s (S17-H2) y reenvía
 * el movimiento con authorizationTokenHash.
 */

export type CashMovementType =
  | 'DEPOSIT_VALUES'
  | 'CHANGE_FUND_IN'
  | 'CHANGE_FUND_OUT'
  | 'SUPPLIER_PAYMENT'
  | 'ADJUSTMENT'
  | 'SALE_REFUND'
  | 'LAYAWAY_DEPOSIT'
  | 'LAYAWAY_REFUND';

export interface MovementInput {
  readonly fetcher?: typeof fetch;
  readonly apiBase: string;
  readonly authorization: string;
  readonly branchId: string;
  readonly sessionId: string;
  readonly movementType: CashMovementType;
  readonly amountCents: number;
  readonly counterpartyRef?: string | null;
  readonly reason?: string | null;
  readonly authorizationTokenHash?: string;
}

export type MovementResult =
  | { ok: true; id: string; movementType: CashMovementType; amountCents: number }
  | { ok: false; code: string; message: string };

async function post(
  path: string,
  body: Record<string, unknown>,
  input: { fetcher?: typeof fetch; apiBase: string; authorization: string },
): Promise<Response> {
  const doFetch = input.fetcher ?? fetch;
  return doFetch(`${input.apiBase.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: input.authorization },
    body: JSON.stringify(body),
  });
}

export async function createCashMovement(input: MovementInput): Promise<MovementResult> {
  try {
    const res = await post(
      '/api/cash/movements',
      {
        branchId: input.branchId,
        sessionId: input.sessionId,
        movementType: input.movementType,
        amountCents: input.amountCents,
        counterpartyRef: input.counterpartyRef ?? null,
        reason: input.reason ?? null,
        ...(input.authorizationTokenHash
          ? { authorizationTokenHash: input.authorizationTokenHash }
          : {}),
      },
      input,
    );
    const data = (await res.json()) as {
      code?: string;
      error?: string;
      id?: string;
      movementType?: CashMovementType;
      amountCents?: number;
    };
    if (!res.ok) {
      return { ok: false, code: data.code ?? 'REJECTED', message: data.error ?? data.code ?? 'Movimiento rechazado.' };
    }
    return {
      ok: true,
      id: String(data.id ?? ''),
      movementType: data.movementType ?? input.movementType,
      amountCents: Number(data.amountCents ?? input.amountCents),
    };
  } catch {
    return { ok: false, code: 'OFFLINE', message: 'Sin conexión con el servidor.' };
  }
}

export async function mintCashAuthzToken(input: {
  fetcher?: typeof fetch;
  apiBase: string;
  authorization: string;
  pin: string;
}): Promise<
  { ok: true; tokenHash: string; ttlSeconds: number } | { ok: false; code: string; message: string }
> {
  try {
    const res = await post(
      '/api/cash/authz-token',
      { pin: input.pin, scope: 'CASH_MOVEMENT' },
      input,
    );
    const data = (await res.json()) as {
      code?: string;
      error?: string;
      tokenHash?: string;
      ttlSeconds?: number;
    };
    if (!res.ok) {
      return { ok: false, code: data.code ?? 'REJECTED', message: data.error ?? data.code ?? 'Autorización rechazada.' };
    }
    return {
      ok: true,
      tokenHash: String(data.tokenHash ?? ''),
      ttlSeconds: Number(data.ttlSeconds ?? 0),
    };
  } catch {
    return { ok: false, code: 'OFFLINE', message: 'Sin conexión con el servidor.' };
  }
}

export async function reprintSale(input: {
  fetcher?: typeof fetch;
  apiBase: string;
  authorization: string;
  saleId: string;
  branchId: string;
  reason?: string | null;
}): Promise<{ ok: true; watermarkLabel: string; reprintId: string } | { ok: false; code: string; message: string }> {
  try {
    const res = await post(
      '/api/cash/reprints',
      { saleId: input.saleId, branchId: input.branchId, reason: input.reason ?? null },
      input,
    );
    const data = (await res.json()) as {
      code?: string;
      error?: string;
      id?: string;
      watermarkLabel?: string;
    };
    if (!res.ok) {
      return { ok: false, code: data.code ?? 'REJECTED', message: data.error ?? data.code ?? 'Reimpresión rechazada.' };
    }
    return {
      ok: true,
      watermarkLabel: String(data.watermarkLabel ?? 'COPIA'),
      reprintId: String(data.id ?? ''),
    };
  } catch {
    return { ok: false, code: 'OFFLINE', message: 'Sin conexión con el servidor.' };
  }
}
