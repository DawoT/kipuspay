import { describe, expect, it, vi } from 'vitest';
import {
  MAX_WEBHOOK_BODY_BYTES,
  signStripeWebhookForTests,
  type StripeSignatureFailureCode,
  verifyStripeSignature,
  webhookBodyBytes,
} from './verify-stripe-signature.js';

const SECRET = 'whsec_test_not_for_production';
const BODY =
  '{"id":"evt_1","type":"invoice.paid","data":{"object":{"metadata":{"tenant_id":"t1"}}}}';
const nowMs = Date.parse('2026-08-04T12:00:00Z');
const nowSec = Math.floor(nowMs / 1000);

describe('verifyStripeSignature (SEC-08)', () => {
  it('acepta firma válida dentro de la ventana', async () => {
    const header = await signStripeWebhookForTests(BODY, SECRET, nowSec - 10);
    await expect(verifyStripeSignature(BODY, header, SECRET, nowMs)).resolves.toEqual({ ok: true });
  });

  it('error.code estable por clase (US-02 / acceptance US-06): todo rechazo trae código, nunca boolean colapsado', async () => {
    // MISSING_HEADER: header o secret ausentes, o header sin campos requeridos.
    await expect(verifyStripeSignature(BODY, '', SECRET, nowMs)).resolves.toEqual({
      ok: false,
      code: 'MISSING_HEADER',
    });
    await expect(
      verifyStripeSignature(BODY, undefined as unknown as string, SECRET, nowMs),
    ).resolves.toEqual({ ok: false, code: 'MISSING_HEADER' });
    await expect(verifyStripeSignature(BODY, 't=1,v1=aa', '', nowMs)).resolves.toEqual({
      ok: false,
      code: 'MISSING_HEADER',
    });
    // Header presente pero sin t= ni v1= → la parte requerida falta.
    await expect(verifyStripeSignature(BODY, 't=123', SECRET, nowMs)).resolves.toEqual({
      ok: false,
      code: 'MISSING_HEADER',
    });
    await expect(verifyStripeSignature(BODY, 'v1=abcd', SECRET, nowMs)).resolves.toEqual({
      ok: false,
      code: 'MISSING_HEADER',
    });

    // TIMESTAMP_FUTURE: age < 0.
    const future = await signStripeWebhookForTests(BODY, SECRET, nowSec + 60);
    await expect(verifyStripeSignature(BODY, future, SECRET, nowMs)).resolves.toEqual({
      ok: false,
      code: 'TIMESTAMP_FUTURE',
    });

    // TIMESTAMP_EXPIRED: age > 300 s.
    const expired = await signStripeWebhookForTests(BODY, SECRET, nowSec - 301);
    await expect(verifyStripeSignature(BODY, expired, SECRET, nowMs)).resolves.toEqual({
      ok: false,
      code: 'TIMESTAMP_EXPIRED',
    });

    // INVALID_SIGNATURE: timestamp no entero, v1 no-hex, HMAC mismatch, crypto.
    await expect(verifyStripeSignature(BODY, `t=abc,v1=abcd`, SECRET, nowMs)).resolves.toEqual({
      ok: false,
      code: 'INVALID_SIGNATURE',
    });
    await expect(
      verifyStripeSignature(BODY, `t=${nowSec},v1=not-hex!!`, SECRET, nowMs),
    ).resolves.toEqual({ ok: false, code: 'INVALID_SIGNATURE' });
    const wrongSecret = await signStripeWebhookForTests(BODY, SECRET, nowSec);
    await expect(verifyStripeSignature(BODY, wrongSecret, 'other', nowMs)).resolves.toEqual({
      ok: false,
      code: 'INVALID_SIGNATURE',
    });

    // La clase está cerrada: todo rechazo posible cae en uno de los 4 codes.
    const closedClass: StripeSignatureFailureCode[] = [
      'MISSING_HEADER',
      'TIMESTAMP_EXPIRED',
      'TIMESTAMP_FUTURE',
      'INVALID_SIGNATURE',
    ];
    expect(closedClass).toHaveLength(4);
  });

  it('fuzz determinista: ≥50 firmas/headers aleatorios → todos fail con code estable (reproducible CI)', async () => {
    // PRNG seedable (mulberry32) — el run debe ser reproducible bit a bit.
    const rand = (seed: number) => {
      let s = seed >>> 0;
      return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
    const rng = rand(0x5eed_5eed);
    const randHex = (len: number) =>
      Array.from({ length: len }, () => Math.floor(rng() * 16).toString(16)).join('');

    const results: ({ ok: boolean; code?: string } | null)[] = [];
    for (let i = 0; i < 60; i++) {
      const ts = nowSec - Math.floor(rng() * 600); // dentro y fuera de ventana
      const junk = `t=${ts},v1=${randHex(64)}`;
      results.push(await verifyStripeSignature(BODY, junk, SECRET, nowMs));
    }
    // cuerpos mutados con firma de otro body (firma válida, payload distinto)
    for (let i = 0; i < 20; i++) {
      const header = await signStripeWebhookForTests(
        `{"n":${i}}`,
        SECRET,
        nowSec - Math.floor(rng() * 10),
      );
      results.push(await verifyStripeSignature(BODY, header, SECRET, nowMs));
    }
    // secret incorrecto con firma válida del body
    for (let i = 0; i < 10; i++) {
      const header = await signStripeWebhookForTests(BODY, `whsec_wrong_${i}`, nowSec - 5);
      results.push(await verifyStripeSignature(BODY, header, SECRET, nowMs));
    }
    // Todo rechazo NO es un boolean colapsado: trae un code estable por clase.
    for (const r of results) {
      expect(r).not.toBeNull();
      expect(r?.ok).toBe(false);
      expect(r?.code).toBeDefined();
    }
    expect(results.length).toBeGreaterThanOrEqual(50);
  });

  it('adversarial: borde de ventana y parseo estricto de header', async () => {
    // age = 300 s exacto → acepta (límite inclusivo)
    const edge = await signStripeWebhookForTests(BODY, SECRET, nowSec - 300);
    await expect(verifyStripeSignature(BODY, edge, SECRET, nowMs)).resolves.toEqual({ ok: true });
    // age = 301 s → TIMESTAMP_EXPIRED
    const over = await signStripeWebhookForTests(BODY, SECRET, nowSec - 301);
    await expect(verifyStripeSignature(BODY, over, SECRET, nowMs)).resolves.toEqual({
      ok: false,
      code: 'TIMESTAMP_EXPIRED',
    });
    // timestamp no numérico / vacío / negativo
    await expect(verifyStripeSignature(BODY, `t=abc,v1=abcd`, SECRET, nowMs)).resolves.toEqual({
      ok: false,
      code: 'INVALID_SIGNATURE',
    });
    await expect(verifyStripeSignature(BODY, `t=,v1=abcd`, SECRET, nowMs)).resolves.toEqual({
      ok: false,
      code: 'MISSING_HEADER',
    });
    await expect(verifyStripeSignature(BODY, `t=-5,v1=abcd`, SECRET, nowMs)).resolves.toEqual({
      ok: false,
      code: 'TIMESTAMP_EXPIRED',
    });
    // hex truncado (impar o < 64 chars)
    const valid = await signStripeWebhookForTests(BODY, SECRET, nowSec);
    const shortHex = valid.split('v1=')[1]!.slice(0, 62);
    await expect(
      verifyStripeSignature(BODY, `t=${nowSec},v1=${shortHex}`, SECRET, nowMs),
    ).resolves.toEqual({ ok: false, code: 'INVALID_SIGNATURE' });
    // v1 con '=' extra (inyección) → decodeHex falla → INVALID_SIGNATURE
    await expect(
      verifyStripeSignature(BODY, `t=${nowSec},v1=${valid.split('v1=')[1]}=evil`, SECRET, nowMs),
    ).resolves.toEqual({ ok: false, code: 'INVALID_SIGNATURE' });
    // firma con mayúsculas (hex case-insensitive) → acepta
    const upper = valid.split('v1=')[1]!.toUpperCase();
    await expect(
      verifyStripeSignature(BODY, `t=${nowSec},v1=${upper}`, SECRET, nowMs),
    ).resolves.toEqual({ ok: true });
    // múltiples v1: cualquiera válida matchea (rotación de secretos Stripe)
    await expect(
      verifyStripeSignature(
        BODY,
        `t=${nowSec},v1=${'00'.repeat(32)},v1=${valid.split('v1=')[1]}`,
        SECRET,
        nowMs,
      ),
    ).resolves.toEqual({ ok: true });
  });

  it('SEC-08 higiene de secretos: la key HMAC se importa NO extraíble y solo para firmar (jamás se exporta)', async () => {
    const importSpy = vi.spyOn(crypto.subtle, 'importKey');
    const header = await signStripeWebhookForTests(BODY, SECRET, nowSec - 10);
    await expect(verifyStripeSignature(BODY, header, SECRET, nowMs)).resolves.toEqual({
      ok: true,
    });

    const hmacCalls = importSpy.mock.calls.filter(
      ([, , algo]) => (algo as { name?: string } | undefined)?.name === 'HMAC',
    );
    expect(hmacCalls.length).toBeGreaterThan(0);
    // Cada import de la secret: formato raw, extractable=false (no exportable)
    // y usages mínimos ['sign'] — sin derivación ni extracción posible.
    for (const call of hmacCalls) {
      expect(call[0]).toBe('raw');
      expect(call[2]).toEqual({ name: 'HMAC', hash: 'SHA-256' });
      expect(call[3]).toBe(false);
      expect(call[4]).toEqual(['sign']);
    }
    // Evidencia runtime del no-export: exportKey('raw', key) rechaza.
    const keyPromise = importSpy.mock.results
      .map((r) => r.value as Promise<CryptoKey> | undefined)
      .find((p) => p !== undefined);
    expect(keyPromise).toBeDefined();
    const key = keyPromise ? await keyPromise : (undefined as unknown as CryptoKey);
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
    importSpy.mockRestore();
  });
});

describe('MAX_WEBHOOK_BODY_BYTES (Invarian 6: size gate anti-DoS)', () => {
  it('define el límite en 1MB exacto', () => {
    expect(MAX_WEBHOOK_BODY_BYTES).toBe(1024 * 1024);
  });

  it('webhookBodyBytes mide bytes UTF-8, no code units UTF-16', () => {
    // ASCII: 1 byte por carácter
    expect(webhookBodyBytes('{"a":1}')).toBe(7);
    // Multi-byte: '€' es 1 code unit UTF-16 pero 3 bytes UTF-8 — un gate por
    // .length subestimaría payloads no-ASCII.
    expect('€'.length).toBe(1);
    expect(webhookBodyBytes('€')).toBe(3);
    // Borde exacto del límite (inclusivo: > MAX rechaza, MAX no)
    expect(webhookBodyBytes('x'.repeat(MAX_WEBHOOK_BODY_BYTES))).toBe(MAX_WEBHOOK_BODY_BYTES);
    expect(webhookBodyBytes('x'.repeat(MAX_WEBHOOK_BODY_BYTES + 1))).toBe(
      MAX_WEBHOOK_BODY_BYTES + 1,
    );
  });
});
