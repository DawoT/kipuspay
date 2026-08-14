/**
 * Handshake marketing→POS (M6B).
 * Base de API del onboarding: PUBLIC_API_BASE (cross-origin, arquitectura
 * final con api.kipuspay.com) o mismo origen (proxy de Pages hoy).
 * El redirect lleva el token single-use; el PIN jamás viaja por la URL.
 */
import { env as publicEnv } from '$env/dynamic/public';

export function resolvePosOrigin(): string {
  return (publicEnv.PUBLIC_POS_ORIGIN ?? 'https://app.kipuspay.com').replace(/\/$/, '');
}

/** Vacío = mismo origen (proxy Pages / Vite). Nunca hardcodear el worker. */
export function resolveOnboardingApiBase(): string {
  return (publicEnv.PUBLIC_API_BASE ?? '').replace(/\/$/, '');
}

export interface OnboardingRedirectInput {
  readonly posOrigin: string;
  readonly tenantId: string;
  readonly token: string;
  readonly mode: string;
  readonly vertical: string;
  readonly name: string;
}

export function buildOnboardingRedirect(input: OnboardingRedirectInput): string {
  const qs = new URLSearchParams({
    onboarding: '1',
    tenant: input.tenantId,
    onboarding_token: input.token,
    mode: input.mode,
    vertical: input.vertical,
    name: input.name,
  });
  return `${input.posOrigin}/?${qs.toString()}`;
}
