import { describe, expect, it } from 'vitest';
import { signStripeWebhookForTests, verifyStripeSignature } from './verify-stripe-signature.js';

const SECRET = 'whsec_test_not_for_production';
const BODY =
  '{"id":"evt_1","type":"invoice.paid","data":{"object":{"metadata":{"tenant_id":"t1"}}}}';
const nowMs = Date.parse('2026-08-04T12:00:00Z');
const nowSec = Math.floor(nowMs / 1000);

describe('verifyStripeSignature (SEC-08)', () => {
  it('acepta firma válida dentro de la ventana', async () => {
    const header = await signStripeWebhookForTests(BODY, SECRET, nowSec - 10);
    await expect(verifyStripeSignature(BODY, header, SECRET, nowMs)).resolves.toBe(true);
  });

  it('rechaza timestamp futuro (age < 0)', async () => {
    const header = await signStripeWebhookForTests(BODY, SECRET, nowSec + 60);
    await expect(verifyStripeSignature(BODY, header, SECRET, nowMs)).resolves.toBe(false);
  });

  it('rechaza age > 300 s', async () => {
    const header = await signStripeWebhookForTests(BODY, SECRET, nowSec - 301);
    await expect(verifyStripeSignature(BODY, header, SECRET, nowMs)).resolves.toBe(false);
  });

  it('rechaza header incompleto', async () => {
    await expect(verifyStripeSignature(BODY, 't=123', SECRET, nowMs)).resolves.toBe(false);
    await expect(verifyStripeSignature(BODY, 'v1=abcd', SECRET, nowMs)).resolves.toBe(false);
  });

  it('rechaza secreto incorrecto', async () => {
    const header = await signStripeWebhookForTests(BODY, SECRET, nowSec);
    await expect(verifyStripeSignature(BODY, header, 'other', nowMs)).resolves.toBe(false);
  });

  it('rechaza v1 no-hex', async () => {
    await expect(
      verifyStripeSignature(BODY, `t=${nowSec},v1=not-hex!!`, SECRET, nowMs),
    ).resolves.toBe(false);
  });

  it('fuzz determinista: ≥50 firmas/headers aleatorios → todos false (reproducible CI)', async () => {
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

    const results: boolean[] = [];
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
    expect(results.every((r) => r === false)).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(50);
  });

  it('adversarial: borde de ventana y parseo estricto de header', async () => {
    // age = 300 s exacto → acepta (límite inclusivo)
    const edge = await signStripeWebhookForTests(BODY, SECRET, nowSec - 300);
    await expect(verifyStripeSignature(BODY, edge, SECRET, nowMs)).resolves.toBe(true);
    // age = 301 s → rechaza
    const over = await signStripeWebhookForTests(BODY, SECRET, nowSec - 301);
    await expect(verifyStripeSignature(BODY, over, SECRET, nowMs)).resolves.toBe(false);
    // timestamp no numérico / vacío / negativo
    await expect(verifyStripeSignature(BODY, `t=abc,v1=abcd`, SECRET, nowMs)).resolves.toBe(false);
    await expect(verifyStripeSignature(BODY, `t=,v1=abcd`, SECRET, nowMs)).resolves.toBe(false);
    await expect(verifyStripeSignature(BODY, `t=-5,v1=abcd`, SECRET, nowMs)).resolves.toBe(false);
    // hex truncado (impar o < 64 chars)
    const valid = await signStripeWebhookForTests(BODY, SECRET, nowSec);
    const shortHex = valid.split('v1=')[1]!.slice(0, 62);
    await expect(
      verifyStripeSignature(BODY, `t=${nowSec},v1=${shortHex}`, SECRET, nowMs),
    ).resolves.toBe(false);
    // v1 con '=' extra (inyección) → decodeHex falla → rechaza
    await expect(
      verifyStripeSignature(BODY, `t=${nowSec},v1=${valid.split('v1=')[1]}=evil`, SECRET, nowMs),
    ).resolves.toBe(false);
    // firma con mayúsculas (hex case-insensitive) → acepta
    const upper = valid.split('v1=')[1]!.toUpperCase();
    await expect(
      verifyStripeSignature(BODY, `t=${nowSec},v1=${upper}`, SECRET, nowMs),
    ).resolves.toBe(true);
    // múltiples v1: cualquiera válida matchea (rotación de secretos Stripe)
    await expect(
      verifyStripeSignature(
        BODY,
        `t=${nowSec},v1=${'00'.repeat(32)},v1=${valid.split('v1=')[1]}`,
        SECRET,
        nowMs,
      ),
    ).resolves.toBe(true);
  });
});
