/** Cliente HTTP devoluciones — Sprint 28. */

export interface ReturnLineInput {
  readonly originalSaleItemId: string;
  readonly qty: number;
}

export interface CreateReturnResult {
  readonly ok: boolean;
  readonly status: number;
  readonly code?: string;
  readonly message?: string;
  readonly returnId?: string;
  readonly documentSaleId?: string;
  readonly docType?: string;
  readonly refundAmountCents?: number;
}

export async function submitSalesReturn(
  apiBase: string,
  authHeader: string,
  body: {
    originSaleId: string;
    series: string;
    reason: string;
    lines: readonly ReturnLineInput[];
    cashRegisterSessionId?: string | null;
    authorizedByUserId?: string | null;
  },
): Promise<CreateReturnResult> {
  const res = await fetch(`${apiBase.replace(/\/$/, '')}/api/sales/returns`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: authHeader,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      code: typeof json.code === 'string' ? json.code : undefined,
      message: typeof json.error === 'string' ? json.error : 'Error al registrar devolución',
    };
  }
  return {
    ok: true,
    status: res.status,
    returnId: typeof json.returnId === 'string' ? json.returnId : undefined,
    documentSaleId: typeof json.documentSaleId === 'string' ? json.documentSaleId : undefined,
    docType: typeof json.docType === 'string' ? json.docType : undefined,
    refundAmountCents:
      typeof json.refundAmountCents === 'number' ? json.refundAmountCents : undefined,
  };
}
