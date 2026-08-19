/**
 * C7: la ladder de tickets (PrinterTransport) debe imprimir por transportes
 * reales WebUSB/WSS (reusa los factories probados de price-labels, §5.8),
 * no por stubs que siempre fallan.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrintTicketSnapshot } from '@kipuspay/print-templates';
import { createPrinterTransport } from './printer-transport.js';
import type { SocketPort, UsbDevicePort } from '../printing/price-label-transports.js';

const snap: PrintTicketSnapshot = {
  enterprise: 'Tienda',
  ruc: '20111111111',
  documentType: '03',
  series: 'B001',
  number: 1,
  totalCents: 100,
  items: [{ name: 'A', qty: 1, totalCents: 100 }],
  lineWidth: 32,
};

type UsbDeviceMock = ReturnType<typeof vi.fn>;
type UsbDeviceOverrides = Partial<
  UsbDeviceMockFns & {
    readonly opened?: boolean;
    readonly vendorId?: number;
    readonly productId?: number;
  }
>;

function usbDevice(over: UsbDeviceOverrides = {}): {
  device: UsbDevicePort;
  mocks: UsbDeviceMockFns;
} {
  const mocks: UsbDeviceMockFns = {
    open: vi.fn(() => Promise.resolve()),
    selectConfiguration: vi.fn(() => Promise.resolve()),
    claimInterface: vi.fn(() => Promise.resolve()),
    transferOut: vi.fn(() => Promise.resolve({ status: 'ok' })),
    releaseInterface: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  };
  const device = { opened: false, ...mocks, ...over } as unknown as UsbDevicePort;
  return { device, mocks };
}

interface UsbDeviceMockFns {
  open: UsbDeviceMock;
  selectConfiguration: UsbDeviceMock;
  claimInterface: UsbDeviceMock;
  transferOut: UsbDeviceMock;
  releaseInterface: UsbDeviceMock;
  close: UsbDeviceMock;
}

describe('C7 ladder de tickets con transportes reales', () => {
  it('WebUSB real: transferOut ACK, libera y cierra el device', async () => {
    const { device, mocks } = usbDevice();
    const t = createPrinterTransport({ usbDevice: device });
    const res = await t.print({ ticket: snap, escPosBase64: 'AA==' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.adapter).toBe('webusb');
    expect(mocks.claimInterface).toHaveBeenCalled();
    expect(mocks.transferOut).toHaveBeenCalledWith(expect.any(Number), expect.any(Uint8Array));
    expect(mocks.releaseInterface).toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('WebUSB falla limpio y la ladder continúa hasta WhatsApp', async () => {
    const { device } = usbDevice({
      transferOut: vi.fn(() => Promise.reject(new Error('USB_GONE'))),
    });
    const t = createPrinterTransport({
      usbDevice: device,
      whatsappFallback: () => Promise.resolve(true),
    });
    const res = await t.print({ ticket: snap, escPosBase64: 'AA==' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.adapter).toBe('whatsapp');
  });

  it('WSS real: exige host allowlisted y ACK por nonce', async () => {
    let onMessage: ((event: { data?: unknown }) => void) | undefined;
    const send = vi.fn();
    const t = createPrinterTransport({
      wssUrl: 'wss://printer.local/escpos',
      allowlistedHosts: ['printer.local'],
      randomBytes: (length: number) => new Uint8Array(length).fill(0xab),
      socketFactory: (url: string): SocketPort => {
        expect(url).toContain('wss://');
        return {
          send,
          close: vi.fn(),
          addEventListener(type, listener) {
            if (type === 'message') onMessage = listener;
          },
        };
      },
    });
    const pending = t.print({ ticket: snap, escPosBase64: 'AA==' });
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await flush();
    expect(send).toHaveBeenCalledOnce();
    onMessage?.({ data: JSON.stringify({ type: 'ACK', itemId: 'wrong' }) });
    await flush();
    expect(settled).toBe(false);
    onMessage?.({
      data: JSON.stringify({
        type: 'ACK',
        itemId: '03:B001:1',
        nonce: 'abababababababababababababababab',
      }),
    });
    const res = await pending;
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.adapter).toBe('wss_lan');
  });

  it('WSS rechaza host no allowlisted antes de enviar', async () => {
    const t = createPrinterTransport({
      wssUrl: 'wss://evil.local/escpos',
      allowlistedHosts: ['printer.local'],
      socketFactory: () => ({ send: vi.fn(), close: vi.fn() }),
    });
    const res = await t.print({ ticket: snap, escPosBase64: 'AA==' });
    expect(res.ok).toBe(false);
  });

  it('preflight lista webusb/wss_lan cuando hay device/socket reales', async () => {
    const t = createPrinterTransport({
      usbDevice: usbDevice().device,
      wssUrl: 'wss://printer.local/escpos',
      allowlistedHosts: ['printer.local'],
      socketFactory: () => ({ send: vi.fn(), close: vi.fn() }),
    });
    const avail = await t.preflight();
    expect(avail).toContain('webusb');
    expect(avail).toContain('wss_lan');
  });
});

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
