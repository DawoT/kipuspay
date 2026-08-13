/**
 * Sprint 22 — sondeo del estado de captura de un pago electrónico (S22-H1).
 * La caja nunca da por confirmado un pago sin la captura; el poll es cortés
 * (intervalo configurable) y se rinde con el último estado conocido.
 */

export type CaptureStatus = 'PENDING' | 'CAPTURED' | 'FAILED';

export interface CaptureStatusDto {
  readonly id: string;
  readonly status: CaptureStatus;
  readonly acquirer: string | null;
  readonly acquirerRef: string | null;
  readonly amountCents: number;
  readonly saleId: string | null;
}

const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['CAPTURED', 'FAILED', 'VOIDED']);

type PollResponse =
  | { ok: true; status: CaptureStatus; dto: CaptureStatusDto | null; terminal: boolean }
  | { ok: false; code: string; message: string };

function parseCaptureDto(
  data: {
    id?: string;
    status?: string;
    acquirer?: string | null;
    acquirer_ref?: string | null;
    amount_cents?: number;
    sale_id?: string | null;
  } | null,
  captureId: string,
): { status: CaptureStatus; dto: CaptureStatusDto; terminal: boolean } {
  const rawStatus = data?.status ?? 'PENDING';
  const status: CaptureStatus =
    rawStatus === 'CAPTURED' || rawStatus === 'FAILED' ? rawStatus : 'PENDING';

  // G1 (auditoría staff): el monto viene de D1 como INTEGER cents. Nunca
  // confiar en un valor float/NaN — dinerero fail-closed (invariante 1).
  const rawAmount = data?.amount_cents;
  const amountCents = Number.isSafeInteger(rawAmount) ? (rawAmount as number) : 0;
  const dto: CaptureStatusDto = {
    id: String(data?.id ?? captureId),
    status,
    acquirer: data?.acquirer ?? null,
    acquirerRef: data?.acquirer_ref ?? null,
    amountCents,
    saleId: data?.sale_id ?? null,
  };

  return { status, dto, terminal: TERMINAL_STATUSES.has(status) };
}

async function fetchCaptureAttempt(
  doFetch: typeof fetch,
  apiBase: string,
  authorization: string,
  captureId: string,
): Promise<PollResponse> {
  let res: Response;
  try {
    const url = `${apiBase.replace(/\/$/, '')}/api/payments/captures/${encodeURIComponent(captureId)}`;
    res = await doFetch(url, { method: 'GET', headers: { authorization } });
  } catch {
    return { ok: false, code: 'OFFLINE', message: 'Sin conexión con el servidor.' };
  }

  const data = (await res.json().catch(() => null)) as
    | {
        id?: string;
        status?: string;
        acquirer?: string | null;
        acquirer_ref?: string | null;
        amount_cents?: number;
        sale_id?: string | null;
        code?: string;
        error?: string;
      }
    | null;

  if (!res.ok) {
    return {
      ok: false,
      code: data?.code ?? 'REJECTED',
      message: data?.error ?? data?.code ?? 'Consulta rechazada.',
    };
  }

  const { status, dto, terminal } = parseCaptureDto(data, captureId);
  return { ok: true, status, dto, terminal };
}

export async function pollCaptureStatus(input: {
  readonly fetcher?: typeof fetch;
  readonly apiBase: string;
  readonly authorization: string;
  readonly captureId: string;
  readonly intervalMs?: number;
  readonly maxAttempts?: number;
}): Promise<
  | { ok: true; status: CaptureStatus; dto: CaptureStatusDto | null }
  | { ok: false; code: string; message: string }
> {
  const doFetch = input.fetcher ?? fetch;
  const intervalMs = input.intervalMs ?? 3000;
  const maxAttempts = input.maxAttempts ?? 10;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    const result = await fetchCaptureAttempt(
      doFetch,
      input.apiBase,
      input.authorization,
      input.captureId,
    );
    if (!result.ok || result.terminal) {
      return result;
    }
  }
  return { ok: true, status: 'PENDING', dto: null };
}
