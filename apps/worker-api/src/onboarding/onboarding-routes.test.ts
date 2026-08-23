import { describe, expect, it } from 'vitest';
import {
  isOnboardingTourEnabled,
  runBootstrapHttp,
  runFormalizationStageHttp,
  runGrowthEventHttp,
  runListGrowthEventsHttp,
  runOnboardingClaimHttp,
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

  it('lista growth_events del tenant (métricas owner, no demo local)', async () => {
    const db = {
      prepare() {
        return {
          bind() {
            return {
              all: () =>
                Promise.resolve({
                  results: [
                    {
                      tenantId: 't1',
                      eventType: 'first_sale',
                      occurredAtIso: '2026-01-01T00:00:00.000Z',
                      metaJson: null,
                    },
                  ],
                }),
            };
          },
        };
      },
    };
    const res = await runListGrowthEventsHttp({ DB: db }, 't1');
    expect(res.status).toBe(200);
    expect(res.body.events).toEqual([
      {
        tenantId: 't1',
        eventType: 'first_sale',
        occurredAtIso: '2026-01-01T00:00:00.000Z',
      },
    ]);
    expect((await runListGrowthEventsHttp({ DB: db }, '')).status).toBe(401);
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

describe('S11-H2: formalization stage persistente (PATCH /api/tenant/formalization)', () => {
  function dbWithTenant(mode: string): unknown {
    const rows = { mode };
    const prepared: string[] = [];
    const heads = new Map<string, string>();
    return {
      heads,
      prepared,
      async batch(statements: readonly { sql: string; params: readonly unknown[] }[]) {
        for (const statement of statements) {
          prepared.push(statement.sql);
          if (statement.sql.startsWith('UPDATE audit_chain_heads')) {
            heads.set(String(statement.params[1]), String(statement.params[0]));
          } else if (statement.sql.includes('VALUES (?, ?) ON CONFLICT')) {
            heads.set(String(statement.params[0]), String(statement.params[1]));
          }
        }
        return statements.map(() => ({ results: [], success: true, meta: {} }));
      },
      prepare(sql: string) {
        prepared.push(sql);
        return {
          bind(...args: unknown[]) {
            return {
              sql,
              params: args,
              first: () => {
                if (sql.includes('FROM tenants')) {
                  return Promise.resolve({ formalization_mode: rows.mode });
                }
                if (sql.includes('FROM audit_chain_heads')) {
                  return Promise.resolve(heads.has('t1') ? { last_hash: heads.get('t1') } : null);
                }
                return Promise.resolve(null);
              },
              run: () => {
                if (sql.includes('UPDATE tenants')) {
                  const next = typeof args[0] === 'string' ? args[0] : '';
                  if (next.length > 0) rows.mode = next;
                  return Promise.resolve({ meta: { changes: 1 } });
                }
                return Promise.resolve({ meta: { changes: 1 } });
              },
            };
          },
        };
      },
    };
  }

  it('valida el gate (sin salto) y persiste el nuevo modo en D1', async () => {
    const dbRaw = dbWithTenant('INTERNAL_CONTROL') as {
      prepared: string[];
      prepare: (s: string) => {
        bind: (...args: unknown[]) => {
          first: () => Promise<{ formalization_mode: string } | null>;
          run: () => Promise<{ meta: { changes: number } }>;
        };
      };
    };
    const db = dbRaw;
    const res = await runFormalizationStageHttp(
      { DB: db } as unknown as Parameters<typeof runFormalizationStageHttp>[0],
      't1',
      { from: 'INTERNAL_CONTROL', to: 'FORMALIZING', confirmed: true },
    );
    expect(res.status).toBe(200);
    expect(res.body.formalizationMode).toBe('FORMALIZING');
    expect(res.body.historicalNvConverted).toBe(false);
    const after = (await db.prepare('SELECT formalization_mode FROM tenants').bind().first()) as {
      formalization_mode: string;
    };
    expect(after.formalization_mode).toBe('FORMALIZING');
    // S17-H3: el cambio de modo emite audit_events FORMALIZATION_MODE
    // (puerto M1: la acción viaja como parámetro del INSERT genérico y la
    // cabeza del chain avanza con el claim CAS dentro del mismo batch).
    expect(dbRaw.prepared.some((s) => s.includes('INSERT INTO audit_events'))).toBe(true);
    expect((dbRaw as unknown as { heads: Map<string, string> }).heads.size).toBe(1);
  });

  it('salto de etapa sin confirmar → 422 y NO persiste', async () => {
    const db = dbWithTenant('INTERNAL_CONTROL') as {
      prepare: (s: string) => {
        bind: (...args: unknown[]) => {
          first: () => Promise<{ formalization_mode: string } | null>;
          run: () => Promise<{ meta: { changes: number } }>;
        };
      };
    };
    const res = await runFormalizationStageHttp(
      { DB: db } as unknown as Parameters<typeof runFormalizationStageHttp>[0],
      't1',
      { from: 'INTERNAL_CONTROL', to: 'ELECTRONIC_ISSUER', confirmed: true },
    );
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('STAGE_REJECTED');
    const after = (await db.prepare('SELECT formalization_mode FROM tenants').bind().first()) as {
      formalization_mode: string;
    };
    expect(after.formalization_mode).toBe('INTERNAL_CONTROL');
  });
});

describe('bootstrap persistente + claim de onboarding (M6A)', () => {
  interface Capture {
    kv: Map<string, string>;
    kvDeletes: string[];
    batchSql: string[];
    batchCount: number;
  }

  function captureEnv(overrides: { tenantExists?: boolean; jwtSecret?: string } = {}) {
    const capture: Capture = { kv: new Map(), kvDeletes: [], batchSql: [], batchCount: 0 };
    const db = {
      prepare(sql: string) {
        const stmt = {
          bind() {
            return stmt;
          },
          first<T>() {
            return Promise.resolve(null as T);
          },
          run() {
            return Promise.resolve({ meta: { changes: 1 } });
          },
        };
        (stmt as unknown as { sql: string }).sql = sql;
        return stmt;
      },
      batch<T>(stmts: { sql?: string }[]) {
        capture.batchCount += 1;
        for (const s of stmts) capture.batchSql.push(s.sql ?? '');
        return Promise.resolve(stmts.map(() => ({})) as T[]);
      },
      exec() {
        return Promise.resolve({ count: 0, duration: 0 });
      },
      withSession() {
        return { prepare: db.prepare.bind(db), batch: db.batch.bind(db) };
      },
      dump() {
        return Promise.resolve(new ArrayBuffer(0));
      },
    };
    const env = {
      DB: db as unknown as D1Database,
      AUTH_JWT_HS_SECRET: overrides.jwtSecret ?? 'secret-de-prueba',
      TENANT_KV: {
        get: (key: string) =>
          Promise.resolve(
            overrides.tenantExists && key.startsWith('tenant:')
              ? JSON.stringify({ id: key.split(':')[1] })
              : (capture.kv.get(key) ?? null),
          ),
        put: (key: string, value: string) => {
          capture.kv.set(key, value);
          return Promise.resolve();
        },
        delete: (key: string) => {
          capture.kvDeletes.push(key);
          capture.kv.delete(key);
          return Promise.resolve();
        },
      },
    };
    return { env, capture };
  }

  it('persiste tenant+branch+owner+sesión y devuelve credenciales y token (RED M6A)', async () => {
    const { env, capture } = captureEnv();
    const res = await runBootstrapHttp(env, {
      tradeName: 'Bodega Doña Pepa',
      verticalType: 'retail',
      formalizationMode: 'INTERNAL_CONTROL',
    });
    expect(res.status).toBe(201);
    const body = res.body;
    expect(typeof body.tenantId).toBe('string');
    expect(typeof body.branchId).toBe('string');
    expect(String(body.ownerBadge)).toMatch(/^EMP-\d{5}$/);
    expect(String(body.ownerPin)).toMatch(/^\d{4}$/);
    expect(String(body.onboardingToken).split('.')).toHaveLength(3);
    expect(body.expiresInSeconds).toBe(900);
    expect(typeof body.trialEndsAt).toBe('string');
    // Persistencia: KV auth snapshot + token single-use + batch con las 6 tablas.
    expect(capture.kv.has(`tenant:${body.tenantId}`)).toBe(true);
    expect([...capture.kv.keys()].some((k) => k.startsWith('onboarding:'))).toBe(true);
    const sql = capture.batchSql.join('\n');
    expect(sql).toContain('INSERT INTO tenants');
    expect(sql).toContain('INSERT INTO branches');
    expect(sql).toContain('INSERT INTO cash_registers');
    expect(sql).toContain('INSERT INTO users');
    expect(sql).toContain('INSERT INTO cash_register_sessions');
    expect(sql).toContain("'onboarding_started'");
    expect(sql).toContain('INSERT INTO branch_document_series');
    expect(sql).toContain('INSERT INTO payment_methods');
  });

  it('idempotencia: tenant ya persistido → 409 sin duplicar (RED M6A)', async () => {
    const { env } = captureEnv({ tenantExists: true });
    const res = await runBootstrapHttp(env, {
      tradeName: 'Otra Bodega',
      verticalType: 'retail',
      formalizationMode: 'INTERNAL_CONTROL',
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('TENANT_ALREADY_EXISTS');
  });

  it('campos inválidos → 422 sin persistir', async () => {
    const { env, capture } = captureEnv();
    const res = await runBootstrapHttp(env, {
      tradeName: '',
      verticalType: 'retail',
      formalizationMode: 'INTERNAL_CONTROL',
    });
    expect(res.status).toBe(422);
    expect(capture.batchCount).toBe(0);
  });

  it('claim: token válido consume el single-use y minta la sesión del owner (RED M6A)', async () => {
    const { env, capture } = captureEnv();
    const boot = await runBootstrapHttp(env, {
      tradeName: 'Bodega Doña Pepa',
      verticalType: 'retail',
      formalizationMode: 'INTERNAL_CONTROL',
    });
    expect(boot.status).toBe(201);
    const body = boot.body;
    const claim = await runOnboardingClaimHttp(env, String(body.onboardingToken));
    expect(claim.status).toBe(200);
    const claimBody = claim.body;
    expect(String(claimBody.token).split('.')).toHaveLength(3);
    expect((claimBody.user as { role: string }).role).toBe('owner');
    expect(typeof claimBody.cashRegisterSessionId).toBe('string');
    expect(capture.kvDeletes.some((k) => k.startsWith('onboarding:'))).toBe(true);
    // Segundo uso del mismo token → 403.
    const second = await runOnboardingClaimHttp(env, String(body.onboardingToken));
    expect(second.status).toBe(403);
  });

  it('claim con token inválido → 403', async () => {
    const { env } = captureEnv();
    const claim = await runOnboardingClaimHttp(env, 'token-invalido');
    expect(claim.status).toBe(403);
  });
});
