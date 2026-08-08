import { describe, expect, it } from 'vitest';
import { defaultLocationId } from './process-inventory-location-atomic.js';

describe('inventory-location ledger contract', () => {
  it('deriva DEFAULT de tenant y sucursal sin colisiones hermanas', () => {
    expect(defaultLocationId('tenant-a', 'branch-1')).toBe('loc-default:tenant-a:branch-1');
    expect(defaultLocationId('tenant-b', 'branch-1')).not.toBe(
      defaultLocationId('tenant-a', 'branch-1'),
    );
  });
});
