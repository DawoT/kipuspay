/**
 * Sprint 23 — API pública + webhooks salientes (§5.4 regla 4, SEC-04).
 */

export type PublicApiEventType = 'sale.created' | 'cpe.accepted' | 'cpe.rejected';

export const WEBHOOK_MAX_ATTEMPTS = 3;
export const WEBHOOK_AUTO_DISABLE_FAILURES = 5;
export const WEBHOOK_TIMEOUT_MS = 5_000;

const EVENT_TYPES: ReadonlySet<string> = new Set(['sale.created', 'cpe.accepted', 'cpe.rejected']);

export function isPublicApiEventType(value: string): value is PublicApiEventType {
  return EVENT_TYPES.has(value);
}

function isPrivateIpv4(a: number, b: number): boolean {
  const privateA = new Set([0, 10, 127]);
  if (privateA.has(a)) return true;
  if (a === 169) return b === 254;
  if (a === 172) return b >= 16 && b <= 31;
  if (a === 192) return b === 168;
  if (a === 100) return b >= 64 && b <= 127;
  return false;
}

function isPrivateIpv4String(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return false;
  return isPrivateIpv4(Number(m[1]), Number(m[2]));
}

/** Expande un IPv6 canónico en 8 hextetos ('' → null si no es IPv6). */
function expandIpv6(host: string): readonly string[] | null {
  if (!host.includes(':')) return null;
  let h = host;
  const zone = h.indexOf('%');
  if (zone !== -1) h = h.slice(0, zone);
  const double = h.indexOf('::');
  if (double === -1) {
    const groups = h.split(':');
    if (groups.length !== 8) return null;
    return groups.map((g) => g.padStart(4, '0'));
  }
  const head = h.slice(0, double).split(':').filter(Boolean);
  const tail = h
    .slice(double + 2)
    .split(':')
    .filter(Boolean);
  if (head.length + tail.length > 7) return null;
  const fill = 8 - head.length - tail.length;
  return [
    ...head.map((g) => g.padStart(4, '0')),
    ...Array.from({ length: fill }, () => '0000'),
    ...tail.map((g) => g.padStart(4, '0')),
  ];
}

/** Si el IPv6 es IPv4-mapped (`::ffff:a.b.c.d` / `::ffff:7f00:1` / forma expandida), devuelve la IPv4 embebida. */
function ipv6ToEmbeddedIpv4(host: string): string | null {
  const dotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(host);
  if (dotted) return dotted[1] as string;

  const groups = expandIpv6(host);
  if (!groups) return null;
  const isMapped = groups.slice(0, 5).every((g) => g === '0000') && groups[5] === 'ffff';
  if (!isMapped) return null;
  const hi = Number.parseInt(groups[6] as string, 16);
  const lo = Number.parseInt(groups[7] as string, 16);
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
}

function isPrivateOrMetadataIp(ip: string): boolean {
  if (ip === '::1') return true;
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true;

  const embedded = ipv6ToEmbeddedIpv4(ip);
  if (embedded) return isPrivateIpv4String(embedded);

  const groups = expandIpv6(ip);
  if (groups) {
    // Loopback en forma expandida (0:0:0:0:0:0:0:1) — evita bypass de ::1.
    if (groups.slice(0, 7).every((g) => g === '0000') && groups[7] === '0001') return true;
    return false;
  }
  return isPrivateIpv4String(ip);
}

function isPrivateOrMetadataHost(hostname: string): boolean {
  let host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host.endsWith('.')) host = host.slice(0, -1);
  const blockedNames = ['localhost', '169.254.169.254', 'metadata.google.internal', '::1'];
  if (blockedNames.includes(host) || host.endsWith('.localhost')) return true;

  if (host.includes(':')) {
    return isPrivateOrMetadataIp(host);
  }

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!v4) return false;
  return isPrivateIpv4(Number(v4[1]), Number(v4[2]));
}

/** SEC-04: solo HTTPS; deny-list privada / link-local / metadata. */
export function assertHttpsWebhookUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('WEBHOOK_URL_INVALID');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('WEBHOOK_URL_NOT_HTTPS');
  }
  if (isPrivateOrMetadataHost(parsed.hostname)) {
    throw new Error('WEBHOOK_URL_DENIED');
  }
}

/** Resolver de hostname → IPs (inyectado por el runtime; DNS rebinding). */
export type WebhookHostResolver = (hostname: string) => Promise<readonly string[]>;

/**
 * SEC-04 reforzado: además del deny-list estático, resuelve el hostname y
 * rechaza si la IP final es privada/link-local/metadata (anti DNS-rebinding).
 */
export async function assertSafeWebhookUrl(
  url: string,
  resolveHost: WebhookHostResolver,
): Promise<void> {
  assertHttpsWebhookUrl(url);
  const parsed = new URL(url);
  const host = parsed.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (!host.includes(':') && !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
    const ips = await resolveHost(host);
    if (ips.some((ip) => isPrivateOrMetadataIp(ip.toLowerCase()))) {
      throw new Error('WEBHOOK_URL_DENIED');
    }
  }
}

export function parseApiKeyToken(token: string): {
  readonly prefix: string;
  readonly secret: string;
} {
  if (!token.startsWith('kp_') || token.length < 20) {
    throw new Error('API_KEY_INVALID');
  }
  const prefix = token.slice(0, 16);
  return { prefix, secret: token };
}

function bytesToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return bytesToHex(buf);
}

/** HMAC-SHA256(pepper, salt:token) — salt aleatorio por key (§3 SEC-03). */
export async function hashApiKey(
  token: string,
  pepper: string,
  saltHex?: string,
): Promise<{ readonly saltHex: string; readonly hashHex: string }> {
  const salt = saltHex ?? bytesToHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const hashHex = await hmacSha256Hex(pepper, `${salt}:${token}`);
  return { saltHex: salt, hashHex };
}

export async function verifyApiKey(
  token: string,
  pepper: string,
  saltHex: string,
  expectedHashHex: string,
): Promise<boolean> {
  const { hashHex } = await hashApiKey(token, pepper, saltHex);
  if (hashHex.length !== expectedHashHex.length) return false;
  let ok = 0;
  for (let i = 0; i < hashHex.length; i++) {
    ok |= hashHex.charCodeAt(i) ^ expectedHashHex.charCodeAt(i);
  }
  return ok === 0;
}

export async function signWebhookBody(secret: string, body: string): Promise<string> {
  return hmacSha256Hex(secret, body);
}

export function shouldDisableWebhookEndpoint(failureCount: number): boolean {
  return failureCount >= WEBHOOK_AUTO_DISABLE_FAILURES;
}

/** Backoff 5s * 5^(attempt-1) para attempt 1..3. */
export function computeNextAttemptAtMs(nowMs: number, attemptCount: number): number {
  const factor = 5 ** Math.max(0, attemptCount - 1);
  return nowMs + 5_000 * factor;
}

export function kvApiKeyRevokedKey(tenantId: string, prefix: string): string {
  return `api_key_revoked:${tenantId}:${prefix}`;
}

export type WebhookDeliveryStatus = 'PENDING' | 'PROCESSING' | 'DELIVERED' | 'FAILED' | 'DISABLED';
