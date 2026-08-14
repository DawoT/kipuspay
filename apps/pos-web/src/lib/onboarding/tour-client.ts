/**
 * Sprint 52 — cliente del Product Tour y del Setup Checklist (regla 37a).
 * El estado de persistencia local vive en localStorage (no re-aparece si se
 * cierra); el tour se omite si el negocio ya vendió (firstSaleAtIso). La
 * métrica de completitud se instrumenta en growth_events (GTM §6.2).
 */

import {
  TOUR_COMPLETED,
  TOUR_DISMISSED,
  tourStorageKey,
  type SetupServerState,
} from '@kipuspay/domain-onboarding';
import { resolveApiAuth, resolveApiBase, applyApiAuthHeaders } from '../auth/api-client.js';

export interface SetupProgressResponse {
  readonly ok: true;
  readonly server: SetupServerState;
  readonly formalizationMode: string;
}

function apiBase(): string {
  return resolveApiBase();
}

function authHeader(): string {
  return resolveApiAuth().authorization ?? '';
}

export async function fetchSetupProgress(): Promise<
  SetupProgressResponse | { ok: false; message: string }
> {
  try {
    const headers = new Headers({ authorization: authHeader() });
    applyApiAuthHeaders(headers);
    const res = await fetch(`${apiBase().replace(/\/$/, '')}/api/onboarding/setup-progress`, {
      headers,
    });
    const data = (await res.json()) as {
      server?: SetupServerState;
      formalizationMode?: string;
      code?: string;
      error?: string;
    };
    if (!res.ok || !data.server) {
      return {
        ok: false,
        message: data.error ?? data.code ?? 'No se pudo leer el estado del checklist.',
      };
    }
    return { ok: true, server: data.server, formalizationMode: data.formalizationMode ?? '' };
  } catch {
    return { ok: false, message: 'Sin conexión con el servidor.' };
  }
}

export type GrowthEventType =
  | 'tour_started'
  | 'tour_completed'
  | 'tour_dismissed'
  | 'setup_checklist_step_completed'
  | 'setup_checklist_completed'
  | 'first_sale';

export async function recordGrowthEvent(
  eventType: GrowthEventType,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    const headers = new Headers({
      'content-type': 'application/json',
      authorization: authHeader(),
    });
    applyApiAuthHeaders(headers);
    await fetch(`${apiBase().replace(/\/$/, '')}/api/growth/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ eventType, meta }),
    });
  } catch {
    // La métrica nunca debe romper el cobro ni el tour.
  }
}

export type TourLocalState = typeof TOUR_DISMISSED | typeof TOUR_COMPLETED | null;

export function readTourState(storage: Storage, vertical: string): TourLocalState {
  const raw = storage.getItem(tourStorageKey(vertical));
  return raw === TOUR_DISMISSED || raw === TOUR_COMPLETED ? raw : null;
}

export function writeTourState(
  storage: Storage,
  vertical: string,
  state: typeof TOUR_DISMISSED | typeof TOUR_COMPLETED,
): void {
  storage.setItem(tourStorageKey(vertical), state);
}

export interface TourEligibilityInput {
  readonly hasSold: boolean;
  readonly localState: TourLocalState;
}

/**
 * Criterio S52: el tour se muestra solo si el negocio aún no vendió y el
 * usuario no lo cerró ni lo completó antes (no re-aparece).
 */
export function isTourEligible(input: TourEligibilityInput): boolean {
  return !input.hasSold && input.localState === null;
}
