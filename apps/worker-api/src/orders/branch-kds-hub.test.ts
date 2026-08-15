/* eslint-disable @typescript-eslint/no-explicit-any -- focused DurableObject boundary fake */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    protected ctx: any;
    protected env: any;

    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

const { BranchKdsHub } = await import('./branch-kds-hub.js');

function hub(env: { KDS_BROADCAST_TOKEN?: string }) {
  const storage = new Map<string, unknown>();
  const ctx = {
    storage: {
      get: (k: string) => Promise.resolve(storage.get(k)),
      put: (k: string, v: unknown) => {
        storage.set(k, v);
        return Promise.resolve();
      },
    },
    acceptWebSocket: vi.fn(),
  };
  const instance = new BranchKdsHub(ctx as never, env) as unknown as {
    fetch(request: Request): Promise<Response>;
    ctx: { storage: { get(k: string): Promise<unknown>; put(k: string, v: unknown): Promise<void> } };
  };
  return instance;
}

const event = {
  type: 'ITEM_FIRED',
  tenantId: 't1',
  branchId: 'b1',
  orderId: 'o1',
  firedAtMs: 1,
  serverNowMs: 2,
};

describe('BranchKdsHub (S1 token interno)', () => {
  let h: ReturnType<typeof hub>;

  beforeEach(() => {
    h = hub({ KDS_BROADCAST_TOKEN: 'kds-secret' });
  });

  it('broadcast sin token → 401 fail-closed', async () => {
    const res = await h.fetch(
      new Request('https://kds.internal/broadcast', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(event),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('broadcast con token incorrecto → 401', async () => {
    const res = await h.fetch(
      new Request('https://kds.internal/broadcast', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-kds-token': 'wrong' },
        body: JSON.stringify(event),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('broadcast con token correcto → 200 y persiste el evento', async () => {
    const res = await h.fetch(
      new Request('https://kds.internal/broadcast', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-kds-token': 'kds-secret' },
        body: JSON.stringify(event),
      }),
    );
    expect(res.status).toBe(200);
    const body: { ok: boolean } = await res.json();
    expect(body.ok).toBe(true);
    await expect(h.ctx.storage.get('kds_history')).resolves.toEqual([event]);
  });

  it('replay sin token → 401', async () => {
    const res = await h.fetch(new Request('https://kds.internal/replay'));
    expect(res.status).toBe(401);
  });

  it('sin secret configurado → broadcast 401 aunque traiga token (fail-closed)', async () => {
    const noSecret = hub({});
    const res = await noSecret.fetch(
      new Request('https://kds.internal/broadcast', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-kds-token': 'kds-secret' },
        body: JSON.stringify(event),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('health y paths desconocidos siguen disponibles sin token', async () => {
    const health = await h.fetch(new Request('https://kds.internal/health'));
    expect(health.status).toBe(200);
    const nf = await h.fetch(new Request('https://kds.internal/other'));
    expect(nf.status).toBe(404);
  });
});
