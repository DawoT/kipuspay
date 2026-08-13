import { describe, expect, it } from 'vitest';
import {
  isOwnerPushEnabled,
  judgePushDelivery,
  runPushDeliveryHarness,
  runSendOwnerPushHttp,
  runSubscribePushHttp,
} from './push-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

function mockEnv(flags: Record<string, string>, all: Record<string, unknown>[] = []): WorkerEnv {
  const bound = {
    first: () => Promise.resolve(null),
    all: () => Promise.resolve({ results: all }),
    run: () => Promise.resolve({ success: true, results: [], meta: {} }),
  };
  return {
    ...flags,
    DB: {
      prepare: () => ({ bind: () => bound }),
      batch: () => Promise.resolve([]),
    } as unknown as WorkerEnv['DB'],
  } as WorkerEnv;
}

describe('owner.push_alerts', () => {
  it('flag default off', () => {
    expect(isOwnerPushEnabled({} as WorkerEnv)).toBe(false);
    expect(isOwnerPushEnabled({ FEATURE_OWNER_PUSH: '1' } as WorkerEnv)).toBe(true);
  });

  it('subscribe flag off → FEATURE_OFF; on sin DB → 503; bad body → 400; ok → 200', async () => {
    const off = await runSubscribePushHttp({ FEATURE_OWNER_PUSH: '0' } as WorkerEnv, 't1', 'u1', {
      endpoint: 'https://x',
      p256dh: 'a',
      auth: 'b',
    });
    expect(off.status).toBe(404);

    const noDb = await runSubscribePushHttp({ FEATURE_OWNER_PUSH: '1' } as WorkerEnv, 't1', 'u1', {
      endpoint: 'https://x',
      p256dh: 'a',
      auth: 'b',
    });
    expect(noDb.status).toBe(503);

    const bad = await runSubscribePushHttp(mockEnv({ FEATURE_OWNER_PUSH: '1' }), 't1', 'u1', {
      endpoint: 'http://insecure',
      p256dh: 'a',
      auth: 'b',
    });
    expect(bad.status).toBe(400);

    const ok = await runSubscribePushHttp(mockEnv({ FEATURE_OWNER_PUSH: '1' }), 't1', 'u1', {
      endpoint: 'https://push.example/1',
      p256dh: 'key',
      auth: 'auth',
    });
    expect(ok.status).toBe(200);
    expect(ok.body.subscribed).toBe(true);
  });

  it('send stub medible + harness ≥99%', async () => {
    expect(judgePushDelivery({ endpoint: 'http://insecure', p256dh: 'a', auth: 'b' })).toBe(false);
    expect(judgePushDelivery({ endpoint: 'https://ok', p256dh: 'a', auth: 'b' })).toBe(true);

    const sendOff = await runSendOwnerPushHttp({ FEATURE_OWNER_PUSH: '0' } as WorkerEnv, 't1', {});
    expect(sendOff.status).toBe(404);

    const send = await runSendOwnerPushHttp(
      mockEnv({ FEATURE_OWNER_PUSH: '1' }, []),
      't1',
      { title: 'Alerta', body: 'CxC vencida' },
    );
    expect(send.status).toBe(200);
    expect(send.body.queued).toBe(false);

    const report = runPushDeliveryHarness(100);
    expect(report.deliveryRate).toBeGreaterThanOrEqual(0.99);
    expect(report.delivered).toBe(100);
  });
});
