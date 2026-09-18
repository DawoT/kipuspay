import { apiFetch } from '../auth/api-client.js';

export interface FuelCatalogSnapshot {
  readonly code: string;
  readonly name?: string;
  readonly priceCentsPerGallon: number;
  readonly igvRateBps: number;
  readonly detractionRateBps?: number;
}

export interface FuelDispatchRequest {
  readonly dispatchId: string;
  readonly idempotencyKey: string;
  readonly fuelCode: string;
  readonly volumeMicrounits: number;
  readonly businessInvoice: boolean;
  readonly documentType: string;
  readonly islandId: string;
  readonly nozzleId: string;
  readonly paymentMethod: string;
  readonly branchId?: string;
  readonly cashRegisterSessionId?: string;
  readonly series?: string;
  readonly clientDocumentType?: string;
  readonly clientDocumentNumber?: string;
  readonly clientName?: string;
  readonly plate?: string;
  readonly fleetId?: string;
  readonly meterReadingMicrounits?: number;
}

export interface FuelDispatchServerResult {
  readonly dispatchId: string;
  readonly totalCents: number;
  readonly detractionCents?: number;
  readonly replayed?: boolean;
}

export interface FuelIslandShiftReport {
  readonly islandId: string;
  readonly dispatchCount: number;
  readonly volumeMicrounits: number;
  readonly totalCents: number;
  readonly byPayment: Readonly<Record<string, number>>;
}

interface FuelCatalogResponse {
  readonly items?: readonly FuelCatalogSnapshot[];
}

interface FuelIslandShiftReportResponse {
  readonly reports?: readonly FuelIslandShiftReport[];
  readonly cashRegisterSessionIds?: readonly string[];
}

interface FuelClientOptions {
  readonly apiBase?: string;
  readonly storage?: Pick<Storage, 'getItem'> | null;
  readonly fetcher?: typeof fetch;
}

async function jsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`FUEL_API_${response.status}`);
  return (await response.json()) as T;
}

export async function fetchFuelCatalog(
  options: FuelClientOptions = {},
): Promise<readonly FuelCatalogSnapshot[]> {
  const response = await apiFetch('/api/fuel/catalog', options);
  const payload = await jsonOrThrow<FuelCatalogResponse>(response);
  return payload.items ?? [];
}

export async function createFuelDispatch(
  request: FuelDispatchRequest,
  options: FuelClientOptions = {},
): Promise<FuelDispatchServerResult> {
  const response = await apiFetch('/api/fuel/dispatches', {
    ...options,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  return jsonOrThrow<FuelDispatchServerResult>(response);
}

export async function fetchFuelIslandShiftReport(
  islandId = '',
  options: FuelClientOptions = {},
  cashRegisterSessionId = '',
): Promise<{
  readonly reports: readonly FuelIslandShiftReport[];
  readonly cashRegisterSessionIds: readonly string[];
}> {
  const params = new URLSearchParams();
  if (islandId.trim()) params.set('islandId', islandId.trim());
  if (cashRegisterSessionId.trim())
    params.set('cashRegisterSessionId', cashRegisterSessionId.trim());
  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await apiFetch(`/api/fuel/island-shift-report${query}`, options);
  const payload = await jsonOrThrow<FuelIslandShiftReportResponse>(response);
  return {
    reports: payload.reports ?? [],
    cashRegisterSessionIds: payload.cashRegisterSessionIds ?? [],
  };
}
