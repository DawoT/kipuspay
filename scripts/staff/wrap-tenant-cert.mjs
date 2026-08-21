#!/usr/bin/env node
/**
 * Sella PKCS#8 con un DEK de 32 bytes (AES-GCM) y completa wrapDek vía KMS.
 * Uso:
 *   WRAP_DEK_URL=https://…/v1/internal/tenant-cert/wrap-dek \
 *   PLATFORM_STAFF_TOKEN=… TENANT_ID=tenant_stg_rosa_negra_001 \
 *   node scripts/staff/wrap-tenant-cert.mjs tmp-staff/cdt-rosa-negra/private.pem out.json
 *
 * Sin WRAP_DEK_URL exige WRAPPED_DEK_B64 + KEK_VERSION (ya envueltos).
 * El DEK en claro solo va a stderr si WRAP_DEK_URL falta; no commitear.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { webcrypto } from 'node:crypto';

const crypto = webcrypto;

function asBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function b64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function pemToDer(pem, label) {
  const re = new RegExp(
    `-----BEGIN ${label}-----([A-Za-z0-9+/=\\s]+)-----END ${label}-----`,
  );
  const match = re.exec(pem);
  if (!match?.[1]) throw new Error(`PEM_BLOCK_MISSING:${label}`);
  return Uint8Array.from(Buffer.from(match[1].replace(/\s+/g, ''), 'base64'));
}

const pemPath = process.argv[2];
const outPath = process.argv[3];
if (!pemPath) {
  console.error('usage: wrap-tenant-cert.mjs <private.pem> [envelope.json]');
  process.exit(1);
}
const pkcs8 = pemToDer(readFileSync(pemPath, 'utf8'), 'PRIVATE KEY');
const dek = crypto.getRandomValues(new Uint8Array(32));
const nonce = crypto.getRandomValues(new Uint8Array(12));
const key = await crypto.subtle.importKey('raw', asBuffer(dek), { name: 'AES-GCM' }, false, [
  'encrypt',
]);
const ciphertext = new Uint8Array(
  await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: asBuffer(nonce), tagLength: 128 },
    key,
    asBuffer(pkcs8),
  ),
);

const wrapUrl = process.env.WRAP_DEK_URL?.trim() ?? '';
const staffToken = process.env.PLATFORM_STAFF_TOKEN?.trim() ?? '';
const tenantId = process.env.TENANT_ID?.trim() ?? 'tenant_stg_rosa_negra_001';
const backupId = process.env.BACKUP_ID?.trim() ?? 'tenant-cert:SUNAT';

let wrappedDekB64 = process.env.WRAPPED_DEK_B64?.trim() ?? '';
let kekVersion = process.env.KEK_VERSION?.trim() ?? '';

if (wrapUrl) {
  if (!staffToken) {
    console.error('PLATFORM_STAFF_TOKEN required with WRAP_DEK_URL');
    process.exit(1);
  }
  const res = await fetch(wrapUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-platform-staff-token': staffToken,
    },
    body: JSON.stringify({ tenantId, backupId, dekB64: b64(dek) }),
  });
  const body = await res.json();
  if (!res.ok || typeof body.wrappedDekB64 !== 'string') {
    console.error(`wrapDek failed: ${res.status} ${JSON.stringify(body)}`);
    process.exit(1);
  }
  wrappedDekB64 = body.wrappedDekB64;
  kekVersion = typeof body.kekVersion === 'string' ? body.kekVersion : 'v1';
} else if (!wrappedDekB64 || wrappedDekB64 === 'WRAP_WITH_KMS_THEN_REPLACE') {
  process.stderr.write('DEK_B64 (wrap with POST wrap-dek; do not commit):\n');
  process.stderr.write(`${b64(dek)}\n`);
  console.error('Set WRAP_DEK_URL or WRAPPED_DEK_B64; refusing placeholder envelope.');
  process.exit(2);
}

const envelope = {
  v: 1,
  kekVersion: kekVersion || 'v1',
  backupId,
  wrappedDekB64,
  nonceB64: b64(nonce),
  ciphertextB64: b64(ciphertext),
};
const json = `${JSON.stringify(envelope)}\n`;
if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, json);
  process.stderr.write(`wrote ${outPath}\n`);
} else {
  process.stdout.write(json);
}
