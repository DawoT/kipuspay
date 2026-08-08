import { getContext, setContext } from 'svelte';
import type { VerifiedTerminalContext } from '../catalog/price-label-client.js';

export interface AdminAuthenticatedSession {
  readonly authenticatedFetch: typeof fetch;
  readonly terminal: VerifiedTerminalContext | null;
  readonly role?: string;
  readonly userId?: string;
  readonly branchId?: string;
}

const ADMIN_SESSION_CONTEXT = Symbol.for('kipuspay.admin.authenticated-session');
const ADMIN_SESSION_STATE_CONTEXT = Symbol.for('kipuspay.admin.authenticated-session-state');

export interface AdminAuthenticatedSessionState {
  readonly current: AdminAuthenticatedSession | null;
}

/** App-shell integration seam. Authentication and terminal verification happen before injection. */
export function provideAdminAuthenticatedSession(
  session: AdminAuthenticatedSession,
): AdminAuthenticatedSession {
  return setContext(ADMIN_SESSION_CONTEXT, session);
}

export function readAdminAuthenticatedSession(): AdminAuthenticatedSession | null {
  return getContext<AdminAuthenticatedSession | undefined>(ADMIN_SESSION_CONTEXT) ?? null;
}

export function provideAdminAuthenticatedSessionState(
  state: AdminAuthenticatedSessionState,
): AdminAuthenticatedSessionState {
  return setContext(ADMIN_SESSION_STATE_CONTEXT, state);
}

export function readAdminAuthenticatedSessionState(): AdminAuthenticatedSessionState | null {
  return (
    getContext<AdminAuthenticatedSessionState | undefined>(ADMIN_SESSION_STATE_CONTEXT) ?? null
  );
}
