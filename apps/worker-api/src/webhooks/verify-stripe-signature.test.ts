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

  it('fuzz: ≥50 firmas/headers aleatorios → todos false', async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 50; i++) {
      const junk = `t=${nowSec - (i % 10)},v1=${crypto.randomUUID().replace(/-/g, '')}`;
      results.push(await verifyStripeSignature(BODY, junk, SECRET, nowMs));
    }
    // también cuerpos mutados con firma de otro body
    for (let i = 0; i < 10; i++) {
      const header = await signStripeWebhookForTests(`{"n":${i}}`, SECRET, nowSec);
      results.push(await verifyStripeSignature(BODY, header, SECRET, nowMs));
    }
    expect(results.every((r) => r === false)).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(50);
  });
});
