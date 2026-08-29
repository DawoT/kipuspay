/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import { evaluatePushSloSnapshot, runPushSloObserver } from './push-slo-observer.js';

describe('push-slo-observer pure evaluatePushSloSnapshot guard', () => {
  const base = '2026-08-24T14:50:00.000Z';
  const accepted = new Date(Date.parse(base)).toISOString();
  const displayedFast = new Date(Date.parse(base) + 4500).toISOString();
  const displayedSlow = new Date(Date.parse(base) + 12000).toISOString();

  it('n=1 no alerta aunque p95≥10s o rate<99% (guard)', () => {
    const snap = evaluatePushSloSnapshot([
      {
        display_context: 'NORMAL',
        accepted_at: accepted,
        displayed_at: displayedSlow,
        event_created_at: base,
        status: 'DISPLAYED',
      },
    ]);
    expect(snap.alert).toBe(false);
    expect(snap.reasons).toEqual([]);
    expect(snap.normalSamples).toBe(1);
    expect(snap.p95Ms).toBe(12000);

    const snap2 = evaluatePushSloSnapshot([
      {
        display_context: 'NORMAL',
        accepted_at: accepted,
        displayed_at: null,
        event_created_at: base,
        status: 'ACCEPTED',
      },
    ]);
    expect(snap2.alert).toBe(false);
    expect(snap2.reasons).toEqual([]);
  });

  it('n=20 alerta con M3 <99% (19/20)', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      display_context: 'NORMAL' as const,
      accepted_at: accepted,
      displayed_at: i < 19 ? displayedFast : null,
      event_created_at: base,
      status: i < 19 ? 'DISPLAYED' : 'ACCEPTED',
    }));
    const snap = evaluatePushSloSnapshot(rows);
    expect(snap.normalSamples).toBe(20);
    expect(snap.displayed).toBe(19);
    expect(snap.displayedRate).toBeCloseTo(0.95);
    expect(snap.alert).toBe(true);
    expect(snap.reasons).toContain('DISPLAYED_BELOW_99');
  });

  it('n=20 alerta con p95≥10s (M4)', () => {
    // p95 con n=20 requiere al menos 2 muestras lentas para que el percentil 95 sea lento (idx 18)
    const rows = Array.from({ length: 20 }, (_, i) => ({
      display_context: 'NORMAL' as const,
      accepted_at: accepted,
      displayed_at: i >= 18 ? displayedSlow : displayedFast,
      event_created_at: base,
      status: 'DISPLAYED' as const,
    }));
    const snap = evaluatePushSloSnapshot(rows);
    expect(snap.m4p95Ms).toBe(12000);
    expect(snap.alert).toBe(true);
    expect(snap.reasons).toContain('P95_AT_OR_ABOVE_10S');
  });

  it('n=20 healthy no alerta', () => {
    const rows = Array.from({ length: 20 }, () => ({
      display_context: 'NORMAL' as const,
      accepted_at: accepted,
      displayed_at: displayedFast,
      event_created_at: base,
      status: 'DISPLAYED' as const,
    }));
    const snap = evaluatePushSloSnapshot(rows);
    expect(snap.alert).toBe(false);
    expect(snap.reasons).toEqual([]);
  });

  it('M5 p95 E2E también dispara alerta si ≥10s', () => {
    const eventCreated = new Date(Date.parse(base) - 12000).toISOString(); // e2e 16.5s (base -12s + fast 4.5s)
    const rows = Array.from({ length: 20 }, (_, i) => ({
      display_context: 'NORMAL' as const,
      accepted_at: accepted,
      displayed_at: displayedFast,
      event_created_at: i >= 18 ? eventCreated : base,
      status: 'DISPLAYED' as const,
    }));
    const snap = evaluatePushSloSnapshot(rows);
    // M5 slow e2e debe elevar p95 combinado
    expect(snap.m5p95Ms! >= 10000).toBe(true);
    expect(snap.alert).toBe(true);
    expect(snap.reasons).toContain('P95_AT_OR_ABOVE_10S');
  });

  it('runPushSloObserver con D1 mock: no alerta n=1, alerta n=20', async () => {
    // Mock DB prepares for n=1 case: one row
    const makeEnv = (rows: Record<string, unknown>[]) =>
      ({
        DB: {
          prepare: vi.fn(() => ({
            bind: vi.fn(() => ({
              all: vi.fn(async () => ({ results: rows })),
            })),
          })),
        },
      }) as any;

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const env1 = makeEnv([
        {
          display_context: 'NORMAL',
          accepted_at: accepted,
          displayed_at: displayedSlow,
          event_created_at: base,
          status: 'DISPLAYED',
          created_at: base,
        },
      ]);
      const snap1 = await runPushSloObserver(env1, {
        nowMs: Date.parse(base) + 3600 * 1000,
        windowHours: 24,
      });
      expect(snap1.alert).toBe(false);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('push_slo_snapshot'));
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('push_slo_violation'));

      logSpy.mockClear();
      warnSpy.mockClear();

      const rows20 = Array.from({ length: 20 }, (_, i) => ({
        display_context: 'NORMAL',
        accepted_at: accepted,
        displayed_at: i < 19 ? displayedFast : null,
        event_created_at: base,
        status: i < 19 ? 'DISPLAYED' : 'ACCEPTED',
        created_at: base,
      }));
      const env20 = makeEnv(rows20);
      const snap20 = await runPushSloObserver(env20, {
        nowMs: Date.parse(base) + 3600 * 1000,
        windowHours: 24,
      });
      expect(snap20.alert).toBe(true);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('push_slo_snapshot'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('push_slo_violation'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('DISPLAYED_BELOW_99'));
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('siempre log push_slo_snapshot incluso sin DB', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const snap = await runPushSloObserver({} as any, { nowMs: Date.now() });
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('push_slo_snapshot'));
      expect(snap.normalSamples).toBe(0);
      expect(snap.alert).toBe(false);
    } finally {
      logSpy.mockRestore();
    }
  });
});
