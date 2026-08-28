import { describe, expect, it, vi } from 'vitest';
import { LanWssPrinterStrategy } from './lan-wss-printer-strategy.js';
import type { SocketPort } from './price-label-transports.js';

describe('LanWssPrinterStrategy (§10 adapter)', () => {
  it('rechaza protocolo no wss:// fail-closed', () => {
    expect(() => new LanWssPrinterStrategy('ws://printer.local')).toThrow(/PRINTER_WSS_REQUIRED/);
    expect(() => new LanWssPrinterStrategy('https://printer.local')).toThrow(
      /PRINTER_WSS_REQUIRED/,
    );
  });

  it('envía bytes ESC/POS vía WSS con ACK por nonce', async () => {
    let onMessage: ((e: { data?: unknown }) => void) | undefined;
    const send = vi.fn();
    const strat = new LanWssPrinterStrategy('wss://printer.local/escpos', {
      allowlistedHosts: ['printer.local'],
      socketFactory: (): SocketPort => ({
        send,
        close: vi.fn(),
        addEventListener(type, l) {
          if (type === 'message') onMessage = l;
        },
      }),
      randomBytes: (n: number) => new Uint8Array(n).fill(0xcc),
    });
    const bytes = new Uint8Array([0x1b, 0x40, 0x1d, 0x56, 0x42]);
    const pending = strat.print('ITEM-1', bytes);
    await new Promise((r) => setTimeout(r, 0));
    expect(send).toHaveBeenCalledOnce();
    onMessage?.({
      data: JSON.stringify({ type: 'ACK', itemId: 'ITEM-1', nonce: 'cc'.repeat(16) }),
    });
    await expect(pending).resolves.toBe('ACK');
  });

  it('rechaza host no allowlisted', async () => {
    const strat = new LanWssPrinterStrategy('wss://printer.local/escpos', {
      allowlistedHosts: ['other.local'],
      socketFactory: () => ({ send: vi.fn(), close: vi.fn() }) as unknown as SocketPort,
    });
    await expect(strat.print('x', new Uint8Array([1]))).rejects.toThrow(/PRINTER_HOST_NOT_ALLOWED/);
  });
});
