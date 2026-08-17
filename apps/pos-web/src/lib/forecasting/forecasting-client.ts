/** Sprint 46 — analítica predictiva (ADR-0030). Cliente de /api/forecasting/. */
import { applyApiAuthHeaders } from '../auth/api-client.js';
export interface ForecastItem {
  readonly product_id: string;
  readonly forecast_date: string;
  readonly predicted_qty: number;
  readonly predicted_gross_cents: number;
  readonly confidence_low_qty: number | null;
  readonly confidence_high_qty: number | null;
  readonly model_version: string;
}

export interface StockAlertItem {
  readonly product_id: string;
  readonly status: string;
  readonly daysCovered: number | null;
  readonly suggestedReorderQty: number | null;
  readonly targetDays: number;
}

export interface ForecastListResponse {
  readonly items: readonly ForecastItem[];
  readonly disclaimer: string;
}

export interface StockAlertsResponse {
  readonly items: readonly StockAlertItem[];
  readonly disclaimer: string;
}

export interface ForecastRefreshResponse {
  readonly written: number;
  readonly insufficient: number;
  readonly disclaimer: string;
}

type FetchPort = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface ForecastingClientDependencies {
  readonly fetcher?: FetchPort;
  readonly apiBase?: string;
  readonly authorization?: string;
}

function forecastingError(code: string): Error {
  const error = new Error(code);
  error.name = 'ForecastingClientError';
  return error;
}

import { resolveApiBase } from '../auth/api-client.js';

async function jsonResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { readonly code?: string };
  if (!response.ok) throw forecastingError(body.code ?? `FORECASTING_HTTP_${response.status}`);
  return body;
}

function apiBaseUrl(raw: string | undefined): string {
  // Sin apiBase explícito: la base unificada del POS (PUBLIC_API_BASE/runtime).
  const explicit = (raw ?? '').replace(/\/$/, '');
  return explicit || resolveApiBase();
}

export function createForecastingClient(dependencies: ForecastingClientDependencies) {
  const fetcher = dependencies.fetcher ?? fetch;
  const base = apiBaseUrl(dependencies.apiBase);
  const headers = (): HeadersInit => {
    const h = new Headers({ 'content-type': 'application/json' });
    if (dependencies.authorization) h.set('authorization', dependencies.authorization);
    applyApiAuthHeaders(h);
    return h;
  };

  return {
    async list(branchId: string): Promise<ForecastListResponse> {
      return jsonResponse(
        await fetcher(`${base}/api/forecasting/${encodeURIComponent(branchId)}`, {
          method: 'GET',
          headers: headers(),
        }),
      );
    },
    async alerts(
      branchId: string,
      query: { readonly leadTimeDays: number; readonly safetyStockDays: number },
    ): Promise<StockAlertsResponse> {
      const url = new URL(`${base}/api/forecasting/alerts/${encodeURIComponent(branchId)}`);
      url.searchParams.set('leadTimeDays', String(query.leadTimeDays));
      url.searchParams.set('safetyStockDays', String(query.safetyStockDays));
      return jsonResponse(
        await fetcher(url, {
          method: 'GET',
          headers: headers(),
        }),
      );
    },
    async refresh(branchId: string): Promise<ForecastRefreshResponse> {
      return jsonResponse(
        await fetcher(`${base}/api/forecasting/refresh/${encodeURIComponent(branchId)}`, {
          method: 'POST',
          headers: headers(),
        }),
      );
    },
  };
}
