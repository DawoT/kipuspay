/**
 * Historial del día del cajero (F3, GTM §3.3) — solo lectura; el servidor
 * calcula los totales en cents con hora Lima (issued_at_lima).
 */

export interface DaySaleItem {
  readonly id: string;
  readonly series: string;
  readonly number: number;
  readonly documentType: string;
  readonly totalCents: number;
  readonly issuedAtLima: string;
  readonly clientName: string;
  readonly voidStatus: string;
}

export type DaySalesResult =
  | {
      ok: true;
      items: DaySaleItem[];
      countToday: number;
      totalTodayCents: number;
      scopeBranch: string | null;
    }
  | { ok: false; code: string; message: string };

export async function fetchDaySales(input: {
  readonly fetcher?: typeof fetch;
  readonly apiBase: string;
  readonly authorization: string;
  readonly tenantId?: string;
}): Promise<DaySalesResult> {
  const doFetch = input.fetcher ?? fetch;
  const headers: Record<string, string> = { authorization: input.authorization };
  if (input.tenantId) headers['x-tenant-id'] = input.tenantId;
  try {
    const res = await doFetch(`${input.apiBase.replace(/\/$/, '')}/api/pos/day-sales`, {
      method: 'GET',
      headers,
    });
    const data = (await res.json()) as {
      items?: DaySaleItem[];
      countToday?: number;
      totalTodayCents?: number;
      scopeBranch?: string | null;
      code?: string;
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        code: data.code ?? 'REJECTED',
        message: data.error ?? data.code ?? 'Solicitud rechazada.',
      };
    }
    return {
      ok: true,
      items: data.items ?? [],
      countToday: data.countToday ?? 0,
      totalTodayCents: data.totalTodayCents ?? 0,
      scopeBranch: data.scopeBranch ?? null,
    };
  } catch {
    return { ok: false, code: 'OFFLINE', message: 'Sin conexión con el servidor.' };
  }
}
