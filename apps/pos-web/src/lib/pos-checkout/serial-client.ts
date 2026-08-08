/** Browser client for Sprint 39 serial search + terminal-exclusive lease acquisition. */
import type { CartLine } from './cart.js';

interface SerialSearchRow {
  readonly serial_id: string;
  readonly serial_number: string;
  readonly product_id: string;
  readonly status: string;
}

interface ProductForCart {
  readonly productId: string;
  readonly name: string;
  readonly unitPriceCents: number;
}

export interface LeaseScannedSerialInput {
  readonly rawSerial: string;
  readonly terminalId: string;
  readonly apiBase: string;
  readonly authorization: string;
  readonly fetcher?: typeof fetch;
  readonly idFactory?: () => string;
  readonly resolveProduct: (productId: string) => ProductForCart | undefined;
}

export class SerialCheckoutError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'SerialCheckoutError';
    this.status = status;
    this.code = code;
  }
}

export function normalizeSerialScannerInput(raw: string): string {
  return raw.trim().normalize('NFKC').toUpperCase();
}

function objectBody(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  try {
    return objectBody(await response.json());
  } catch {
    return {};
  }
}

function textField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : '';
}

function toCheckoutError(response: Response, body: Record<string, unknown>): SerialCheckoutError {
  const code = textField(body, 'code') || `HTTP_${response.status}`;
  const error = textField(body, 'error') || code;
  const action = textField(body, 'action');
  return new SerialCheckoutError(response.status, code, action ? `${error} ${action}` : error);
}

function firstSerial(body: Record<string, unknown>): SerialSearchRow | undefined {
  const items = body.items;
  if (!Array.isArray(items)) return undefined;
  const first = objectBody(items[0]);
  const row: SerialSearchRow = {
    serial_id: textField(first, 'serial_id'),
    serial_number: textField(first, 'serial_number'),
    product_id: textField(first, 'product_id'),
    status: textField(first, 'status'),
  };
  return row.serial_id && row.product_id && row.status === 'AVAILABLE' ? row : undefined;
}

export async function leaseScannedSerialLine(input: LeaseScannedSerialInput): Promise<CartLine> {
  const serialNumber = normalizeSerialScannerInput(input.rawSerial);
  const terminalId = input.terminalId.trim();
  if (!serialNumber) {
    throw new SerialCheckoutError(400, 'SERIAL_NUMBER_REQUIRED', 'Escanea un número de serie.');
  }
  if (!terminalId) {
    throw new SerialCheckoutError(
      400,
      'TERMINAL_ID_REQUIRED',
      'Registra este terminal antes de reservar una serie.',
    );
  }

  const fetcher = input.fetcher ?? fetch;
  const apiBase = input.apiBase.replace(/\/$/, '');
  const query = new URLSearchParams({ serialNumber, status: 'AVAILABLE' });
  const searchResponse = await fetcher(`${apiBase}/api/inventory/serials?${query}`, {
    headers: { authorization: input.authorization },
  });
  const searchBody = await responseBody(searchResponse);
  if (!searchResponse.ok) throw toCheckoutError(searchResponse, searchBody);
  const serial = firstSerial(searchBody);
  if (!serial) {
    throw new SerialCheckoutError(
      422,
      'SERIAL_NOT_AVAILABLE',
      'Serie no disponible. Revisa su estado o escanea otra unidad.',
    );
  }

  const product = input.resolveProduct(serial.product_id);
  if (!product) {
    throw new SerialCheckoutError(
      422,
      'SERIAL_PRODUCT_UNAVAILABLE',
      'El producto de esta serie no está disponible en el catálogo de caja. Actualiza el catálogo.',
    );
  }

  const leaseResponse = await fetcher(`${apiBase}/api/inventory/serials/leases`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: input.authorization,
      'x-terminal-id': terminalId,
    },
    body: JSON.stringify({
      serialId: serial.serial_id,
      idempotencyKey: input.idFactory?.() ?? crypto.randomUUID(),
    }),
  });
  const leaseBody = await responseBody(leaseResponse);
  if (!leaseResponse.ok) throw toCheckoutError(leaseResponse, leaseBody);
  const leaseToken = textField(leaseBody, 'leaseToken');
  if (!leaseToken.startsWith('opaque_') || leaseToken === serial.serial_id) {
    throw new SerialCheckoutError(
      502,
      'INVALID_SERIAL_LEASE_TOKEN',
      'El servidor no entregó un lease válido. No agregues esta unidad.',
    );
  }

  return {
    productId: product.productId,
    name: product.name,
    unitPriceCents: product.unitPriceCents,
    quantity: 1,
    serialId: serial.serial_id,
    serialLeaseToken: leaseToken,
  };
}
