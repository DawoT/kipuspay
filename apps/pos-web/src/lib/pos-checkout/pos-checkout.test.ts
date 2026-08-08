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

  it('agrupa por producto+UOM sin cruzar presentaciones', () => {
    const base = { ...line('a', 1000), uomId: 'u-base', enteredQuantityMicrounits: 1_000_000 };
    const pack = { ...line('a', 1000), uomId: 'u-pack', enteredQuantityMicrounits: 1_000_000 };
    const lines = addOrBumpLine(addOrBumpLine([], base), pack);
    expect(lines).toHaveLength(2);
    expect(addOrBumpLine(lines, base)[0]?.enteredQuantityMicrounits).toBe(2_000_000);
  });

  it('mantiene una línea por identidad serial y conserva su lease opaco', () => {
    const serialOne = {
      ...line('phone', 100_000),
      serialId: 'serial-1',
      // eslint-disable-next-line no-secrets/no-secrets -- opaque lease fixture, not a credential
      serialLeaseToken: 'opaque_kp_7FXQm19w',
    };
    const serialTwo = {
      ...line('phone', 100_000),
      serialId: 'serial-2',
      serialLeaseToken: 'opaque_kp_H4v2bL8q',
    };
    const lines = addOrBumpLine(addOrBumpLine([], serialOne), serialTwo);
    expect(lines).toHaveLength(2);
    expect(lines.map((item) => item.serialId)).toEqual(['serial-1', 'serial-2']);
    expect(lines.map((item) => item.serialLeaseToken)).toEqual([
      // eslint-disable-next-line no-secrets/no-secrets -- opaque lease fixture, not a credential
      'opaque_kp_7FXQm19w',
      'opaque_kp_H4v2bL8q',
    ]);
  });

  it('never merges repeated weighted lines and queues normalized measurement facts', async () => {
    const first = {
      ...line('apple', 100),
      saleItemId: 'line-weight-1',
      weightMeasurement: {
        measurementId: 'measure-1',
        weightMicrounits: 500_000,
        measurementSource: 'MANUAL' as const,
        observedAt: '2026-08-08T17:00:00.000Z',
      },
    };
    const second = {
      ...first,
      saleItemId: 'line-weight-2',
      weightMeasurement: { ...first.weightMeasurement, measurementId: 'measure-2' },
    };
    const lines = addOrBumpLine(addOrBumpLine([], first), second);
    expect(lines).toHaveLength(2);
    const queue = new OfflineQueueStore(createMemoryOfflineIdb());
    await chargeCartOffline(
      lines,
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
    );
    const pending = await queue.listPending();
    expect(pending[0]?.payload.items[0]).toMatchObject({
      saleItemId: 'line-weight-1',
      weightMeasurement: {
        measurementId: 'measure-1',
        weightMicrounits: 500_000,
        measurementSource: 'MANUAL',
      },
    });
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
