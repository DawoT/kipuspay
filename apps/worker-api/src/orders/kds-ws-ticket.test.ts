import { describe, expect, it, vi } from 'vitest';
import { consumeKdsWsTicket, runMintKdsWsTicketHttp } from './order-routes.js';
import { kdsWsTicketKvKey } from './kds-hub-helpers.js';

describe('KDS WS ticket', () => {
  it('flag off → 404; sin KV → 503; mint + consume one-shot', async () => {
    expect((await runMintKdsWsTicketHttp({ FEATURE_ORDERS_KDS: '0' }, 't1', 'b1')).status).toBe(
      404,
    );
    expect((await runMintKdsWsTicketHttp({ FEATURE_ORDERS_KDS: '1' }, 't1', 'b1')).status).toBe(
      503,
    );

    const store = new Map<string, string>();
    const kv = {
      get: (key: string) => Promise.resolve(store.get(key) ?? null),
      put: (key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve();
      },
      delete: (key: string) => {
        store.delete(key);
        return Promise.resolve();
      },
    };
    const minted = await runMintKdsWsTicketHttp(
      { FEATURE_ORDERS_KDS: '1', TENANT_KV: kv } as never,
      't1',
      'b1',
    );
    expect(minted.status).toBe(200);
    const ticket = String(minted.body.ticket);
    expect(store.has(kdsWsTicketKvKey(ticket))).toBe(true);
    const claimed = await consumeKdsWsTicket(kv, ticket, Date.now());
    expect(claimed).toEqual({ tenantId: 't1', branchId: 'b1' });
    expect(await consumeKdsWsTicket(kv, ticket, Date.now())).toBeNull();
  });

  it('ticket vacío o KV ausente → null', async () => {
    expect(await consumeKdsWsTicket(undefined, 'x', Date.now())).toBeNull();
    expect(await consumeKdsWsTicket({ get: vi.fn() }, '', Date.now())).toBeNull();
  });
});
