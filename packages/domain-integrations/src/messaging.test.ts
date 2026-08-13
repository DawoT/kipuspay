import { describe, expect, it } from 'vitest';
import {
  assertSendableQuote,
  assertSendableReceipt,
  assertWhatsAppOptIn,
  QUOTE_TEMPLATE_ID,
  receiptLegend,
  receiptTemplateId,
} from './messaging.js';

describe('messaging', () => {
  it('0 envíos sin opt-in', () => {
    expect(() => assertWhatsAppOptIn(false)).toThrow('WHATSAPP_OPT_IN_REQUIRED');
    expect(() => assertWhatsAppOptIn(true)).not.toThrow();
  });

  it('templates NV vs CPE', () => {
    expect(receiptTemplateId('NV')).toBe('kipus_nv_receipt_v1');
    expect(receiptTemplateId('CPE')).toBe('kipus_cpe_receipt_v1');
    expect(receiptLegend('NV')).toMatch(/no es comprobante fiscal/i);
    expect(receiptLegend('CPE')).toMatch(/SUNAT/i);
  });

  it('assertSendableReceipt exige opt-in + phone + https', () => {
    const base = {
      tenantId: 't1',
      customerId: 'c1',
      saleId: 's1',
      documentKind: 'NV' as const,
      phoneE164: '+51999999999',
      optedIn: true,
      representationUrl: 'https://cdn.example/r.pdf',
    };
    expect(() => assertSendableReceipt(base)).not.toThrow();
    expect(() => assertSendableReceipt({ ...base, optedIn: false })).toThrow(
      'WHATSAPP_OPT_IN_REQUIRED',
    );
    expect(() => assertSendableReceipt({ ...base, phoneE164: '999' })).toThrow(
      'WHATSAPP_PHONE_INVALID',
    );
    expect(() =>
      assertSendableReceipt({ ...base, representationUrl: 'http://insecure/x' }),
    ).toThrow('WHATSAPP_URL_NOT_HTTPS');
  });

  it('sendQuote usa plantilla kipus_quote_v1 y no finge NV', () => {
    expect(QUOTE_TEMPLATE_ID).toBe('kipus_quote_v1');
    const quote = {
      tenantId: 't1',
      customerId: 'c1',
      quoteId: 'q1',
      phoneE164: '+51999999999',
      optedIn: true,
      representationUrl: 'https://cdn.example/q.pdf',
    };
    expect(() => assertSendableQuote(quote)).not.toThrow();
    expect(() => assertSendableQuote({ ...quote, optedIn: false })).toThrow(
      'WHATSAPP_OPT_IN_REQUIRED',
    );
    expect(() => assertSendableQuote({ ...quote, phoneE164: '999' })).toThrow(
      'WHATSAPP_PHONE_INVALID',
    );
    expect(() => assertSendableQuote({ ...quote, representationUrl: 'http://insecure/x' })).toThrow(
      'WHATSAPP_URL_NOT_HTTPS',
    );
  });
});

describe('S24-H1 validación E.164', () => {
  const base = {
    tenantId: 't1',
    customerId: 'c1',
    saleId: 's1',
    documentKind: 'CPE' as const,
    optedIn: true,
    phoneE164: '+51999999999',
    representationUrl: 'https://tickets.kipuspay.com/CPE/1',
  };

  it('rechaza phoneE164 con letras (+5199999999a)', () => {
    expect(() =>
      assertSendableReceipt({ ...base, phoneE164: '+5199999999a' }),
    ).toThrow('WHATSAPP_PHONE_INVALID');
  });

  it('rechaza phoneE164 con dígitos pero sin +', () => {
    expect(() => assertSendableReceipt({ ...base, phoneE164: '51999999999' })).toThrow(
      'WHATSAPP_PHONE_INVALID',
    );
  });

  it('rechaza phoneE164 demasiado corto (menos de 10 dígitos)', () => {
    expect(() => assertSendableReceipt({ ...base, phoneE164: '+12345' })).toThrow(
      'WHATSAPP_PHONE_INVALID',
    );
  });

  it('rechaza representationUrl http:// (solo https)', () => {
    expect(() =>
      assertSendableReceipt({ ...base, representationUrl: 'http://tickets.kipuspay.com/x' }),
    ).toThrow('WHATSAPP_URL_NOT_HTTPS');
  });

  it('rechaza representationUrl no-URL (javascript: o texto plano)', () => {
    expect(() =>
      assertSendableReceipt({ ...base, representationUrl: 'javascript:alert(1)' }),
    ).toThrow('WHATSAPP_URL_NOT_HTTPS');
  });

  it('acepta E.164 válido peruano', () => {
    expect(() =>
      assertSendableReceipt({ ...base, phoneE164: '+51999999999' }),
    ).not.toThrow();
  });
});
