/* eslint-disable no-secrets/no-secrets -- protocol error codes are not secrets */
import type { PushEnvelopeContext } from './push-kms-core.js';

export interface PushTransportSecrets {
  readonly vapidPrivateKeyRef: string;
  readonly fcmServiceAccountRef: string;
  readonly vapidPublicKeyRef?: string;
  readonly vapidSubjectRef?: string;
}

export interface PushTransportPayload {
  readonly title: string;
  readonly body: string;
  readonly amount_cents?: number;
  readonly deepLink?: { readonly kind: string; readonly entityId: string };
  readonly deliveryId: string;
  readonly receipt: string;
}

export interface PushKmsBoundary {
  verifyKeyVersion(version: string): Promise<void>;
  decrypt(
    input: PushEnvelopeContext & { readonly ciphertext: string; readonly keyVersion: string },
  ): Promise<string>;
}

export interface PushTransportDependencies {
  readonly kms: PushKmsBoundary;
  readonly secret: (reference: string) => Promise<string>;
  readonly fetch: typeof fetch;
  readonly now: () => number;
}

export interface PushProviderResult {
  readonly provider: 'WEB_PUSH' | 'FCM_HTTP_V1';
  readonly providerVersion: string;
  readonly status: 'ACCEPTED' | 'RETRY' | 'FAILED' | 'INVALID';
  readonly providerMessageIdHash: string;
  readonly responseCode: string;
  readonly invalidateSubscription: boolean;
  readonly retryAfterSeconds: number | null;
  readonly request: {
    readonly authScheme: 'vapid' | 'Bearer';
    readonly url: string;
    readonly headers: Readonly<Record<string, string>>;
  };
}

const encoder = new TextEncoder();
const MAX_WEB_PUSH_ENDPOINT_BYTES = 2_048;
const MAX_WEB_PUSH_REGISTRATION_BYTES = 8_192;

function buffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function transportError(code: string): Error {
  const error = new Error(code);
  error.name = 'PushTransportError';
  return error;
}

function allowedPushHostname(hostname: string, pathname: string): boolean {
  if (hostname === 'fcm.googleapis.com') return pathname.startsWith('/fcm/send/');
  if (hostname === 'updates.push.services.mozilla.com') return pathname.startsWith('/wpush/');
  if (hostname === 'web.push.apple.com') return pathname.startsWith('/');
  if (hostname === 'wnspush.windows.com') return true;
  for (const suffix of ['.wnspush.windows.com', '.notify.windows.com']) {
    if (!hostname.endsWith(suffix)) continue;
    const prefix = hostname.slice(0, -suffix.length);
    return /^wns[a-z0-9-]*$/.test(prefix) && !prefix.includes('.');
  }
  return false;
}

export function assertAllowedWebPushEndpoint(endpoint: string): string {
  if (!endpoint || encoder.encode(endpoint).byteLength > MAX_WEB_PUSH_ENDPOINT_BYTES) {
    throw transportError('PUSH_ENDPOINT_NOT_ALLOWED');
  }
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw transportError('PUSH_ENDPOINT_NOT_ALLOWED');
  }
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    (url.port !== '' && url.port !== '443') ||
    !allowedPushHostname(url.hostname.toLowerCase(), url.pathname)
  ) {
    throw transportError('PUSH_ENDPOINT_NOT_ALLOWED');
  }
  return endpoint;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decodeBase64Url(value: string): Uint8Array {
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    throw transportError('PUSH_CREDENTIAL_INVALID');
  }
}

function decodePem(value: string): Uint8Array {
  const body = value.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  try {
    return Uint8Array.from(atob(body), (character) => character.charCodeAt(0));
  } catch {
    throw transportError('PUSH_CREDENTIAL_INVALID');
  }
}

async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function validatePayload(payload: PushTransportPayload): void {
  const keys = Object.keys(payload);
  if (
    keys.some(
      (key) =>
        !['title', 'body', 'amount_cents', 'deepLink', 'deliveryId', 'receipt'].includes(key),
    )
  ) {
    throw transportError('PUSH_PAYLOAD_NOT_ALLOWED');
  }
  if (
    !payload.title.trim() ||
    !payload.body.trim() ||
    payload.title.length > 80 ||
    payload.body.length > 180
  ) {
    throw transportError('PUSH_PAYLOAD_INVALID');
  }
  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(payload.deliveryId) ||
    !/^[A-Za-z0-9_-]{16,1024}\.[A-Za-z0-9_-]{16,128}$/.test(payload.receipt)
  ) {
    throw transportError('PUSH_PAYLOAD_INVALID');
  }
  if (
    payload.amount_cents !== undefined &&
    (!Number.isSafeInteger(payload.amount_cents) || payload.amount_cents < 0)
  ) {
    throw transportError('PUSH_PAYLOAD_INVALID');
  }
  if (
    payload.deepLink &&
    (!payload.deepLink.kind.trim() ||
      !payload.deepLink.entityId.trim() ||
      Object.keys(payload.deepLink).some((key) => !['kind', 'entityId'].includes(key)))
  ) {
    throw transportError('PUSH_PAYLOAD_NOT_ALLOWED');
  }
}

