import { describe, expect, it, vi } from 'vitest';
import { createWhatsAppMessagingSender, isPlausibleEmail, normalizeRecipient } from './index.js';

describe('normalizeRecipient', () => {
  it('normaliza espacios y mayúsculas', () => {
    expect(normalizeRecipient('  USER@Example.COM ')).toBe('user@example.com');
  });
});

describe('isPlausibleEmail', () => {
  it('requiere un @', () => {
    expect(isPlausibleEmail('user@example.com')).toBe(true);
    expect(isPlausibleEmail('no-email')).toBe(false);
  });
});

describe('createWhatsAppMessagingSender', () => {
  const baseReq = {
    tenantId: 't1',
    customerId: 'c1',
    saleId: 's1',
    documentKind: 'NV' as const,
    phoneE164: '+51999888777',
    optedIn: true,
    representationUrl: 'https://cpe.example/s1',
  };

  it('S43-H1: sin token NUNCA afirma entrega (fail-closed, 0 ACK falso)', async () => {
    const sender = createWhatsAppMessagingSender({});
    const res = await sender.sendReceipt(baseReq);
    expect(res.accepted).toBe(false);
    expect(res.providerRef).toBeNull();
    expect(res.templateId).toBe('kipus_nv_receipt_v1');
  });

  it('rechaza sin opt-in', async () => {
    const sender = createWhatsAppMessagingSender({});
    await expect(sender.sendReceipt({ ...baseReq, optedIn: false })).rejects.toThrow(
      'WHATSAPP_OPT_IN_REQUIRED',
    );
  });

  it('HTTP real cuando hay secrets', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(Response.json({ messages: [{ id: 'wamid.1' }] })),
    ) as unknown as typeof fetch;
    const sender = createWhatsAppMessagingSender(
      { WA_ACCESS_TOKEN: 'tok', WA_PHONE_NUMBER_ID: 'pn1' },
      fetchImpl,
    );
    const res = await sender.sendReceipt({ ...baseReq, documentKind: 'CPE' });
    expect(res.accepted).toBe(true);
    expect(res.providerRef).toBe('wamid.1');
    expect(res.templateId).toBe('kipus_cpe_receipt_v1');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('HTTP receipt no aceptado si Graph falla', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response('err', { status: 500 })),
    ) as unknown as typeof fetch;
    const sender = createWhatsAppMessagingSender(
      { WA_ACCESS_TOKEN: 'tok', WA_PHONE_NUMBER_ID: 'pn1' },
      fetchImpl,
    );
    const res = await sender.sendReceipt(baseReq);
    expect(res.accepted).toBe(false);
    expect(res.providerRef).toBeNull();
  });

  it('S43-H1: sendQuote sin token → fail-closed (0 sandbox fingido)', async () => {
    const sender = createWhatsAppMessagingSender({});
    const res = await sender.sendQuote!({
      tenantId: 't1',
      customerId: 'c1',
      quoteId: 'q1',
      phoneE164: '+51999888777',
      optedIn: true,
      representationUrl: 'https://cdn.example/q.pdf',
    });
    expect(res.accepted).toBe(false);
    expect(res.providerRef).toBeNull();
    expect(res.templateId).toBe('kipus_quote_v1');
  });

  it('sendQuote exige opt-in', async () => {
    const sender = createWhatsAppMessagingSender({});
    await expect(
      sender.sendQuote!({
        tenantId: 't1',
        customerId: 'c1',
        quoteId: 'q1',
        phoneE164: '+51999888777',
        optedIn: false,
        representationUrl: 'https://cdn.example/q.pdf',
      }),
    ).rejects.toThrow('WHATSAPP_OPT_IN_REQUIRED');
  });

  it('sendQuote HTTP real y fallo Graph', async () => {
    const okFetch = vi.fn(() =>
      Promise.resolve(Response.json({ messages: [{ id: 'wamid.q' }] })),
    ) as unknown as typeof fetch;
    const okSender = createWhatsAppMessagingSender(
      {
        WA_ACCESS_TOKEN: 'tok',
        WA_PHONE_NUMBER_ID: 'pn1',
        WA_API_BASE: 'https://graph.example/v19.0/',
      },
      okFetch,
    );
    const ok = await okSender.sendQuote!({
      tenantId: 't1',
      customerId: 'c1',
      quoteId: 'q1',
      phoneE164: '+51999888777',
      optedIn: true,
      representationUrl: 'https://cdn.example/q.pdf',
    });
    expect(ok.accepted).toBe(true);
    expect(ok.providerRef).toBe('wamid.q');
    expect(ok.templateId).toBe('kipus_quote_v1');

    const failFetch = vi.fn(() =>
      Promise.resolve(new Response('err', { status: 502 })),
    ) as unknown as typeof fetch;
    const failSender = createWhatsAppMessagingSender(
      { WA_ACCESS_TOKEN: 'tok', WA_PHONE_NUMBER_ID: 'pn1' },
      failFetch,
    );
    const fail = await failSender.sendQuote!({
      tenantId: 't1',
      customerId: 'c1',
      quoteId: 'q1',
      phoneE164: '+51999888777',
      optedIn: true,
      representationUrl: 'https://cdn.example/q.pdf',
    });
    expect(fail.accepted).toBe(false);
    expect(fail.providerRef).toBeNull();
  });
});
