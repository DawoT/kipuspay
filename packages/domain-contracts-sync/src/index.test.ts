import { describe, expect, it } from 'vitest';
import { maxLsn, type SyncEnvelope } from './index.js';

describe('maxLsn', () => {
  it('respeta el LSN base cuando no hay ops mayores', () => {
    const envelope: SyncEnvelope<unknown> = {
      tenantId: 't1',
      lastSeenLsn: 10,
      ops: [{ id: 'a', entity: 'sale', version: 8 }],
      payloads: new Map(),
    };
    expect(maxLsn(envelope)).toBe(10);
  });

  it('promueve al op con mayor versión', () => {
    const envelope: SyncEnvelope<unknown> = {
      tenantId: 't1',
      lastSeenLsn: 10,
      ops: [{ id: 'a', entity: 'sale', version: 12 }],
      payloads: new Map(),
    };
    expect(maxLsn(envelope)).toBe(12);
  });
});
