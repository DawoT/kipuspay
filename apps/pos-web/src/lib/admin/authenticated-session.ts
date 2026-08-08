import { getContext, setContext } from 'svelte';
import type { VerifiedTerminalContext } from '../catalog/price-label-client.js';

export interface AdminAuthenticatedSession {
  readonly authenticatedFetch: typeof fetch;
  readonly terminal: VerifiedTerminalContext;
}

const ADMIN_SESSION_CONTEXT = Symbol.for('kipuspay.admin.authenticated-session');

/** App-shell integration seam. Authentication and terminal verification happen before injection. */
export function provideAdminAuthenticatedSession(
  session: AdminAuthenticatedSession,
): AdminAuthenticatedSession {
  return setContext(ADMIN_SESSION_CONTEXT, session);
}

export function readAdminAuthenticatedSession(): AdminAuthenticatedSession | null {
  return getContext<AdminAuthenticatedSession | undefined>(ADMIN_SESSION_CONTEXT) ?? null;
}
