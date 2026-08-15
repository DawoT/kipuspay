import type { AdminAuthenticatedSession } from './authenticated-session.js';

type FetchPort = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface SessionBootstrapDto {
  readonly userId: string;
  readonly role: 'cashier' | 'supervisor' | 'admin' | 'owner';
  readonly branchId: string;
  readonly terminal: {
    readonly terminalId: string;
    readonly terminalSessionId: string;
  } | null;
  readonly billing?: {
    readonly subscriptionStatus: 'trial' | 'active' | 'past_due' | 'canceled';
    readonly trialEndsAt: string | null;
    readonly pastGracePeriod: boolean;
  };
}

function isBillingDto(billing: unknown): boolean {
  if (billing === undefined) return true;
  if (typeof billing !== 'object' || billing === null) return false;
  return ['trial', 'active', 'past_due', 'canceled'].includes(
    String((billing as Record<string, unknown>).subscriptionStatus),
  );
}

function isTerminalDto(terminal: unknown): boolean {
  if (terminal === null) return true;
  if (typeof terminal !== 'object' || Array.isArray(terminal)) return false;
  const row = terminal as Record<string, unknown>;
  return typeof row.terminalId === 'string' && typeof row.terminalSessionId === 'string';
}

function isBootstrapDto(value: unknown): value is SessionBootstrapDto {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const session = value as Record<string, unknown>;
  if (!isBillingDto(session.billing)) return false;
  return (
    typeof session.userId === 'string' &&
    ['cashier', 'supervisor', 'admin', 'owner'].includes(String(session.role)) &&
    typeof session.branchId === 'string' &&
    isTerminalDto(session.terminal)
  );
}

function buildBootstrapHeaders(input: {
  readonly authorization?: string;
  readonly tenantId: string;
  readonly requestedTerminalId: string;
}): Headers {
  const headers = new Headers();
  if (input.authorization?.trim()) headers.set('authorization', input.authorization);
  if (input.tenantId) headers.set('x-tenant-id', input.tenantId);
  if (input.requestedTerminalId) headers.set('x-terminal-id', input.requestedTerminalId);
  return headers;
}

function absolutizeRequestUrl(apiBase: string, request: RequestInfo | URL): string {
  const raw =
    typeof request === 'string' ? request : request instanceof URL ? request.href : request.url;
  if (/^https?:\/\//i.test(raw) || /^wss?:\/\//i.test(raw)) return raw;
  return `${apiBase}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

export async function loadAuthenticatedAppShellSession(input: {
  readonly fetcher: FetchPort;
  readonly storage: Storage;
  readonly apiBase?: string;
  readonly authorization?: string;
}): Promise<AdminAuthenticatedSession | null> {
  const apiBase = (input.apiBase ?? '').replace(/\/$/, '');
  const requestedTerminalId = input.storage.getItem('kipuspay:pos-terminal-id')?.trim() ?? '';
  const tenantId = input.storage.getItem('kipuspay_tenant_id')?.trim() ?? '';
  const bootstrapHeaders = buildBootstrapHeaders({
    authorization: input.authorization,
    tenantId,
    requestedTerminalId,
  });
  let response: Response;
  try {
    response = await input.fetcher(`${apiBase}/api/auth/session`, {
      method: 'GET',
      credentials: 'include',
      headers: bootstrapHeaders,
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    return null;
  }
  if (!isBootstrapDto(value)) return null;
  const terminal = value.terminal
    ? {
        verified: true as const,
        terminalId: value.terminal.terminalId,
        terminalSessionId: value.terminal.terminalSessionId,
      }
    : null;
  const authenticatedFetch: typeof fetch = async (request, init = {}) => {
    const headers = new Headers(init.headers);
    if (input.authorization?.trim()) headers.set('authorization', input.authorization);
    if (tenantId) headers.set('x-tenant-id', tenantId);
    if (terminal) {
      headers.set('x-terminal-id', terminal.terminalId);
      headers.set('x-terminal-session-id', terminal.terminalSessionId);
    }
    return input.fetcher(absolutizeRequestUrl(apiBase, request), {
      ...init,
      credentials: 'include',
      headers,
    });
  };
  return {
    authenticatedFetch,
    terminal,
    role: value.role,
    userId: value.userId,
    branchId: value.branchId,
    ...(value.billing ? { billing: value.billing } : {}),
  };
}
