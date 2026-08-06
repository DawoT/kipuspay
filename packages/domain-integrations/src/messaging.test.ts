import { describe, expect, it } from 'vitest';
import {
  assertSendableReceipt,
  assertWhatsAppOptIn,
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
});
