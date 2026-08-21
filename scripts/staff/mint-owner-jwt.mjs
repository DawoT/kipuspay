#!/usr/bin/env node
/**
 * Mint HS256 owner JWT for FIS-T0. Secret only from AUTH_JWT_HS_SECRET (tty/env).
 * Never prints the secret. Token goes to stdout.
 */
import { webcrypto } from 'node:crypto';

const crypto = webcrypto;
const secret = process.env.AUTH_JWT_HS_SECRET ?? '';
if (!secret) {
  console.error('AUTH_JWT_HS_SECRET required');
  process.exit(1);
}

function b64url(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

const nowSec = Math.floor(Date.now() / 1000);
const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
const payload = b64url(
  Buffer.from(
    JSON.stringify({
      sub: 'user_stg_rn_owner_001',
      tenantId: 'tenant_stg_rosa_negra_001',
      role: 'owner',
      branchId: 'branch_stg_rn_001',
      auth_time: nowSec,
      iat: nowSec,
      nbf: nowSec,
      exp: nowSec + 12 * 60 * 60,
    }),
  ),
);
const key = await crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(secret),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign'],
);
const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${payload}`));
process.stdout.write(`${header}.${payload}.${b64url(new Uint8Array(sig))}\n`);