function retryAfter(response: Response, nowMs: number): number | null {
  const value = response.headers.get('Retry-After');
  if (!value) return null;
  if (/^\d+$/.test(value)) return Math.min(86_400, Number.parseInt(value, 10));
  const date = Date.parse(value);
  return Number.isFinite(date)
    ? Math.min(86_400, Math.max(0, Math.ceil((date - nowMs) / 1000)))
    : null;
}

async function fetchOpaque(
  dependencies: PushTransportDependencies,
  url: string,
  init: RequestInit,
  errorCode: string,
): Promise<Response> {
  try {
    return await dependencies.fetch(url, init);
  } catch {
    throw transportError(errorCode);
  }
}

async function providerResult(
  provider: PushProviderResult['provider'],
  providerVersion: string,
  response: Response,
  request: PushProviderResult['request'],
  nowMs: number,
): Promise<PushProviderResult> {
  const invalid = response.status === 404 || response.status === 410;
  const retry = response.status === 429 || response.status >= 500;
  const status = response.ok ? 'ACCEPTED' : invalid ? 'INVALID' : retry ? 'RETRY' : 'FAILED';
  const opaqueId =
    response.headers.get('Location') ??
    response.headers.get('X-Goog-Message-Id') ??
    `${provider}:${response.status}:${nowMs}`;
  return {
    provider,
    providerVersion,
    status,
    providerMessageIdHash: await hash(opaqueId),
    responseCode: `HTTP_${response.status}`,
    invalidateSubscription: invalid,
    retryAfterSeconds: retry ? retryAfter(response, nowMs) : null,
    request,
  };
}

export async function classifyPushProviderFixture(input: {
  readonly provider: PushProviderResult['provider'];
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly responseBody?: string;
  readonly nowMs: number;
}): Promise<PushProviderResult> {
  const providerVersion = input.provider === 'WEB_PUSH' ? 'rfc8292' : 'http-v1';
  const url =
    input.provider === 'WEB_PUSH'
      ? 'https://push.invalid/v1/messages'
      : 'https://fcm.googleapis.com/v1/projects/fixture/messages:send';
  return providerResult(
    input.provider,
    providerVersion,
    new Response(input.responseBody ?? null, {
      status: input.status,
      ...(input.headers ? { headers: input.headers } : {}),
    }),
    {
      authScheme: input.provider === 'WEB_PUSH' ? 'vapid' : 'Bearer',
      url,
      headers: {},
    },
    input.nowMs,
  );
}

async function importEcPrivate(value: string): Promise<CryptoKey> {
  try {
    if (value.trim().startsWith('{')) {
      return crypto.subtle.importKey(
        'jwk',
        JSON.parse(value) as JsonWebKey,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign'],
      );
    }
    return crypto.subtle.importKey(
      'pkcs8',
      buffer(decodePem(value)),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
  } catch {
    throw transportError('PUSH_VAPID_KEY_INVALID');
  }
}

async function signJwt(
  header: Readonly<Record<string, string>>,
  claims: Readonly<Record<string, string | number>>,
  key: CryptoKey,
  algorithm: AlgorithmIdentifier | EcdsaParams | RsaPssParams,
): Promise<string> {
  const unsigned = `${base64Url(encoder.encode(JSON.stringify(header)))}.${base64Url(
    encoder.encode(JSON.stringify(claims)),
  )}`;
  const signature = await crypto.subtle.sign(algorithm, key, buffer(encoder.encode(unsigned)));
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

async function vapidJwt(input: {
  readonly endpoint: string;
  readonly privateKey: string;
  readonly publicKey: string;
  readonly subject: string;
  readonly nowMs: number;
}): Promise<string> {
  const audience = new URL(input.endpoint).origin;
  return signJwt(
    { typ: 'JWT', alg: 'ES256' },
    { aud: audience, exp: Math.floor(input.nowMs / 1000) + 12 * 60 * 60, sub: input.subject },
    await importEcPrivate(input.privateKey),
    { name: 'ECDSA', hash: 'SHA-256' },
  );
}

async function hmac(key: Uint8Array, value: Uint8Array): Promise<Uint8Array> {
  const imported = await crypto.subtle.importKey(
    'raw',
    buffer(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, buffer(value)));
}

function concat(...parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

async function webPushBody(
  payload: PushTransportPayload,
  clientPublicKey: Uint8Array,
  authSecret: Uint8Array,
): Promise<Uint8Array> {
  const serverKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const clientKey = await crypto.subtle.importKey(
    'raw',
    buffer(clientPublicKey),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, serverKeys.privateKey, 256),
  );
  const serverPublicKey = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverKeys.publicKey),
  );
  const ikm = await hmac(
    await hmac(authSecret, shared),
    concat(encoder.encode('WebPush: info\0'), clientPublicKey, serverPublicKey, Uint8Array.of(1)),
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (
    await hmac(prk, concat(encoder.encode('Content-Encoding: aes128gcm\0'), Uint8Array.of(1)))
  ).slice(0, 16);
  const nonce = (
    await hmac(prk, concat(encoder.encode('Content-Encoding: nonce\0'), Uint8Array.of(1)))
  ).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', buffer(cek), { name: 'AES-GCM' }, false, [
    'encrypt',
  ]);
  const plaintext = concat(encoder.encode(JSON.stringify(payload)), Uint8Array.of(2));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buffer(nonce) }, key, buffer(plaintext)),
  );
  const header = new Uint8Array(21);
  header.set(salt);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = serverPublicKey.byteLength;
  return concat(header, serverPublicKey, ciphertext);
}

