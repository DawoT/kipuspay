import { describe, expect, it } from 'vitest';
import { assertKdsFireWithinSla, branchKdsHubName, KDS_FIRE_SLA_MS } from './kds-hub-helpers.js';

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
});
