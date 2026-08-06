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

  it('sandbox acepta sin token', async () => {
    const sender = createWhatsAppMessagingSender({});
    const res = await sender.sendReceipt(baseReq);
    expect(res.accepted).toBe(true);
    expect(res.providerRef).toBe('sandbox:s1');
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
});
