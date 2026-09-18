import { describe, expect, it, vi } from 'vitest';
import { CapabilityResolver, isCapabilityEnabled } from './capability-resolver.js';

function dbWith(
  row: { enabled: number; config_json: string; epoch: number | null } | null,
  options: { readonly rejects?: boolean } = {},
): D1Database {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => {
          if (options.rejects) throw new Error('D1 unavailable');
          return row;
        }),
      })),
    })),
  } as unknown as D1Database;
}

describe('CapabilityResolver', () => {
  it('authorizes a tenant capability and returns its current epoch and validated config', async () => {
    const resolver = new CapabilityResolver({
      DB: dbWith({ enabled: 1, config_json: '{"version":1,"mode":"fefo"}', epoch: 7 }),
      FEATURE_INVENTORY_BATCHES: '1',
    });

    await expect(resolver.require('tenant-a', 'inventory.batches')).resolves.toEqual({
      capability: 'inventory.batches',
      config: { version: 1, mode: 'fefo' },
      epoch: 7,
    });
  });

  it('treats an absent global flag as no kill switch, not as tenant authorization', async () => {
    const resolver = new CapabilityResolver({
      DB: dbWith({ enabled: 1, config_json: '{}', epoch: 4 }),
    });

    await expect(resolver.require('tenant-a', 'sales.quotes')).resolves.toMatchObject({
      capability: 'sales.quotes',
      epoch: 4,
    });
  });

  it('rechaza configuración específica mal tipada antes de exponerla al dominio', async () => {
    const resolver = new CapabilityResolver({
      DB: dbWith({
        enabled: 1,
        config_json: JSON.stringify({ priceCentsPerGallon: '1620' }),
        epoch: 4,
      }),
    });

    await expect(resolver.require('tenant-a', 'fuel.dispatch')).rejects.toMatchObject({
      status: 503,
      code: 'CAPABILITIES_UNAVAILABLE',
    });
  });

  it('returns 404 when the platform kill switch or tenant state disables a capability', async () => {
    const disabled = new CapabilityResolver({
      DB: dbWith({ enabled: 0, config_json: '{}', epoch: 2 }),
    });
    const killed = new CapabilityResolver({
      DB: dbWith({ enabled: 1, config_json: '{}', epoch: 2 }),
      FEATURE_FUEL_STATION: '0',
    });

    await expect(disabled.require('tenant-a', 'fuel.dispatch')).rejects.toMatchObject({
      status: 404,
    });
    await expect(killed.require('tenant-a', 'fuel.dispatch')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('exposes optional capability state without converting unavailable state into enabled', async () => {
    await expect(
      isCapabilityEnabled(
        { DB: dbWith({ enabled: 0, config_json: '{}', epoch: 1 }) },
        'tenant-a',
        'sales.quotes',
      ),
    ).resolves.toBe(false);
    await expect(
      isCapabilityEnabled({ DB: dbWith(null, { rejects: true }) }, 'tenant-a', 'sales.quotes'),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('treats an unknown capability as unavailable even if a rogue row exists', async () => {
    const resolver = new CapabilityResolver({
      DB: dbWith({ enabled: 1, config_json: '{}', epoch: 2 }),
    });

    await expect(resolver.require('tenant-a', 'internal.secret')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('fails closed with 503 when capability state cannot be read', async () => {
    const resolver = new CapabilityResolver({
      DB: dbWith(null, { rejects: true }),
      FEATURE_ORDERS_KDS: '1',
    });

    await expect(resolver.require('tenant-a', 'orders.kds')).rejects.toMatchObject({ status: 503 });
  });

  it('fails closed when the tenant epoch is absent', async () => {
    const resolver = new CapabilityResolver({
      DB: dbWith({ enabled: 1, config_json: '{}', epoch: null }),
      FEATURE_ORDERS_KDS: '1',
    });

    await expect(resolver.require('tenant-a', 'orders.kds')).rejects.toMatchObject({ status: 503 });
  });

  it('rejects a stale caller epoch instead of accepting a session snapshot as authority', async () => {
    const resolver = new CapabilityResolver({
      DB: dbWith({ enabled: 1, config_json: '{}', epoch: 3 }),
      FEATURE_ORDERS_KDS: '1',
    });

    await expect(
      resolver.require('tenant-a', 'orders.kds', { expectedEpoch: 2 }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'CAPABILITY_EPOCH_STALE',
    });
  });
});
