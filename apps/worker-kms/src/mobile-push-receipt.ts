const encoder = new TextEncoder();
const decoder = new TextDecoder();

function buffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

export interface PushAckClaims {
  readonly tenantId: string;
  readonly userId: string;
  readonly deliveryId: string;
  readonly subscriptionId: string;
  readonly deviceFingerprint: string;
  readonly issuedAtSeconds: number;
  readonly expiresAtSeconds: number;
  readonly nonce: string;
}

function fail(code: string): never {
  throw new Error(code);
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decodeBase64Url(value: string): Uint8Array {
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
    return Uint8Array.from(
      atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')),
      (character) => character.charCodeAt(0),
    );
  } catch {
    return fail('PUSH_ACK_INVALID');
  }
}

function validClaims(value: unknown): value is PushAckClaims {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PushAckClaims>;
  return (
    typeof candidate.tenantId === 'string' &&
    typeof candidate.userId === 'string' &&
    typeof candidate.deliveryId === 'string' &&
    typeof candidate.subscriptionId === 'string' &&
    typeof candidate.deviceFingerprint === 'string' &&
    typeof candidate.nonce === 'string' &&
    Number.isSafeInteger(candidate.issuedAtSeconds) &&
    Number.isSafeInteger(candidate.expiresAtSeconds)
  );
}

async function key(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  if (secret.length < 32) return fail('PUSH_ACK_KEY_UNAVAILABLE');
  const material = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, usages);
}

async function digest(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function issuePushAckReceipt(
  secret: string,
  input: Omit<PushAckClaims, 'nonce'>,
): Promise<{
  readonly token: string;
  readonly receiptHash: string;
  readonly keyVersion: 'push-ack-v1';
}> {
  if (
    input.expiresAtSeconds <= input.issuedAtSeconds ||
    input.expiresAtSeconds - input.issuedAtSeconds > 300
  ) {
    return fail('PUSH_ACK_WINDOW_INVALID');
  }
  const claims: PushAckClaims = {
    ...input,
    nonce: base64Url(crypto.getRandomValues(new Uint8Array(18))),
  };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode('KIPUSPAY-PUSH-ACK-V1') },
      await key(secret, ['encrypt']),
      encoder.encode(JSON.stringify(claims)),
    ),
  );
  const token = `${base64Url(iv)}.${base64Url(ciphertext)}`;
  return { token, receiptHash: await digest(token), keyVersion: 'push-ack-v1' };
}

export async function verifyPushAckReceipt(
  secret: string,
  token: string,
  nowSeconds: number,
): Promise<PushAckClaims> {
  const [iv, ciphertext, extra] = token.split('.');
  if (!iv || !ciphertext || extra) return fail('PUSH_ACK_INVALID');
  let claims: unknown;
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: buffer(decodeBase64Url(iv)),
        additionalData: buffer(encoder.encode('KIPUSPAY-PUSH-ACK-V1')),
      },
      await key(secret, ['decrypt']),
      buffer(decodeBase64Url(ciphertext)),
    );
    claims = JSON.parse(decoder.decode(plaintext));
  } catch {
    return fail('PUSH_ACK_INVALID');
  }
  if (!validClaims(claims)) return fail('PUSH_ACK_INVALID');
  if (
    claims.expiresAtSeconds <= claims.issuedAtSeconds ||
    claims.expiresAtSeconds - claims.issuedAtSeconds > 300
  ) {
    return fail('PUSH_ACK_INVALID');
  }
  if (nowSeconds >= claims.expiresAtSeconds) return fail('PUSH_ACK_EXPIRED');
  return claims;
}
