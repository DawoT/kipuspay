import { describe, expect, it } from 'vitest';
import { buildCustomerExport, CUSTOMER_ERASED, type CustomerProfileForExport } from './export.js';

const customer: CustomerProfileForExport = {
  id: 'c1',
  tenantId: 't1',
  documentTypeCode: '1',
  documentNumber: '12345678',
  name: 'Ana Pérez',
  email: 'ana@example.com',
  phone: '999111222',
  address: 'Jr. Lima 123',
  piiErased: false,
};

const sales = [
  {
    saleId: 's1',
    tenantId: 't1',
    documentType: '01',
    series: 'F001',
    number: 1,
    issuedAtLimaIso: '2026-08-01T10:00:00.000-05:00',
    totalAmountCents: 11800,
  },
  {
    saleId: 's2',
    tenantId: 't2',
    documentType: '01',
    series: 'F001',
    number: 1,
    issuedAtLimaIso: '2026-08-01T10:00:00.000-05:00',
    totalAmountCents: 999,
  },
];

const consents = [
  {
    purpose: 'marketing',
    granted: true,
    grantedAtIso: '2026-08-01T00:00:00.000Z',
    revokedAtIso: null,
  },
  {
    purpose: 'messaging_whatsapp',
    granted: false,
    grantedAtIso: null,
    revokedAtIso: '2026-08-02T00:00:00.000Z',
  },
];

describe('export LPDP-02', () => {
  it('incluye perfil, consentimientos y ventas solo del titular', () => {
    const payload = buildCustomerExport(customer, consents, sales);
    expect(payload.customerId).toBe('c1');
    expect(payload.profile).toEqual({
      documentTypeCode: '1',
      documentNumber: '12345678',
      name: 'Ana Pérez',
      email: 'ana@example.com',
      phone: '999111222',
      address: 'Jr. Lima 123',
    });
    expect(payload.consents).toHaveLength(2);
    expect(payload.sales.map((s) => s.saleId)).toEqual(['s1']);
  });

  it('incluye ventas de cualquier tenant solo si pertenecen al titular', () => {
    const payload = buildCustomerExport(customer, consents, [{ ...sales[0]! }]);
    expect(payload.sales).toHaveLength(1);
  });

  it('lanza CUSTOMER_ERASED para fila anonimizada', () => {
    expect(() => buildCustomerExport({ ...customer, piiErased: true }, consents, sales)).toThrow(
      CUSTOMER_ERASED,
    );
  });
});