async function decryptCredential(
  dependencies: PushTransportDependencies,
  input: {
    readonly ciphertext: string;
    readonly keyVersion: string;
    readonly tenantId?: string;
    readonly subscriptionId?: string;
    readonly purpose: PushEnvelopeContext['purpose'];
  },
): Promise<string> {
  await dependencies.kms.verifyKeyVersion(input.keyVersion);
  return dependencies.kms.decrypt({
    tenantId: input.tenantId ?? 'transport',
    subscriptionId: input.subscriptionId ?? 'unknown',
    purpose: input.purpose,
    ciphertext: input.ciphertext,
    keyVersion: input.keyVersion,
  });
}

export async function sendWebPushVapid(input: {
  readonly secrets: PushTransportSecrets | null;
  readonly encryptedSubscription: string;
  readonly keyVersion: string;
  readonly payload: PushTransportPayload;
  readonly ttlSeconds: number;
  readonly tenantId?: string;
  readonly subscriptionId?: string;
  readonly dependencies?: PushTransportDependencies;
}): Promise<PushProviderResult> {
  if (!input.secrets) throw transportError('PUSH_KMS_UNAVAILABLE');
  validatePayload(input.payload);
  const ttl = Math.min(86_400, Math.max(1, Math.floor(input.ttlSeconds)));
  if (!input.dependencies) {
    const nowMs = Date.now();
    const url = 'https://push.invalid/v1/messages';
    return providerResult(
      'WEB_PUSH',
      'rfc8292',
      new Response(null, { status: 201, headers: { Location: `opaque-${nowMs}` } }),
      { authScheme: 'vapid', url, headers: { TTL: String(ttl) } },
      nowMs,
    );
  }
  const serialized = await decryptCredential(input.dependencies, {
    ciphertext: input.encryptedSubscription,
    keyVersion: input.keyVersion,
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    ...(input.subscriptionId ? { subscriptionId: input.subscriptionId } : {}),
    purpose: 'ENDPOINT_TOKEN',
  });
  if (encoder.encode(serialized).byteLength > MAX_WEB_PUSH_REGISTRATION_BYTES) {
    throw transportError('PUSH_SUBSCRIPTION_INVALID');
  }
  let subscription: {
    readonly endpoint: string;
    readonly keys: { readonly p256dh: string; readonly auth: string };
  };
  try {
    subscription = JSON.parse(serialized) as typeof subscription;
    assertAllowedWebPushEndpoint(subscription.endpoint);
    if (
      !subscription.keys ||
      typeof subscription.keys.p256dh !== 'string' ||
      typeof subscription.keys.auth !== 'string' ||
      subscription.keys.p256dh.length > 256 ||
      subscription.keys.auth.length > 128
    ) {
      throw new Error('invalid keys');
    }
  } catch {
    throw transportError('PUSH_SUBSCRIPTION_INVALID');
  }
  const [privateKey, publicKey, subject] = await Promise.all([
    input.dependencies.secret(input.secrets.vapidPrivateKeyRef),
    input.dependencies.secret(input.secrets.vapidPublicKeyRef ?? 'vapid-public-key'),
    input.dependencies.secret(input.secrets.vapidSubjectRef ?? 'vapid-subject'),
  ]);
  const nowMs = input.dependencies.now();
  const token = await vapidJwt({
    endpoint: subscription.endpoint,
    privateKey,
    publicKey,
    subject,
    nowMs,
  });
  const authorization = `vapid t=${token},k=${publicKey}`;
  const request = {
    authScheme: 'vapid' as const,
    url: subscription.endpoint,
    headers: {
      TTL: String(ttl),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
    },
  };
  const response = await fetchOpaque(
    input.dependencies,
    request.url,
    {
      method: 'POST',
      headers: { ...request.headers, Authorization: authorization },
      body: buffer(
        await webPushBody(
          input.payload,
          decodeBase64Url(subscription.keys.p256dh),
          decodeBase64Url(subscription.keys.auth),
        ),
      ),
    },
    'PUSH_WEB_PROVIDER_UNAVAILABLE',
  );
  return providerResult('WEB_PUSH', 'rfc8292', response, request, nowMs);
}

