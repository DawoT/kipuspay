import { describe, expect, it } from 'vitest';
import { OfflineCorrelativeStore } from './reserve.js';

describe('offline-correlative', () => {
  it('reserva tentativa; server number gana', () => {
    const store = new OfflineCorrelativeStore(5);
    const r = store.reserve('off-1', 'NV01');
    expect(r.tentativeNumber).toBe(5);
    expect(store.reserve('off-1', 'NV01').tentativeNumber).toBe(5);

    const recon = store.reconcile({
      offlineSaleId: 'off-1',
      status: 'SUCCESS',
      authoritativeNumber: 12,
    });
    expect(recon.ok).toBe(true);
    expect(recon.code).toBe('SERVER_NUMBER_WINS');
    expect(recon.authoritativeNumber).toBe(12);
    expect(store.get('off-1')).toBeUndefined();
  });

  it('FAILED no confirma', () => {
    const store = new OfflineCorrelativeStore();
    store.reserve('off-2', 'NV01');
    expect(store.reconcile({ offlineSaleId: 'off-2', status: 'FAILED' }).ok).toBe(false);
  });
});
