/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion -- port abstraction */
/**
 * LanWssPrinterStrategy (§10) — adapter WSS LAN para tickets ESC/POS.
 * Valida wss://, reusa createPriceLabelWssTransport (ACK por nonce), sin duplicar bytes.
 * Cada instancia es un adapter: el orquestador elige sin if en cascada.
 */
import { createPriceLabelWssTransport, type SocketPort } from './price-label-transports.js';

export interface LanWssPrintEnv {
  readonly socketFactory?: (url: string) => SocketPort;
  readonly allowlistedHosts?: readonly string[];
  readonly randomBytes?: (len: number) => Uint8Array;
}

export class LanWssPrinterStrategy {
  private readonly url: URL;
  constructor(
    private readonly wssPrinterUrl: string,
    private readonly env: LanWssPrintEnv = {},
  ) {
    const u = new URL(wssPrinterUrl);
    if (u.protocol !== 'wss:') throw new Error('PRINTER_WSS_REQUIRED');
    this.url = u;
  }

  /** Envía bytes ESC/POS ya compilados por print-templates (zero-dep). */
  async print(itemId: string, bytes: Uint8Array): Promise<'ACK'> {
    const hosts = this.env.allowlistedHosts ?? [];
    if (hosts.length && !hosts.includes(this.url.hostname)) {
      throw new Error('PRINTER_HOST_NOT_ALLOWED');
    }
    const factory =
      this.env.socketFactory ?? ((url: string) => new WebSocket(url) as unknown as SocketPort);
    const transport = createPriceLabelWssTransport({
      url: this.url.toString(),
      allowlistedHosts: hosts.length ? hosts : [this.url.hostname],
      socketFactory: factory,
      ...(this.env.randomBytes ? { randomBytes: this.env.randomBytes } : {}),
    });
    return transport.send(itemId, bytes);
  }
}
