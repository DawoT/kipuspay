import { describe, expect, it } from 'vitest';
import {
  adjustProfileTimestampMs,
  consolidateLocalClientProfiles,
  planCrmLww,
  PROFILE_SKEW_MS,
} from './crm-lww.js';

describe('crm-lww SYN-08', () => {
  const base = {
    clientDocumentType: '1',
    clientDocumentNumber: '12345678',
    clientName: 'Ana',
    clientEmail: 'a@example.com',
  };

  it('SKIP_ANONYMOUS para 00000000', () => {
    expect(
      planCrmLww({ ...base, clientDocumentNumber: '00000000' }, null, 1_000_000, 'c1').kind,
    ).toBe('SKIP_ANONYMOUS');
  });

  it('BLOCK_ERASED si pii_erased o deleted', () => {
    expect(
      planCrmLww(
        base,
        {
          id: 'c1',
          profileUpdatedAtIso: '2026-01-01T00:00:00.000Z',
          piiErased: true,
          deleted: false,
        },
        1_000_000,
        'c2',
      ).kind,
    ).toBe('BLOCK_ERASED');
    expect(
      planCrmLww(
        base,
        {
          id: 'c1',
          profileUpdatedAtIso: '2026-01-01T00:00:00.000Z',
          piiErased: false,
          deleted: true,
        },
        1_000_000,
        'c2',
      ).kind,
    ).toBe('BLOCK_ERASED');
  });

  it('rechaza timestamp no finito; SKIP doc vacío', () => {
    expect(() => adjustProfileTimestampMs(Number.NaN, 1_000_000)).toThrow(
      /INVALID_PROFILE_TIMESTAMP/,
    );
    expect(planCrmLww({ ...base, clientDocumentNumber: '   ' }, null, 1_000_000, 'c1').kind).toBe(
      'SKIP_ANONYMOUS',
    );
  });

  it('INSERT si no existe; UPDATE si timestamp gana; KEEP si pierde', () => {
    const now = Date.parse('2026-08-04T12:00:00.000Z');
    expect(planCrmLww(base, null, now, 'new-id')).toEqual({
      kind: 'INSERT',
      customerId: 'new-id',
      profileUpdatedAtIso: new Date(now).toISOString(),
    });

    const older = planCrmLww(
      { ...base, clientProfileUpdatedAt: '2026-08-04T11:00:00.000Z' },
      {
        id: 'c1',
        profileUpdatedAtIso: '2026-08-04T10:00:00.000Z',
        piiErased: false,
        deleted: false,
      },
      now,
      'x',
    );
    expect(older.kind).toBe('UPDATE');

    const keep = planCrmLww(
      { ...base, clientProfileUpdatedAt: '2026-08-04T09:00:00.000Z' },
      {
        id: 'c1',
        profileUpdatedAtIso: '2026-08-04T11:00:00.000Z',
        piiErased: false,
        deleted: false,
      },
      now,
      'x',
    );
    expect(keep).toEqual({ kind: 'KEEP', customerId: 'c1' });
  });

  it('clampa skew ±6h', () => {
    const now = 1_000_000;
    expect(adjustProfileTimestampMs(now + PROFILE_SKEW_MS + 1000, now)).toBe(now + PROFILE_SKEW_MS);
  });

  it('consolidateLocalClientProfiles: último timestamp gana', () => {
    const sales = [
      {
        offlineSaleId: 'a',
        localClientId: 'L1',
        clientName: 'Old',
        clientProfileUpdatedAt: '2026-08-01T10:00:00.000Z',
      },
      {
        offlineSaleId: 'b',
        localClientId: 'L1',
        clientName: 'New',
        clientProfileUpdatedAt: '2026-08-01T12:00:00.000Z',
      },
      { offlineSaleId: 'c', clientName: 'Solo' },
    ];
    const out = consolidateLocalClientProfiles(sales);
    expect(out[0]?.clientName).toBe('New');
    expect(out[1]?.clientName).toBe('New');
    expect(out[2]?.clientName).toBe('Solo');
  });

  it('consolidate: perfil viejo no pisa al ganador; clamp inferior skew', () => {
    const now = 1_000_000;
    expect(adjustProfileTimestampMs(now - PROFILE_SKEW_MS - 5000, now)).toBe(now - PROFILE_SKEW_MS);
    const sales = [
      {
        offlineSaleId: 'a',
        localClientId: 'L1',
        clientName: 'Winner',
        clientProfileUpdatedAt: '2026-08-01T14:00:00.000Z',
      },
      {
        offlineSaleId: 'b',
        localClientId: 'L1',
        clientName: 'Stale',
        clientProfileUpdatedAt: '2026-08-01T10:00:00.000Z',
      },
    ];
    const out = consolidateLocalClientProfiles(sales);
    expect(out[0]?.clientName).toBe('Winner');
    expect(out[1]?.clientName).toBe('Winner');
  });

  it('UPDATE si existing.profile_updated_at inválido', () => {
    const now = Date.parse('2026-08-04T12:00:00.000Z');
    const plan = planCrmLww(
      { ...base, clientProfileUpdatedAt: '2026-08-04T11:00:00.000Z' },
      {
        id: 'c1',
        profileUpdatedAtIso: 'not-a-date',
        piiErased: false,
        deleted: false,
      },
      now,
      'x',
    );
    expect(plan.kind).toBe('UPDATE');
  });
});
