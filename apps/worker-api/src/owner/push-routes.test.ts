import { describe, expect, it } from 'vitest';
import { isOwnerPushEnabled, runSendOwnerPushHttp } from './push-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

function mockEnv(flags: Record<string, string>, all: Record<string, unknown>[] = []): WorkerEnv {
  const boundFor = (sql: string) => ({
    first: () =>
      Promise.resolve(
        sql.includes('SELECT u.id') ? null : { enabled: 1, config_json: '{}', epoch: 0 },
      ),
    all: () => Promise.resolve({ results: all }),
    run: () => Promise.resolve({ success: true, results: [], meta: {} }),
  });
  return {
    ...flags,
    DB: {
      prepare: (sql: string) => ({ bind: () => boundFor(sql) }),
      batch: () => Promise.resolve([]),
    } as unknown as WorkerEnv['DB'],
  } as WorkerEnv;
}

describe('owner.push_alerts', () => {
  it('flag default off', () => {
    expect(isOwnerPushEnabled({} as WorkerEnv)).toBe(false);
    expect(isOwnerPushEnabled({ FEATURE_OWNER_PUSH: '1' } as WorkerEnv)).toBe(true);
  });

  it('send best-effort: sin estado → 503; sin capability → queued=false', async () => {
    const off = await runSendOwnerPushHttp({ FEATURE_OWNER_PUSH: '0' } as WorkerEnv, 't1', {});
    expect(off.status).toBe(503);

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
