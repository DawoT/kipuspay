const encoder = new TextEncoder();
const decoder = new TextDecoder();
const consumedReceipts = new Set<string>();
let localReceiptKey: Promise<CryptoKey> | undefined;

function receiptError(code: string): Error {
  const error = new Error(code);
  error.name = 'PushReceiptError';
  return error;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    throw receiptError('PUSH_ACK_INVALID');
  }
}

async function defaultKey(): Promise<CryptoKey> {
  localReceiptKey ??= crypto.subtle.importKey(
    'raw',
    crypto.getRandomValues(new Uint8Array(32)),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
  return localReceiptKey;
}

interface DisplayedReceiptClaims {
  readonly tenantId: string;
  readonly deliveryId: string;
  readonly subscriptionId: string;
  readonly deviceFingerprint: string;
  readonly issuedAtSeconds: number;
  readonly expiresAtSeconds: number;
  readonly nonce: string;
}

export async function appendPushIntentAfterOrigin<T>(input: {
  readonly origin: T;
  readonly appendIntent: () => Promise<unknown>;
}): Promise<{
  readonly origin: T;
  readonly push: { readonly queued: true } | { readonly queued: false; readonly failure: string };
}> {
  try {
    await input.appendIntent();
    return { origin: input.origin, push: { queued: true } };
  } catch (cause) {
    const candidate = cause instanceof Error ? cause.message : '';
    const failure = /^PUSH_[A-Z0-9_]+$/.test(candidate) ? candidate : 'PUSH_OUTBOX_FAILED';
    return { origin: input.origin, push: { queued: false, failure } };
  }
}

export async function createDisplayedReceipt(
  input: Omit<DisplayedReceiptClaims, 'nonce'>,
): Promise<{
  readonly token: string;
  readonly issuedAtSeconds: number;
  readonly expiresAtSeconds: number;
}> {
  if (
    !Number.isSafeInteger(input.issuedAtSeconds) ||
    !Number.isSafeInteger(input.expiresAtSeconds) ||
    input.expiresAtSeconds <= input.issuedAtSeconds ||
    input.expiresAtSeconds - input.issuedAtSeconds > 300
  ) {
    throw receiptError('PUSH_ACK_WINDOW_INVALID');
  }
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const claims: DisplayedReceiptClaims = {
    ...input,
    nonce: base64Url(crypto.getRandomValues(new Uint8Array(16))),
  };
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: encoder.encode('KIPUSPAY-PUSH-ACK-V1') },
      await defaultKey(),
      encoder.encode(JSON.stringify(claims)),
    ),
  );
  const token = base64Url(Uint8Array.from([...nonce, ...ciphertext]));
  return {
    token,
    issuedAtSeconds: input.issuedAtSeconds,
    expiresAtSeconds: input.expiresAtSeconds,
  };
}

async function readClaims(token: string): Promise<DisplayedReceiptClaims> {
  const bytes = fromBase64Url(token);
  if (bytes.byteLength < 29) throw receiptError('PUSH_ACK_INVALID');
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: bytes.slice(0, 12),
        additionalData: encoder.encode('KIPUSPAY-PUSH-ACK-V1'),
      },
      await defaultKey(),
      bytes.slice(12),
    );
    return JSON.parse(decoder.decode(plaintext)) as DisplayedReceiptClaims;
  } catch {
    throw receiptError('PUSH_ACK_INVALID');
  }
}

export async function consumeDisplayedReceipt(input: {
  readonly token: string;
  readonly tenantId: string;
  readonly deliveryId: string;
  readonly subscriptionId: string;
  readonly deviceFingerprint: string;
  readonly nowSeconds: number;
}): Promise<{ readonly status: 'DISPLAYED'; readonly consumed: true }> {
  const claims = await readClaims(input.token);
  if (input.nowSeconds > claims.expiresAtSeconds) throw receiptError('PUSH_ACK_EXPIRED');
  if (
    claims.tenantId !== input.tenantId ||
    claims.deliveryId !== input.deliveryId ||
    claims.subscriptionId !== input.subscriptionId ||
    claims.deviceFingerprint !== input.deviceFingerprint
  ) {
    throw receiptError('PUSH_ACK_SCOPE_MISMATCH');
  }
  if (consumedReceipts.has(claims.nonce)) throw receiptError('PUSH_ACK_REPLAY');
  consumedReceipts.add(claims.nonce);
  return { status: 'DISPLAYED', consumed: true };
}
