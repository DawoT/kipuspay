import { describe, expect, it, vi } from 'vitest';
import { createMemoryOfflineIdb, OfflineQueueStore } from '../offline-sync/offline-queue.js';
import { chargeCartOffline } from './charge.js';
import { leaseScannedSerialLine, normalizeSerialScannerInput } from './serial-client.js';

describe('serial checkout client', () => {
  it('normalizes keyboard scanner input exactly like the server identity', () => {
    expect(normalizeSerialScannerInput('  sn-００１\r\n')).toBe('SN-001');
  });

  it('searches AVAILABLE, acquires for the registered terminal, and returns one cart unit', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                serial_id: 'serial-1',
                serial_number: 'SN-001',
                product_id: 'p1',
                status: 'AVAILABLE',
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            leaseToken: 'opaque_test_token_1234',
            replayed: false,
          }),
          { status: 201 },
        ),
      );

    const line = await leaseScannedSerialLine({
      rawSerial: ' sn-001 ',
      terminalId: 'terminal-1',
      apiBase: 'https://api.example.test/',
      authorization: 'Bearer test',
      fetcher,
      idFactory: () => 'lease-attempt-1',
      resolveProduct: (productId) =>
        productId === 'p1' ? { productId, name: 'Teléfono', unitPriceCents: 100_000 } : undefined,
    });

    const searchCall = fetcher.mock.calls[0];
    if (typeof searchCall?.[0] !== 'string') throw new Error('Expected string URL');
    const searchUrl = new URL(searchCall[0]);
    expect(searchUrl.searchParams.get('serialNumber')).toBe('SN-001');
    expect(searchUrl.searchParams.get('status')).toBe('AVAILABLE');
    expect(new Headers(searchCall?.[1]?.headers).get('authorization')).toBe('Bearer test');
    const leaseCall = fetcher.mock.calls[1];
    expect(leaseCall?.[0]).toBe('https://api.example.test/api/inventory/serials/leases');
    expect(leaseCall?.[1]?.method).toBe('POST');
    expect(new Headers(leaseCall?.[1]?.headers).get('x-terminal-id')).toBe('terminal-1');
    expect(line).toEqual({
      productId: 'p1',
      name: 'Teléfono',
      unitPriceCents: 100_000,
      quantity: 1,
      serialId: 'serial-1',
      serialLeaseToken: 'opaque_test_token_1234',
    });
  });

  it('surfaces actionable 422 without leaking a lease token', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'SERIAL_LEASED_BY_OTHER_TERMINAL',
          error: 'SERIAL_LEASED_BY_OTHER_TERMINAL',
          action: 'Libera la serie desde el terminal que la reservó.',
        }),
        { status: 422 },
      ),
    );

    await expect(
      leaseScannedSerialLine({
        rawSerial: 'SN-001',
        terminalId: 'terminal-2',
        apiBase: 'https://api.example.test',
        authorization: 'Bearer test',
        fetcher,
        resolveProduct: () => undefined,
      }),
    ).rejects.toMatchObject({
      status: 422,
      code: 'SERIAL_LEASED_BY_OTHER_TERMINAL',
      message: 'SERIAL_LEASED_BY_OTHER_TERMINAL Libera la serie desde el terminal que la reservó.',
    });
  });

  it('preserves serial identity and opaque lease in the offline queue', async () => {
    const queue = new OfflineQueueStore(createMemoryOfflineIdb());
    const outcome = await chargeCartOffline(
      [
        {
          productId: 'p1',
          name: 'Teléfono',
          unitPriceCents: 100_000,
          quantity: 1,
          serialId: 'serial-1',
          serialLeaseToken: 'opaque_test_token_1234',
        },
      ],
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
      () => 'off-serial',
    );

    expect(outcome.ok).toBe(true);
    const queued = await queue.listPending();
    expect(queued[0]?.payload.items[0]).toMatchObject({
      serialId: 'serial-1',
      serialLeaseToken: 'opaque_test_token_1234',
      quantity: 1,
    });
  });
});
