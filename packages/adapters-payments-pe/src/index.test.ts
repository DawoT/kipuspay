import { describe, expect, it, beforeEach } from 'vitest';
import {
  createPaymentAcquirer,
  externalToken,
  isPaymentApproved,
  resetSandboxStore,
  SandboxPaymentAcquirer,
} from './index.js';

describe('sandbox acquirer PE', () => {
  beforeEach(() => resetSandboxStore());

  it('charge CAPTURED idempotente', async () => {
    const acq = new SandboxPaymentAcquirer('yape');
    const a = await acq.charge({
      chargeId: 'ch1',
      amountCents: 1000,
      currency: 'PEN',
      acquirer: 'yape',
      idempotencyKey: 'k1',
    });
    const b = await acq.charge({
      chargeId: 'ch1',
      amountCents: 1000,
      currency: 'PEN',
      acquirer: 'yape',
      idempotencyKey: 'k1',
    });
    expect(a.status).toBe('CAPTURED');
    expect(a.reference).toBe(b.reference);
  });

  it('charge -fail → FAILED', async () => {
    const acq = createPaymentAcquirer('culqi');
    const r = await acq.charge({
      chargeId: 'ch-fail',
      amountCents: 100,
      currency: 'PEN',
      acquirer: 'culqi',
      idempotencyKey: 'kf',
    });
    expect(r.approved).toBe(false);
    expect(r.status).toBe('FAILED');
  });

  it('webhook HMAC ok + replay window', async () => {
    const acq = new SandboxPaymentAcquirer('plin');
    const secret = 'test-secret';
    const ts = Math.floor(Date.now() / 1000);
    const rawBody = JSON.stringify({
      chargeId: 'ch2',
      status: 'CAPTURED',
      reference: 'r2',
    });
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${rawBody}`));
    const sig = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

    const ok = await acq.verifyWebhook({
      acquirer: 'plin',
      rawBody,
      signatureHeader: sig,
      timestampSec: ts,
      nowSec: ts,
      secret,
    });
    expect(ok.ok).toBe(true);
    expect(ok.chargeId).toBe('ch2');

    const replay = await acq.verifyWebhook({
      acquirer: 'plin',
      rawBody,
      signatureHeader: sig,
      timestampSec: ts - 400,
      nowSec: ts,
      secret,
    });
    expect(replay.ok).toBe(false); // fail-closed, no lanza al caller
  });

  it('helpers + getStatus + bad signature', async () => {
    const acq = new SandboxPaymentAcquirer('niubiz');
    await acq.charge({
      chargeId: 'ch-pending',
      amountCents: 50,
      currency: 'PEN',
      acquirer: 'niubiz',
      idempotencyKey: 'kp',
    });
    const st = await acq.getStatus({ chargeId: 'ch-pending', acquirer: 'niubiz' });
    expect(st.status).toBe('PENDING');
    const miss = await acq.getStatus({ chargeId: 'missing', acquirer: 'niubiz' });
    expect(miss.status).toBe('FAILED');

    const bad = await acq.verifyWebhook({
      acquirer: 'niubiz',
      rawBody: '{}',
      signatureHeader: 'deadbeef',
      timestampSec: Math.floor(Date.now() / 1000),
      nowSec: Math.floor(Date.now() / 1000),
      secret: 'sec',
    });
    expect(bad.ok).toBe(false);

    const emptySecret = await acq.verifyWebhook({
      acquirer: 'niubiz',
      rawBody: '{}',
      signatureHeader: 'x',
      timestampSec: Math.floor(Date.now() / 1000),
      nowSec: Math.floor(Date.now() / 1000),
      secret: '',
    });
    expect(emptySecret.ok).toBe(false);

    expect(isPaymentApproved({ amountCents: 1, approved: true, externalReference: 'a' })).toBe(
      true,
    );
    expect(externalToken({ amountCents: 1, approved: true, externalReference: null })).toBe('');
  });
});

describe('S22-H1 webhook fail-closed', () => {
  const acquirer = new SandboxPaymentAcquirer('yape');
  const secret = 'test-secret';

  async function sign(payload: string, ts: number): Promise<string> {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${payload}`));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  it('rechaza webhook firmado sin chargeId (body {}) — nunca captura con null', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const raw = '{}';
    const sig = await sign(raw, ts);
    const result = await acquirer.verifyWebhook({
      acquirer: 'yape',
      timestampSec: ts,
      nowSec: ts,
      rawBody: raw,
      signatureHeader: sig,
      secret,
    });
    expect(result.ok).toBe(false);
  });

  it('rechaza webhook firmado con status desconocido (fail-closed)', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const raw = JSON.stringify({ chargeId: 'ch-1', status: 'HAMMERED' });
    const sig = await sign(raw, ts);
    const result = await acquirer.verifyWebhook({
      acquirer: 'yape',
      timestampSec: ts,
      nowSec: ts,
      rawBody: raw,
      signatureHeader: sig,
      secret,
    });
    expect(result.ok).toBe(false);
  });

  it('acepta webhook firmado válido (chargeId + status CAPTURED)', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const raw = JSON.stringify({ chargeId: 'ch-2', status: 'CAPTURED', reference: 'ref-2' });
    const sig = await sign(raw, ts);
    const result = await acquirer.verifyWebhook({
      acquirer: 'yape',
      timestampSec: ts,
      nowSec: ts,
      rawBody: raw,
      signatureHeader: sig,
      secret,
    });
    expect(result.ok).toBe(true);
    expect(result.chargeId).toBe('ch-2');
  });

  it('timestamp futuro (> 300s) es replay: rechaza aun con firma válida', async () => {
    const ts = Math.floor(Date.now() / 1000) + 400;
    const raw = JSON.stringify({ chargeId: 'ch-3', status: 'CAPTURED' });
    const sig = await sign(raw, ts);
    const result = await acquirer.verifyWebhook({
      acquirer: 'yape',
      timestampSec: ts,
      nowSec: Math.floor(Date.now() / 1000),
      rawBody: raw,
      signatureHeader: sig,
      secret,
    });
    expect(result.ok).toBe(false);
  });
});
