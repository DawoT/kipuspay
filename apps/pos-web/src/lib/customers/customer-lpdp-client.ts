/**
 * Sprint 47 — LPDP (Arquitectura §5.3 regla 32a / ADR-0031).
 * Cliente del panel de clientes: listado sin PII, consentimientos por
 * propósito (GRANT/REVOKE), export (LPDP-02) y erase/anonimización (LPDP-03).
 * El tenant jamás viaja en el body: lo pone el backend desde el JWT.
 */
export interface CustomerListItemDto {
  readonly id: string;
  readonly documentTypeCode: string;
  readonly documentNumber: string;
  readonly piiErased: boolean;
}

export interface ConsentDto {
  readonly purpose: string;
  readonly granted: boolean;
  readonly grantedAtIso: string | null;
  readonly revokedAtIso: string | null;
}

export interface CustomerExportPayloadDto {
  readonly customerId: string;
  readonly profile: Record<string, unknown>;
  readonly consents: readonly ConsentDto[];
  readonly sales: readonly Record<string, unknown>[];
  readonly exportedAtIso: string;
}

export interface EraseResultDto {
  readonly customerId: string;
  readonly fiscalSnapshotsAnonymized: number;
  readonly consentsRevoked: number;
}

type FetchPort = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface LpdpClientDependencies {
  readonly authenticatedFetch: FetchPort;
  readonly apiBase?: string;
}

function lpdpError(code: string): Error {
  const error = new Error(code);
  error.name = 'LpdpClientError';
  return error;
}

async function jsonResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { readonly code?: string };
  if (!response.ok) throw lpdpError(body.code ?? `LPDP_HTTP_${response.status}`);
  return body;
}

export function createLpdpClient(dependencies: LpdpClientDependencies) {
  const base = (dependencies.apiBase ?? '').replace(/\/$/, '');

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await dependencies.authenticatedFetch(`${base}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    return jsonResponse<T>(response);
  }

  return {
    list(limit = 100, offset = 0): Promise<{ items: readonly CustomerListItemDto[] }> {
      return request(`/api/customers?limit=${limit}&offset=${offset}`);
    },

    consents(customerId: string): Promise<{ customerId: string; consents: readonly ConsentDto[] }> {
      return request(`/api/customers/${encodeURIComponent(customerId)}/consents`);
    },

    setConsent(
      customerId: string,
      purpose: string,
      granted: boolean,
    ): Promise<Record<string, unknown>> {
      return request(`/api/customers/${encodeURIComponent(customerId)}/consent`, {
        method: 'POST',
        body: JSON.stringify({ purpose, granted }),
      });
    },

    exportCustomer(customerId: string): Promise<CustomerExportPayloadDto> {
      return request(`/api/customers/${encodeURIComponent(customerId)}/export`);
    },

    erase(customerId: string): Promise<EraseResultDto> {
      return request(`/api/customers/${encodeURIComponent(customerId)}/erase`, {
        method: 'POST',
      });
    },
  };
}

export type LpdpClient = ReturnType<typeof createLpdpClient>;
