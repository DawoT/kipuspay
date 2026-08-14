import { describe, expect, it } from 'vitest';
import {
  assertKdsFireWithinSla,
  branchKdsHubName,
  KDS_FIRE_SLA_MS,
  kdsWsTicketKvKey,
  parseKdsWsTicketPayload,
  verifyKdsBroadcastToken,
} from './kds-hub-helpers.js';

describe('KDS hub helpers', () => {
  it('nombre DO por tenant:branch', () => {
    expect(branchKdsHubName('t1', 'b1')).toBe('t1:b1');
  });

  it('SLA < KDS_FIRE_SLA_MS', () => {
    const fired = 1_000;
    expect(() => assertKdsFireWithinSla(fired, fired + 50)).not.toThrow();
    expect(() => assertKdsFireWithinSla(fired, fired + KDS_FIRE_SLA_MS + 1)).toThrow(
      'KDS_SLA_BREACH',
    );
  });

  it('S1: token interno correcto → true; sin secret → false (fail-closed)', () => {
    expect(verifyKdsBroadcastToken('secret', 'secret')).toBe(true);
    expect(verifyKdsBroadcastToken(null, 'secret')).toBe(false);
    expect(verifyKdsBroadcastToken('nope', 'secret')).toBe(false);
    expect(verifyKdsBroadcastToken('secret', undefined)).toBe(false);
    expect(verifyKdsBroadcastToken('secret', '')).toBe(false);
  });

  it('ticket WS: payload válido no expirado; ausente/expirado → null', () => {
    const now = 1_700_000_000_000;
    expect(parseKdsWsTicketPayload(null, now)).toBeNull();
    expect(parseKdsWsTicketPayload('not-json', now)).toBeNull();
    expect(
      parseKdsWsTicketPayload(
        JSON.stringify({ tenantId: 't1', branchId: 'b1', exp: now - 1 }),
        now,
      ),
    ).toBeNull();
    expect(
      parseKdsWsTicketPayload(
        JSON.stringify({ tenantId: 't1', branchId: 'b1', exp: now + 1_000 }),
        now,
      ),
    ).toEqual({ tenantId: 't1', branchId: 'b1', exp: now + 1_000 });
    expect(kdsWsTicketKvKey('abc')).toBe('kds-ws:abc');
  });
});