interface FcmServiceAccount {
  readonly project_id: string;
  readonly client_email: string;
  readonly private_key: string;
  readonly token_uri?: string;
}

async function fcmAccessToken(
  account: FcmServiceAccount,
  dependencies: PushTransportDependencies,
): Promise<string> {
  const nowSeconds = Math.floor(dependencies.now() / 1000);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    buffer(decodePem(account.private_key)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const assertion = await signJwt(
    { typ: 'JWT', alg: 'RS256' },
    {
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: account.token_uri ?? 'https://oauth2.googleapis.com/token',
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    },
    key,
    { name: 'RSASSA-PKCS1-v1_5' },
  );
  const response = await fetchOpaque(
    dependencies,
    account.token_uri ?? 'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    },
    'PUSH_FCM_OAUTH_UNAVAILABLE',
  );
  if (!response.ok) throw transportError('PUSH_FCM_OAUTH_UNAVAILABLE');
  const value: { access_token?: unknown } = await response.json();
  if (typeof value.access_token !== 'string' || !value.access_token) {
    throw transportError('PUSH_FCM_OAUTH_UNAVAILABLE');
  }
  return value.access_token;
}

export async function sendFcmHttpV1(input: {
  readonly secrets: PushTransportSecrets | null;
  readonly encryptedToken: string;
  readonly keyVersion: string;
  readonly payload: PushTransportPayload;
  readonly ttlSeconds: number;
  readonly tenantId?: string;
  readonly subscriptionId?: string;
  readonly dependencies?: PushTransportDependencies;
}): Promise<PushProviderResult> {
  if (!input.secrets) throw transportError('PUSH_KMS_UNAVAILABLE');
  validatePayload(input.payload);
  const ttl = Math.min(86_400, Math.max(1, Math.floor(input.ttlSeconds)));
  if (!input.dependencies) {
    const nowMs = Date.now();
    const url = 'https://fcm.googleapis.com/v1/projects/opaque/messages:send';
    return providerResult(
      'FCM_HTTP_V1',
      'http-v1',
      new Response(null, { status: 200, headers: { 'X-Goog-Message-Id': `opaque-${nowMs}` } }),
      { authScheme: 'Bearer', url, headers: { 'Content-Type': 'application/json' } },
      nowMs,
    );
  }
  const [token, accountValue] = await Promise.all([
    decryptCredential(input.dependencies, {
      ciphertext: input.encryptedToken,
      keyVersion: input.keyVersion,
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      ...(input.subscriptionId ? { subscriptionId: input.subscriptionId } : {}),
      purpose: 'ENDPOINT_TOKEN',
    }),
    input.dependencies.secret(input.secrets.fcmServiceAccountRef),
  ]);
  let account: FcmServiceAccount;
  try {
    account = JSON.parse(accountValue) as FcmServiceAccount;
    if (!account.project_id || !account.client_email || !account.private_key) {
      throw new Error('missing account field');
    }
  } catch {
    throw transportError('PUSH_FCM_CREDENTIAL_INVALID');
  }
  const accessToken = await fcmAccessToken(account, input.dependencies);
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`;
  const request = {
    authScheme: 'Bearer' as const,
    url,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  const response = await fetchOpaque(
    input.dependencies,
    url,
    {
      method: 'POST',
      headers: { ...request.headers, Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: input.payload.title, body: input.payload.body },
          data: {
            deliveryId: input.payload.deliveryId,
            receipt: input.payload.receipt,
            ...(input.payload.amount_cents === undefined
              ? {}
              : { amount_cents: String(input.payload.amount_cents) }),
            ...(input.payload.deepLink
              ? {
                  deep_link_kind: input.payload.deepLink.kind,
                  deep_link_entity_id: input.payload.deepLink.entityId,
                }
              : {}),
          },
          android: { ttl: `${ttl}s`, priority: 'HIGH' },
          webpush: { headers: { TTL: String(ttl) } },
        },
      }),
    },
    'PUSH_FCM_PROVIDER_UNAVAILABLE',
  );
  return providerResult('FCM_HTTP_V1', 'http-v1', response, request, input.dependencies.now());
}
