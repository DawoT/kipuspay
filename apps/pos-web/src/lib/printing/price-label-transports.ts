export interface UsbDevicePort {
  readonly opened: boolean;
  readonly vendorId?: number;
  readonly productId?: number;
  open(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  transferOut(endpointNumber: number, data: Uint8Array): Promise<{ readonly status: string }>;
  releaseInterface(interfaceNumber: number): Promise<void>;
  close(): Promise<void>;
}

export interface SocketPort {
  send(data: Uint8Array | string): void;
  close(): void;
  addEventListener?(
    type: 'open' | 'message' | 'error' | 'close',
    listener: (event: { readonly data?: unknown }) => void,
    options?: { readonly once?: boolean },
  ): void;
}

export interface PriceLabelItemTransport {
  send(itemId: string, payload: Uint8Array): Promise<'ACK'>;
  reconnect?(): Promise<void>;
}

export function createPriceLabelTransportLadder(input: {
  readonly webusb?: PriceLabelItemTransport;
  readonly wss?: PriceLabelItemTransport;
  readonly systemPrint: (itemId: string, payload: Uint8Array) => Promise<void>;
  readonly messaging?: (itemId: string, payload: Uint8Array) => Promise<void>;
}) {
  return {
    async send(
      itemId: string,
      payload: Uint8Array,
    ): Promise<{
      readonly ack: 'ACK';
      readonly adapter: 'webusb' | 'wss_lan' | 'system_print' | 'messaging';
    }> {
      const attempts: [
        'webusb' | 'wss_lan' | 'system_print' | 'messaging',
        () => Promise<unknown>,
      ][] = [];
      if (input.webusb) attempts.push(['webusb', () => input.webusb!.send(itemId, payload)]);
      if (input.wss) attempts.push(['wss_lan', () => input.wss!.send(itemId, payload)]);
      attempts.push(['system_print', () => input.systemPrint(itemId, payload)]);
      if (input.messaging) {
        attempts.push(['messaging', () => input.messaging!(itemId, payload)]);
      }
      let lastError: unknown = new Error('PRINTER_ADAPTER_UNAVAILABLE');
      for (const [adapter, send] of attempts) {
        try {
          await send();
          return { ack: 'ACK', adapter };
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    },
  };
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number, code: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(code)), timeoutMs);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export function createPriceLabelWebUsbTransport(input: {
  readonly device: UsbDevicePort;
  readonly configurationValue: number;
  readonly interfaceNumber: number;
  readonly endpointNumber: number;
  readonly timeoutMs?: number;
  readonly allowedEndpoints?: readonly number[];
  readonly allowedProfiles?: readonly {
    readonly vendorId: number;
    readonly productId: number;
    readonly interfaceNumber: number;
    readonly endpointNumber: number;
  }[];
}): PriceLabelItemTransport {
  const allowed = input.allowedEndpoints ?? [input.endpointNumber];
  if (!allowed.includes(input.endpointNumber)) throw new Error('PRINTER_USB_ENDPOINT_NOT_ALLOWED');
  if (
    input.allowedProfiles &&
    !input.allowedProfiles.some(
      (profile) =>
        profile.vendorId === input.device.vendorId &&
        profile.productId === input.device.productId &&
        profile.interfaceNumber === input.interfaceNumber &&
        profile.endpointNumber === input.endpointNumber,
    )
  ) {
    throw new Error('PRINTER_USB_PROFILE_NOT_ALLOWED');
  }

  return {
    async send(_itemId, payload) {
      let claimed = false;
      try {
        if (!input.device.opened) await input.device.open();
        await input.device.selectConfiguration(input.configurationValue);
        await input.device.claimInterface(input.interfaceNumber);
        claimed = true;
        const result = await withTimeout(
          input.device.transferOut(input.endpointNumber, payload),
          input.timeoutMs ?? 10_000,
          'PRINTER_USB_TIMEOUT',
        );
        if (result.status !== 'ok') throw new Error(`PRINTER_USB_${result.status.toUpperCase()}`);
        return 'ACK';
      } finally {
        if (claimed) {
          await input.device.releaseInterface(input.interfaceNumber).catch(() => undefined);
        }
        await input.device.close().catch(() => undefined);
      }
    },
  };
}

export function createPriceLabelWssTransport(input: {
  readonly url: string;
  readonly allowlistedHosts: readonly string[];
  readonly socketFactory: (url: string) => SocketPort;
  readonly ackTimeoutMs?: number;
  readonly maxItemBytes?: number;
  readonly randomBytes?: (length: number) => Uint8Array;
}): PriceLabelItemTransport {
  const url = new URL(input.url);
  if (url.protocol !== 'wss:') throw new Error('PRINTER_WSS_REQUIRED');
  if (!input.allowlistedHosts.includes(url.hostname)) throw new Error('PRINTER_HOST_NOT_ALLOWED');

  let socket: SocketPort | null = null;
  let reconnectRequired = false;
  const connect = () => {
    socket = input.socketFactory(url.toString());
  };
  connect();

  return {
    send(itemId, payload) {
      if (reconnectRequired || !socket)
        return Promise.reject(new Error('PRINTER_RECONNECT_REQUIRED'));
      if (payload.byteLength > (input.maxItemBytes ?? 1_048_576)) {
        return Promise.reject(new Error('PRINTER_ITEM_TOO_LARGE'));
      }
      const activeSocket = socket;
      const nonceBytes = (input.randomBytes ?? secureRandomBytes)(16);
      if (nonceBytes.byteLength !== 16) {
        return Promise.reject(new Error('PRINTER_NONCE_INVALID'));
      }
      const nonce = bytesToHex(nonceBytes);
      const pending = new Promise<'ACK'>((resolve, reject) => {
        let settled = false;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) {
            reconnectRequired = true;
            activeSocket.close();
            reject(error);
          } else {
            resolve('ACK');
          }
        };
        const timer = setTimeout(
          () => finish(new Error('PRINTER_ACK_TIMEOUT')),
          input.ackTimeoutMs ?? 10_000,
        );
        activeSocket.addEventListener?.('message', (event) => {
          const raw =
            typeof event.data === 'string'
              ? event.data
              : event.data instanceof Uint8Array
                ? new TextDecoder().decode(event.data)
                : '';
          try {
            const ack = JSON.parse(raw) as {
              readonly type?: string;
              readonly itemId?: string;
              readonly nonce?: string;
            };
            if (ack.type === 'ACK' && ack.itemId === itemId && ack.nonce === nonce) finish();
          } catch {
            // An ACK is accepted only when it names this exact item.
          }
        });
        try {
          const idBytes = new TextEncoder().encode(itemId);
          if (idBytes.byteLength > 65_535) throw new Error('PRINTER_ITEM_ID_TOO_LARGE');
          const frame = new Uint8Array(
            4 + nonceBytes.byteLength + idBytes.byteLength + payload.byteLength,
          );
          frame[0] = 1;
          frame[1] = nonceBytes.byteLength;
          frame[2] = idBytes.byteLength >> 8;
          frame[3] = idBytes.byteLength & 0xff;
          frame.set(nonceBytes, 4);
          frame.set(idBytes, 4 + nonceBytes.byteLength);
          frame.set(payload, 4 + nonceBytes.byteLength + idBytes.byteLength);
          activeSocket.send(frame);
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      });
      // A transport timeout may fire before a caller attaches its await handler.
      // Mark it observed without changing the promise returned to the caller.
      void pending.catch(() => undefined);
      return pending;
    },
    reconnect() {
      if (socket) socket.close();
      reconnectRequired = false;
      connect();
      return Promise.resolve();
    },
  };
}

function secureRandomBytes(length: number): Uint8Array {
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
    throw new Error('PRINTER_SECURE_RANDOM_UNAVAILABLE');
  }
  return crypto.getRandomValues(new Uint8Array(length));
}

function bytesToHex(bytes: Uint8Array): string {
  let value = '';
  bytes.forEach((byte: number): void => {
    value += byte.toString(16).padStart(2, '0');
  });
  return value;
}
