import { describe, expect, it, vi } from 'vitest';
import {
  runListHardwareDiagnosticsHttp,
  runReportHardwareDiagnosticsHttp,
  type HardwareDiagActor,
} from './hardware-diagnostics-routes.js';

import type { WorkerEnv } from '../auth/control-plane.js';

function fakeEnv(overrides: Partial<Record<string, unknown>> = {}) {
  const rows: unknown[] = [];
  const db = {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        first: vi.fn(() => Promise.resolve(rows.shift())),

        all: vi.fn(() => Promise.resolve({ results: rows.splice(0) })),
        run: vi.fn(() => Promise.resolve({ success: true })),
      })),
    })),
    batch: vi.fn(() => Promise.resolve([{ success: true }])),
    rows,
  };
  return {
    env: { DB: db, FEATURE_HARDWARE_DIAGNOSTICS: '1', ...overrides } as unknown as WorkerEnv,
    db,
  };
}

const actor: HardwareDiagActor = { tenantId: 't-hw', userId: 'u-hw', role: 'admin' };

describe('hardware-diagnostics routes (Sprint 53)', () => {
  it('POST: flag off → FEATURE_OFF (fail-closed)', async () => {
    const { env } = fakeEnv({ FEATURE_HARDWARE_DIAGNOSTICS: '0' });
    const result = await runReportHardwareDiagnosticsHttp(env, actor, {
      reports: [{ target: 'printer_usb', ok: true, causeCode: 'OK', testedAtIso: 'x' }],
    });
    expect(result.status).toBe(404);
    expect(result.body.code).toBe('FEATURE_OFF');
  });

  it('POST: rol no admin → 403 FORBIDDEN', async () => {
    const { env } = fakeEnv();
    const result = await runReportHardwareDiagnosticsHttp(
      env,
      { ...actor, role: 'cashier' },
      { reports: [] },
    );
    expect(result.status).toBe(403);
  });

  it('POST: capability off → 403 CAPABILITY_OFF', async () => {
    const { env } = fakeEnv();
    const result = await runReportHardwareDiagnosticsHttp(env, actor, {
      reports: [{ target: 'scale', ok: false, causeCode: 'SCALE_NOT_FOUND', testedAtIso: 'x' }],
    });
    expect(result.status).toBe(403);
    expect(result.body.code).toBe('CAPABILITY_OFF');
  });

  it('POST: reports inválidos → 400 HARDWARE_DIAG_INVALID', async () => {
    const { env, db } = fakeEnv();
    db.rows.push({ enabled: 1 });
    const result = await runReportHardwareDiagnosticsHttp(env, actor, {
      reports: [{ target: 1, ok: 'si' }],
    });
    expect(result.status).toBe(400);
    expect(result.body.code).toBe('HARDWARE_DIAG_INVALID');
  });

  it('POST: >20 reports → 400', async () => {
    const { env, db } = fakeEnv();
    db.rows.push({ enabled: 1 });
    const reports = Array.from({ length: 21 }, () => ({
      target: 'scale',
      ok: true,
      causeCode: 'OK',
      testedAtIso: 'x',
    }));
    const result = await runReportHardwareDiagnosticsHttp(env, actor, { reports });
    expect(result.status).toBe(400);
  });

  it('POST: válido → 202 y persiste HARDWARE_DIAG con cadena de hashes', async () => {
    const { env, db } = fakeEnv();
    db.rows.push({ enabled: 1 }, { row_hash: 'prev-hash' });
    const result = await runReportHardwareDiagnosticsHttp(env, actor, {
      reports: [
        {
          target: 'printer_usb',
          ok: true,
          causeCode: 'OK',
          testedAtIso: '2026-08-12T20:00:00.000Z',
        },
      ],
    });
    expect(result.status).toBe(202);
    expect(result.body.recorded).toBe(1);
  });

  it('GET: capability on → listado reciente con payload parseado', async () => {
    const { env, db } = fakeEnv();
    const payloadJson = JSON.stringify({
      target: 'scale',
      ok: false,
      causeCode: 'SCALE_NOT_FOUND',
      testedAtIso: '2026-08-12T20:00:00.000Z',
    });
    db.rows.push(
      { enabled: 1 },
      { target: 'scale', payload_json: payloadJson, created_at: '2026-08-12T20:00:00Z' },
    );
    const result = await runListHardwareDiagnosticsHttp(env, actor, 10);
    expect(result.status).toBe(200);
    const reports = result.body.reports as
      Array<{ target: string; payload: Record<string, unknown> | null }> | undefined;
    expect(reports).toHaveLength(1);
    expect(reports?.[0]?.target).toBe('scale');
    expect(reports?.[0]?.payload).toEqual({
      target: 'scale',
      ok: false,
      causeCode: 'SCALE_NOT_FOUND',
      testedAtIso: '2026-08-12T20:00:00.000Z',
    });
  });
});
