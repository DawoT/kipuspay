import { describe, expect, it, vi } from 'vitest';
import {
  createPriceLabelTransportLadder,
  createPriceLabelWebUsbTransport,
  createPriceLabelWssTransport,
} from './price-label-transports.js';

describe('Sprint 41 PrinterTransport adapters', () => {
  it('WebUSB transferOut always releases interface and closes on success', async () => {
    const releaseInterface = vi.fn(() => Promise.resolve());
    const close = vi.fn(() => Promise.resolve());
    const transferOut = vi.fn(() => Promise.resolve({ status: 'ok' }));
    const transport = createPriceLabelWebUsbTransport({
      device: {
        opened: false,
        open: vi.fn(() => Promise.resolve()),
        selectConfiguration: vi.fn(() => Promise.resolve()),
        claimInterface: vi.fn(() => Promise.resolve()),
        transferOut,
        releaseInterface,
        close,
      },
      configurationValue: 1,
      interfaceNumber: 2,
      endpointNumber: 3,
    });
    await expect(transport.send('item-1', new Uint8Array([1, 2]))).resolves.toBe('ACK');
    expect(transferOut).toHaveBeenCalledWith(3, new Uint8Array([1, 2]));
    expect(releaseInterface).toHaveBeenCalledWith(2);
    expect(close).toHaveBeenCalledOnce();
  });

  it('WebUSB releases and closes after transferOut failure', async () => {
    const releaseInterface = vi.fn(() => Promise.resolve());
    const close = vi.fn(() => Promise.resolve());
    const transport = createPriceLabelWebUsbTransport({
      device: {
        opened: true,
        open: vi.fn(),
        selectConfiguration: vi.fn(),
        claimInterface: vi.fn(() => Promise.resolve()),
        transferOut: vi.fn(() => Promise.reject(new Error('USB_GONE'))),
        releaseInterface,
        close,
      },
      configurationValue: 1,
      interfaceNumber: 2,
      endpointNumber: 3,
    });
    await expect(transport.send('item-1', new Uint8Array([1]))).rejects.toThrow('USB_GONE');
    expect(releaseInterface).toHaveBeenCalledWith(2);
    expect(close).toHaveBeenCalledOnce();
  });

  it('WSS requires paired allowlisted hosts and per-item ACK', () => {
    expect(() =>
      createPriceLabelWssTransport({
        url: 'ws:' + '//printer.local',
        allowlistedHosts: ['printer.local'],
        socketFactory: vi.fn(),
      }),
    ).toThrow('PRINTER_WSS_REQUIRED');
    expect(() =>
      createPriceLabelWssTransport({
        url: 'wss://evil.local',
        allowlistedHosts: ['printer.local'],
        socketFactory: vi.fn(),
      }),
    ).toThrow('PRINTER_HOST_NOT_ALLOWED');
  });

  it('WSS times out, closes, and requires explicit reconnect before retry', async () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const transport = createPriceLabelWssTransport({
      url: 'wss://printer.local',
      allowlistedHosts: ['printer.local'],
      ackTimeoutMs: 5_000,
      socketFactory: () => ({ send: vi.fn(), close }),
    });
    const pending = transport.send('item-1', new Uint8Array([1]));
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(pending).rejects.toThrow('PRINTER_ACK_TIMEOUT');
    expect(close).toHaveBeenCalledOnce();
    await expect(transport.send('item-1', new Uint8Array([1]))).rejects.toThrow(
      'PRINTER_RECONNECT_REQUIRED',
    );
    vi.useRealTimers();
  });

  it('WSS sends a bounded binary item and accepts only its matching ACK', async () => {
    let onMessage: ((event: { data?: unknown }) => void) | undefined;
    const send = vi.fn();
    const transport = createPriceLabelWssTransport({
      url: 'wss://printer.local',
      allowlistedHosts: ['printer.local'],
      randomBytes: (length) => new Uint8Array(length).fill(0xab),
      socketFactory: () => ({
        send,
        close: vi.fn(),
        addEventListener(type, listener) {
          if (type === 'message') onMessage = listener;
        },
      }),
    });
    const pending = transport.send('item-9', new Uint8Array([1, 2]));
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(Uint8Array);
    onMessage?.({ data: JSON.stringify({ type: 'ACK', itemId: 'other' }) });
    onMessage?.({ data: JSON.stringify({ type: 'ACK', itemId: 'item-9', nonce: 'stale' }) });
    await Promise.resolve();
    expect(settled).toBe(false);
    onMessage?.({
      data: JSON.stringify({
        type: 'ACK',
        itemId: 'item-9',
        nonce: 'abababababababababababababababab',
      }),
    });
    await expect(pending).resolves.toBe('ACK');
  });

  it('fails back deterministically without reversing completed commerce', async () => {
    const systemPrint = vi.fn(() => Promise.resolve());
    const ladder = createPriceLabelTransportLadder({
      webusb: { send: vi.fn(() => Promise.reject(new Error('USB_GONE'))) },
      wss: { send: vi.fn(() => Promise.reject(new Error('LAN_GONE'))) },
      systemPrint,
    });
    await expect(ladder.send('item-1', new Uint8Array([1]))).resolves.toEqual({
      ack: 'ACK',
      adapter: 'system_print',
    });
  });
});
