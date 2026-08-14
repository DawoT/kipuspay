import { describe, expect, it } from 'vitest';
import {
  ARGON2_MEM_KIB,
  ARGON2_PARALLELISM,
  ARGON2_TIME,
  hashPinArgon2id,
  isArgon2idHash,
  verifyPinHash,
} from './pin-crypto.js';

const TEST_MEM = 4096;
const TEST_TIME = 1;

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('pin-crypto (argon2id SEC-03 + legado SHA-256)', () => {
  it('hashea en formato PHC argon2id y verifica', async () => {
    const hash = await hashPinArgon2id('1234', { mem: TEST_MEM, time: TEST_TIME });
    expect(hash.startsWith('$argon2id$v=19$')).toBe(true);
    const ok = await verifyPinHash('1234', hash);
    expect(ok).toMatchObject({ ok: true, needsRehash: false });
    const bad = await verifyPinHash('9999', hash);
    expect(bad.ok).toBe(false);
  });

  it('detecta hashes argon2id', () => {
    expect(isArgon2idHash('$argon2id$v=19$m=4096,t=1,p=1$abc$def')).toBe(true);
    expect(isArgon2idHash('03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4')).toBe(
      false,
    );
    expect(isArgon2idHash(null)).toBe(false);
  });

  it('verifica el formato legado SHA-256 hex y pide re-hash', async () => {
    const legacy = await sha256Hex('1234');
    const ok = await verifyPinHash('1234', legacy);
    expect(ok).toMatchObject({ ok: true, needsRehash: true });
    const bad = await verifyPinHash('9999', legacy);
    expect(bad).toMatchObject({ ok: false, needsRehash: true });
  });

  it('verifica el formato legado con salt (hashPin pre-G2) y pide re-hash', async () => {
    const salt = 'ab'.repeat(16);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:1234`));
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const ok = await verifyPinHash('1234', `${salt}:${hash}`);
    expect(ok).toMatchObject({ ok: true, needsRehash: true });
    const bad = await verifyPinHash('9999', `${salt}:${hash}`);
    expect(bad).toMatchObject({ ok: false, needsRehash: true });
  });

  it('usa parámetros SEC-03 por defecto', async () => {
    const hash = await hashPinArgon2id('1234', { mem: TEST_MEM, time: TEST_TIME });
    expect(hash).toContain(`m=${TEST_MEM}`);
    expect(ARGON2_MEM_KIB).toBe(64 * 1024);
    expect(ARGON2_TIME).toBe(3);
    expect(ARGON2_PARALLELISM).toBe(1);
  });

  it('aplica defaults parciales de parámetros', async () => {
    const onlyMem = await hashPinArgon2id('1234', { mem: TEST_MEM });
    expect(onlyMem).toContain(`t=${ARGON2_TIME}`);
    const onlyTime = await hashPinArgon2id('1234', { time: TEST_TIME });
    expect(onlyTime).toContain(`m=${ARGON2_MEM_KIB}`);
  });

  it('rechaza legado con largo inválido', async () => {
    const bad = await verifyPinHash('1234', 'abc');
    expect(bad).toMatchObject({ ok: false, needsRehash: true });
  });
});
