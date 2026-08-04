import { describe, expect, it } from 'vitest';
import { createMemoryOfflineIdb, OfflineQueueStore } from '../offline-sync/offline-queue.js';
import { addOrBumpLine, cartTotalCents, type CartLine } from './cart.js';
import { chargeCartOffline, p95 } from './charge.js';

const line = (id: string, price: number, qty = 1): CartLine => ({
  productId: id,
  name: id,
  unitPriceCents: price,
  quantity: qty,
});

describe('pos-checkout cart', () => {
  it('suma cents y bump líneas', () => {
    const lines = addOrBumpLine([line('a', 1000)], line('a', 1000));
    expect(cartTotalCents(lines)).toBe(2000);
  });
});

describe('chargeCartOffline', () => {
  it('encola sin spinner de red; feedback <100ms p95', async () => {
    const queue = new OfflineQueueStore(createMemoryOfflineIdb());
    const samples: number[] = [];
    for (let i = 0; i < 40; i++) {
      const outcome = await chargeCartOffline(
        [line('p1', 1000)],
        {
          formalizationMode: 'INTERNAL_CONTROL',
          taxRegime: 'RG',
          branchId: 'b1',
          cashRegisterSessionId: 's1',
          series: 'NV01',
          clientDocumentType: '1',
          clientDocumentNumber: '00000000',
          clientName: 'Cliente',
          paymentMethodId: 'pm1',
        },
        queue,
        Date.now(),
        () => `off-${i}`,
      );
      expect(outcome.ok).toBe(true);
      if (outcome.ok) samples.push(outcome.feedbackMs);
    }
    expect(p95(samples)).toBeLessThan(100);
    expect((await queue.listPending()).length).toBe(40);
  });

  it('bloquea boleta ≥700 sin DNI', async () => {
    const queue = new OfflineQueueStore(createMemoryOfflineIdb());
    const outcome = await chargeCartOffline(
      [line('p1', 70_000)],
      {
        formalizationMode: 'ELECTRONIC_ISSUER',
        taxRegime: 'RG',
        branchId: 'b1',
        cashRegisterSessionId: 's1',
        series: 'B001',
        clientDocumentType: '',
        clientDocumentNumber: '',
        clientName: '',
        paymentMethodId: 'pm1',
        documentTypeOverride: '03',
      },
      queue,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('BOLETA_ID_REQUIRED');
    expect((await queue.listPending()).length).toBe(0);
  });

  it('NV_RETURN override encola', async () => {
    const queue = new OfflineQueueStore(createMemoryOfflineIdb());
    const outcome = await chargeCartOffline(
      [line('p1', 1000)],
      {
        formalizationMode: 'INTERNAL_CONTROL',
        taxRegime: 'RG',
        branchId: 'b1',
        cashRegisterSessionId: 's1',
        series: 'NV01',
        clientDocumentType: '1',
        clientDocumentNumber: '00000000',
        clientName: 'Cliente',
        paymentMethodId: 'pm1',
        documentTypeOverride: 'NV_RETURN',
      },
      queue,
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.documentType).toBe('NV_RETURN');
  });

  it('carrito vacío y CPE bloqueado en control interno', async () => {
    const queue = new OfflineQueueStore(createMemoryOfflineIdb());
    const empty = await chargeCartOffline(
      [],
      {
        formalizationMode: 'INTERNAL_CONTROL',
        taxRegime: 'RG',
        branchId: 'b1',
        cashRegisterSessionId: 's1',
        series: 'NV01',
        clientDocumentType: '1',
        clientDocumentNumber: '12345678',
        clientName: 'A',
        paymentMethodId: 'pm1',
      },
      queue,
    );
    expect(empty.ok).toBe(false);

    const cpe = await chargeCartOffline(
      [line('p1', 1000)],
      {
        formalizationMode: 'INTERNAL_CONTROL',
        taxRegime: 'RG',
        branchId: 'b1',
        cashRegisterSessionId: 's1',
        series: 'B001',
        clientDocumentType: '1',
        clientDocumentNumber: '12345678',
        clientName: 'A',
        paymentMethodId: 'pm1',
        documentTypeOverride: '03',
      },
      queue,
    );
    expect(cpe.ok).toBe(false);
    if (!cpe.ok) expect(cpe.code).toBe('CPE_BLOCKED_INTERNAL_CONTROL');
  });
});
