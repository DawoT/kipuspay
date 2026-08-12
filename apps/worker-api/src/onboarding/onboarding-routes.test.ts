import { describe, expect, it } from 'vitest';
import {
  isOnboardingTourEnabled,
  runGrowthEventHttp,
  runSetupProgressHttp,
  GROWTH_EVENT_TYPES,
  type OnboardingEnv,
} from './onboarding-routes.js';
import type { SetupServerState } from '@kipuspay/domain-onboarding';

function mockDb(overrides: Partial<Record<string, unknown>> = {}): unknown {
  const first = (sql: string) => {
    if (sql.includes('FROM tenants')) return overrides.tenant ?? null;
    return null;
  };
  return {
    prepare(sql: string) {
      return {
        bind() {
          return {
            first: () => Promise.resolve(first(sql)),
            run: () => Promise.resolve({ meta: { changes: 1 } }),
          };
        },
      };
    },
  };
}

function envWith(overrides: Partial<OnboardingEnv> = {}): OnboardingEnv {
  return { FEATURE_ONBOARDING_TOUR: '1', DB: mockDb(), ...overrides };
}

const actor = { tenantId: 't1', userId: 'u1', role: 'owner' };

describe('onboarding.tour routes (Sprint 52)', () => {
  it('flag off → 404 FEATURE_OFF en progreso y eventos', async () => {
    const env = envWith({ FEATURE_ONBOARDING_TOUR: '0' });
    expect((await runSetupProgressHttp(env, actor)).status).toBe(404);
    expect((await runGrowthEventHttp(env, actor, { eventType: 'tour_started' })).status).toBe(404);
  });

  it('setup-progress: computa los 4 pasos server desde D1', async () => {
    const env = envWith({
      DB: mockDb({
        tenant: {
          logo_url: 'https://cdn/logo.png',
          formalization_mode: 'ELECTRONIC_ISSUER',
          has_catalog: 1,
          team_size: 3,
        },
      }),
    });
    const res = await runSetupProgressHttp(env, actor);
    expect(res.status).toBe(200);
    const body = res.body as {
      server?: SetupServerState;
      progress?: {
        completedCount: number;
        total: number;
        nextStepId: string | null;
        percent: number;
      };
    };
    expect(body.server).toEqual({ logo: true, invoicing: true, team: true, catalog: true });
    expect(body.progress?.completedCount).toBe(4);
    expect(body.progress?.total).toBe(5);
    expect(body.progress?.nextStepId).toBe('printer');
  });

  it('setup-progress: tenant sin logo/catálogo/equipo y en control interno', async () => {
    const env = envWith({
      DB: mockDb({
        tenant: {
          logo_url: null,
          formalization_mode: 'INTERNAL_CONTROL',
          has_catalog: 0,
          team_size: 1,
        },
      }),
    });
    const res = await runSetupProgressHttp(env, actor);
    expect(res.status).toBe(200);
    const body = res.body as { server?: SetupServerState; progress?: { percent: number } };
    expect(body.server).toEqual({ logo: false, invoicing: false, team: false, catalog: false });
    expect(body.progress?.percent).toBe(0);
  });

  it('setup-progress: tenant inexistente → 404', async () => {
    const res = await runSetupProgressHttp(envWith(), actor);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('TENANT_NOT_FOUND');
  });

  it('growth event: rechaza tipos fuera del catálogo → 422', async () => {
    const res = await runGrowthEventHttp(envWith(), actor, { eventType: 'hack' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('UNKNOWN_GROWTH_EVENT');
  });

  it('growth event: meta no objeto → 422 INVALID_META', async () => {
    const res = await runGrowthEventHttp(envWith(), actor, {
      eventType: 'tour_started',
      meta: 'x',
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_META');
  });

  it('growth event: inserta y responde 201', async () => {
    let inserted: { sql: string; params: unknown[] } | null = null;
    const db = {
      prepare(sql: string) {
        return {
          bind(...params: unknown[]) {
            inserted = { sql, params };
            return { run: () => Promise.resolve({ meta: { changes: 1 } }) };
          },
        };
      },
    };
    const res = await runGrowthEventHttp({ FEATURE_ONBOARDING_TOUR: '1', DB: db }, actor, {
      eventType: 'setup_checklist_step_completed',
      meta: { step: 'logo' },
    });
    expect(res.status).toBe(201);
    const captured = inserted as { sql: string; params: unknown[] } | null;
    expect(captured).not.toBeNull();
    if (captured) {
      expect(captured.sql).toContain('INSERT INTO growth_events');
      expect(captured.params).toHaveLength(4);
      expect(captured.params[1]).toBe('t1');
      expect(captured.params[2]).toBe('setup_checklist_step_completed');
      expect(captured.params[3]).toBe('{"step":"logo"}');
    }
  });

  it('el catálogo de eventos incluye los 11 tipos del CHECK 0044', () => {
    expect(GROWTH_EVENT_TYPES).toHaveLength(11);
    expect(GROWTH_EVENT_TYPES).toContain('tour_completed');
    expect(GROWTH_EVENT_TYPES).toContain('setup_checklist_completed');
    expect(GROWTH_EVENT_TYPES).toContain('first_sale');
  });

  it('flag helper: solo 1/true activa', () => {
    expect(isOnboardingTourEnabled({ FEATURE_ONBOARDING_TOUR: '1' })).toBe(true);
    expect(isOnboardingTourEnabled({ FEATURE_ONBOARDING_TOUR: '0' })).toBe(false);
    expect(isOnboardingTourEnabled(undefined)).toBe(false);
  });
});
