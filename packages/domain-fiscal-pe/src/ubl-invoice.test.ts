import { describe, expect, it } from 'vitest';
/* eslint-disable no-secrets/no-secrets -- fixtures XML de prueba */
import {
  assertValidFacturaXml,
  buildUblInvoiceXml,
  hashUblXml,
  type UblInvoiceInput,
} from './ubl-invoice.js';

const sample = (): UblInvoiceInput => ({
  ublVersion: '2.1',
  customizationId: '2.0',
  id: 'F001-00000001',
  issueDate: '2026-08-04',
  issueTime: '10:00:00',
  invoiceTypeCode: '01',
  currency: 'PEN',
  issuerRuc: '20123456789',
  issuerName: 'KipusPay SAC',
  customerDocType: '6',
  customerDocNumber: '20987654321',
  customerName: 'Cliente SAC',
  totalTaxableCents: 1000,
  totalIgvCents: 180,
  totalIcbperCents: 0,
  totalAmountCents: 1180,
  lines: [
    {
      id: 1,
      description: 'Producto A&B',
      quantity: 1,
      unitCode: 'NIU',
      unitPriceCents: 1000,
      igvAffectationCode: '10',
      igvCents: 180,
      lineTotalCents: 1180,
      icbperCents: 0,
    },
  ],
});

describe('buildUblInvoiceXml', () => {
  it('genera XML factura 2.1 válido (100% fixture CA)', async () => {
    const xml = buildUblInvoiceXml(sample());
    expect(() => assertValidFacturaXml(xml)).not.toThrow();
    expect(xml).toContain('F001-00000001');
    expect(xml).toContain('TaxExemptionReasonCode>10<');
    expect(xml).toContain('A&amp;B');
    const hash = await hashUblXml(xml);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rechaza inputs inválidos y XML incompleto', () => {
    expect(() =>
      buildUblInvoiceXml({ ...sample(), customerDocType: '1', customerDocNumber: '123' }),
    ).toThrow(/FACTURA_REQUIRES_RUC/);
    expect(() => buildUblInvoiceXml({ ...sample(), lines: [] })).toThrow(/EMPTY_LINES/);
    expect(() => buildUblInvoiceXml({ ...sample(), issuerRuc: '123' })).toThrow(
      /INVALID_ISSUER_RUC/,
    );
    expect(() => buildUblInvoiceXml({ ...sample(), ublVersion: '2.0' as '2.1' })).toThrow(
      /UNSUPPORTED_UBL_VERSION/,
    );

    expect(() => assertValidFacturaXml('<Invoice/>')).toThrow(/INVALID_UBL_VERSION/);
    expect(() =>
      assertValidFacturaXml('<Invoice><cbc:UBLVersionID>2.1</cbc:UBLVersionID></Invoice>'),
    ).toThrow(/MISSING_INVOICE_TYPE/);
    expect(() =>
      assertValidFacturaXml(
        '<Invoice><cbc:UBLVersionID>2.1</cbc:UBLVersionID><cbc:InvoiceTypeCode>01</cbc:InvoiceTypeCode></Invoice>',
      ),
    ).toThrow(/MISSING_ISSUER_RUC/);
    expect(() =>
      assertValidFacturaXml(
        '<Invoice><cbc:UBLVersionID>2.1</cbc:UBLVersionID><cbc:InvoiceTypeCode>01</cbc:InvoiceTypeCode>schemeID="6"</Invoice>',
      ),
    ).toThrow(/MISSING_LINES/);
    expect(() =>
      assertValidFacturaXml(
        '<Invoice><cbc:UBLVersionID>2.1</cbc:UBLVersionID><cbc:InvoiceTypeCode>01</cbc:InvoiceTypeCode>schemeID="6"<cac:InvoiceLine></cac:InvoiceLine>contingencia</Invoice>',
      ),
    ).toThrow(/CONTINGENCIA_FORBIDDEN/);
  });
});
