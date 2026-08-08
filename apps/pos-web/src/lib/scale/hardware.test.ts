import { describe, expect, it, vi } from 'vitest';
import { createWebHidScale } from './webhid.js';
import { createWebSerialScale, serialFixture } from './web-serial.js';
import { createWebUsbScale } from './webusb.js';

describe('injectable scale transports', () => {
  it('validates WebHID profile/report and releases the device on disconnect', async () => {
    const close = vi.fn(() => Promise.resolve());
    const scale = createWebHidScale({
      profile: { deviceId: 'hid-1', vendorId: 1, productId: 2, reportId: 3 },
      transport: { vendorId: 1, productId: 2, close },
    });
    const reading = scale.parseReport(3, new Uint8Array([1, 0, 0, 2, 238]), 10);
    expect(reading).toMatchObject({
      protocol: 'WEBHID',
      deviceId: 'hid-1',
      stable: true,
      weightMicrounits: 750_000,
    });
    expect(() => scale.parseReport(4, new Uint8Array([1, 0, 0, 2, 238]), 11)).toThrow(
      'SCALE_REPORT_NOT_ALLOWED',
    );
    await scale.disconnect();
    expect(close).toHaveBeenCalledOnce();
  });

  it('frames bounded CDC ASCII, validates checksum and requires explicit reconnect', async () => {
    const close = vi.fn(() => Promise.resolve());
    const scale = createWebSerialScale({
      profile: { deviceId: 'serial-1', baudRate: 9600, maxFrameBytes: 64 },
      transport: { close },
    });
    expect(scale.parseChunk(serialFixture(750, true), 20)).toMatchObject({
      protocol: 'WEB_SERIAL',
      stable: true,
      weightMicrounits: 750_000,
    });
    expect(() => scale.parseChunk(new TextEncoder().encode('ST,GS,+000750 g*00\r\n'), 21)).toThrow(
      'SCALE_CHECKSUM_INVALID',
    );
    await scale.disconnect();
    expect(() => scale.parseChunk(serialFixture(500, true), 22)).toThrow(
      'SCALE_RECONNECT_REQUIRED',
    );
  });

  it('validates WebUSB vendor endpoint and rejects unstable or oversized frames', () => {
    const scale = createWebUsbScale({
      profile: {
        deviceId: 'usb-1',
        vendorId: 10,
        productId: 20,
        endpoint: 1,
        maxFrameBytes: 16,
      },
      transport: { vendorId: 10, productId: 20, close: () => Promise.resolve() },
    });
    expect(scale.parseTransfer(1, new Uint8Array([1, 0, 0, 0, 0, 7, 161, 32]), 30)).toMatchObject({
      protocol: 'WEBUSB',
      weightMicrounits: 500_000,
      stable: true,
    });
    expect(() => scale.parseTransfer(1, new Uint8Array([0, 0, 0, 0, 0, 7, 161, 32]), 31)).toThrow(
      'SCALE_SIGNAL_UNSTABLE',
    );
    expect(() => scale.parseTransfer(2, new Uint8Array([1]), 32)).toThrow(
      'SCALE_ENDPOINT_NOT_ALLOWED',
    );
  });
});
