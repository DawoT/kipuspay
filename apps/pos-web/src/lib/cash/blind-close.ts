/** Cliente POS — cierre Z ciego (expected solo tras confirmar conteo). */

export interface DenominationLine {
  readonly denominationCents: number;
  readonly quantity: number;
}

export interface BlindCloseRequest {
  readonly sessionId: string;
  readonly countLines: readonly DenominationLine[];
  readonly differenceReason?: string | null;
  readonly differenceThresholdCents?: number;
  /** PENDING+FAILED del print outbox local (edge 2D). */
  readonly outboxPendingCount?: number;
}

export interface BlindCloseResult {
  readonly ok: boolean;
  readonly status: number;
  readonly countedTotalCents?: number;
  readonly expectedTotalCents?: number;
  readonly differenceAmountCents?: number;
  readonly message: string;
  readonly code?: string;
  readonly pendingCount?: number;
}

export function sumLocalCount(lines: readonly DenominationLine[]): number {
  return lines.reduce((s, l) => s + l.denominationCents * l.quantity, 0);
}

/**
 * Envía conteo al API. El cajero NO recibe expected antes de este POST.
 */
export async function submitBlindClose(
  apiBase: string,
  authHeader: string,
  body: BlindCloseRequest,
): Promise<BlindCloseResult> {
  const res = await fetch(`${apiBase.replace(/\/$/, '')}/api/cash/sessions/blind-close`, {
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
      message: typeof json.error === 'string' ? json.error : 'Cierre rechazado',
      code: typeof json.code === 'string' ? json.code : undefined,
      pendingCount: typeof json.pendingCount === 'number' ? json.pendingCount : undefined,
    };
  }
  return {
    ok: true,
    status: res.status,
    countedTotalCents: Number(json.countedTotalCents),
    expectedTotalCents: Number(json.expectedTotalCents),
    differenceAmountCents: Number(json.differenceAmountCents),
    message: 'Cierre Z registrado',
  };
}

/** Denominaciones PEN habituales (cents). */
export const PEN_DENOMS: readonly number[] = [
  20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10,
];

/**
 * S17-H4: reporte Z imprimible — snapshot de ticket a partir del resultado del
 * cierre ciego. Consume el mismo PrintTicketSnapshot que el pipeline de
 * impresión (buildTicketHtml / ESC/POS); el cajero lo imprime tras confirmar.
 */
export interface ZTicketData {
  readonly enterprise: string;
  readonly ruc: string;
  readonly documentType: 'Z';
  readonly series: string;
  readonly number: number;
  readonly totalCents: number;
  readonly lineWidth: number;
  readonly items: readonly { name: string; qty: number; totalCents: number }[];
}

export function buildZTicketData(input: {
  readonly enterprise: string;
  readonly ruc: string;
  readonly sessionId: string;
  readonly zNumber: number;
  readonly countedTotalCents: number;
  readonly expectedTotalCents: number;
  readonly differenceAmountCents: number;
}): ZTicketData {
  return {
    enterprise: input.enterprise,
    ruc: input.ruc,
    documentType: 'Z',
    series: 'Z',
    number: input.zNumber,
    totalCents: input.countedTotalCents,
    lineWidth: 32,
    items: [
      { name: 'Arqueo esperado', qty: 1, totalCents: input.expectedTotalCents },
      { name: 'Arqueo contado', qty: 1, totalCents: input.countedTotalCents },
      { name: 'Diferencia', qty: 1, totalCents: input.differenceAmountCents },
      { name: `Sesión ${input.sessionId}`, qty: 1, totalCents: 0 },
    ],
  };
}
