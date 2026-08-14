import { describe, expect, it } from 'vitest';
import { isOwnerPushEnabled, runSendOwnerPushHttp } from './push-routes.js';
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

  it('send best-effort: off → FEATURE_OFF; sin DB → 503; sin capability → queued=false', async () => {
    const off = await runSendOwnerPushHttp({ FEATURE_OWNER_PUSH: '0' } as WorkerEnv, 't1', {});
    expect(off.status).toBe(404);

    const noDb = await runSendOwnerPushHttp({ FEATURE_OWNER_PUSH: '1' } as WorkerEnv, 't1', {});
    expect(noDb.status).toBe(503);

    const send = await runSendOwnerPushHttp(mockEnv({ FEATURE_OWNER_PUSH: '1' }, []), 't1', {
      title: 'Alerta',
      body: 'CxC vencida',
    });
    expect(send.status).toBe(200);
    expect(send.body.queued).toBe(false);
  });
});
