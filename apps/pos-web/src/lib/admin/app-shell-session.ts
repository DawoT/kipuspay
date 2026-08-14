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

function isBootstrapDto(value: unknown): value is SessionBootstrapDto {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const session = value as Record<string, unknown>;
  const terminal = session.terminal;
  const billing = session.billing;
  if (
    billing !== undefined &&
    (typeof billing !== 'object' ||
      billing === null ||
      !['trial', 'active', 'past_due', 'canceled'].includes(
        String((billing as Record<string, unknown>).subscriptionStatus),
      ))
  ) {
    return false;
  }
  return (
    typeof session.userId === 'string' &&
    ['cashier', 'supervisor', 'admin', 'owner'].includes(String(session.role)) &&
    typeof session.branchId === 'string' &&
    (terminal === null ||
      (typeof terminal === 'object' &&
        !Array.isArray(terminal) &&
        typeof (terminal as Record<string, unknown>).terminalId === 'string' &&
        typeof (terminal as Record<string, unknown>).terminalSessionId === 'string'))
  );
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
  const bootstrapHeaders = new Headers();
  if (input.authorization?.trim()) bootstrapHeaders.set('authorization', input.authorization);
  if (tenantId) bootstrapHeaders.set('x-tenant-id', tenantId);
  if (requestedTerminalId) bootstrapHeaders.set('x-terminal-id', requestedTerminalId);
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
    const raw =
      typeof request === 'string'
        ? request
        : request instanceof URL
          ? request.href
          : request.url;
    const url = /^https?:\/\//i.test(raw) || /^wss?:\/\//i.test(raw) ? raw : `${apiBase}${raw.startsWith('/') ? raw : `/${raw}`}`;
    return input.fetcher(url, { ...init, credentials: 'include', headers });
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
