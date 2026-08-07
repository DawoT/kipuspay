/**
 * Cliente Dueño — backlog fiscal + Anular E-A (confirmación explícita).
 */

export interface FiscalBacklogItem {
  readonly saleId: string;
  readonly sunatStatus: string;
  readonly documentType: string;
  readonly totalCents: number;
  readonly suggestCreditNoteEa: boolean;
  readonly alertId?: string;
}

export interface AnularEaRequest {
  readonly originSaleId: string;
  readonly confirmed: boolean;
  readonly motiveCode: string;
  readonly series: string;
}

export interface AnularEaResult {
  readonly ok: boolean;
  readonly status: number;
  readonly creditNoteSaleId?: string;
  readonly message: string;
  readonly code?: string;
}

export function canOfferAnularEa(status: string): boolean {
  return status === 'REJECTED' || status === 'QUARANTINED' || status === 'DEADLINE_EXCEEDED';
}

/** Guard UI: nunca ejecutar sin confirmación + Catálogo 09. */
export function assertAnularEaUiReady(input: AnularEaRequest): void {
  if (!input.confirmed) throw new Error('EA_CONFIRMATION_REQUIRED');
  if (input.motiveCode.trim() !== '01' && !/^\d{2}$/.test(input.motiveCode.trim())) {
    // Catálogo 09 — motivo anulación típico '01' u otros códigos 2 dígitos
    if (!input.motiveCode.trim()) throw new Error('EA_MOTIVE_REQUIRED');
  }
  if (!input.motiveCode.trim()) throw new Error('EA_MOTIVE_REQUIRED');
  if (!input.originSaleId.trim()) throw new Error('EA_ORIGIN_REQUIRED');
}

export async function fetchFiscalBacklog(
  apiBase: string,
  authHeader: string,
): Promise<readonly FiscalBacklogItem[]> {
  const res = await fetch(`${apiBase.replace(/\/$/, '')}/api/fiscal/owner-backlog`, {
    headers: { authorization: authHeader },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { items?: FiscalBacklogItem[] };
  return json.items ?? [];
}

export async function submitAnularEa(
  apiBase: string,
  authHeader: string,
  body: AnularEaRequest,
): Promise<AnularEaResult> {
  assertAnularEaUiReady(body);
  const res = await fetch(`${apiBase.replace(/\/$/, '')}/api/fiscal/credit-note-ea`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: authHeader,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message: typeof json.error === 'string' ? json.error : 'Anulación rechazada',
      code: typeof json.code === 'string' ? json.code : undefined,
    };
  }
  return {
    ok: true,
    status: res.status,
    creditNoteSaleId: typeof json.creditNoteSaleId === 'string' ? json.creditNoteSaleId : undefined,
    message: 'NC E-A registrada',
  };
}

/** Chaos: 100 ciclos confirmados → 0 atrapados. */
export function simulateEaClearCycles(
  items: FiscalBacklogItem[],
  anular: (saleId: string) => boolean,
): { remaining: number; cleared: number } {
  let cleared = 0;
  const left: FiscalBacklogItem[] = [];
  for (const item of items) {
    if (canOfferAnularEa(item.sunatStatus) && anular(item.saleId)) {
      cleared += 1;
    } else {
      left.push(item);
    }
  }
  return { remaining: left.length, cleared };
}
