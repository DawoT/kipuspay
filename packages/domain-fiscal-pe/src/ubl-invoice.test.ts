import { describe, expect, it } from 'vitest';
/* eslint-disable no-secrets/no-secrets -- fixtures XML de prueba */
import {
  assertValidFacturaXml,
  assertWellFormedXml,
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

  it('F5-1: rechaza XML malformado aunque los substrings UBL estén presentes', () => {
    // Tag de apertura sin cierre — los 5 includes de assertValidFacturaXml pasan.
    const broken = buildUblInvoiceXml(sample()).replace(
      '<cbc:UBLVersionID>2.1</cbc:UBLVersionID>',
      '<cbc:UBLVersionID>2.1',
    );
    expect(() => assertValidFacturaXml(broken)).toThrow(/MALFORMED_XML/);

    // Root duplicado (dos raíces) — well-formedness violada.
    const dupRoot =
      buildUblInvoiceXml(sample())
        .trim()
        .replace(/\s*<Invoice xmlns=/, '<Invoice xmlns=') + '<Invoice/>';
    expect(() => assertValidFacturaXml(dupRoot)).toThrow(/MALFORMED_XML/);

    // Atributo sin comillas.
    const unquoted = buildUblInvoiceXml(sample()).replace(
      'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"',
      'xmlns:cbc=urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
    );
    expect(() => assertValidFacturaXml(unquoted)).toThrow(/MALFORMED_XML/);

    // Cierre desbalanceado (tag cerrado que nunca se abrió).
    const dangling = buildUblInvoiceXml(sample()) + '</cac:InvoiceLine>';
    expect(() => assertValidFacturaXml(dangling)).toThrow(/MALFORMED_XML/);
  });

  it('F5-1: XML generado por el builder es well-formed y estructuralmente UBL', () => {
    const xml = buildUblInvoiceXml(sample());
    expect(() => assertValidFacturaXml(xml)).not.toThrow();
    // Estructura: root Invoice con un único elemento raíz y monedas PEN.
    expect(xml.trim().startsWith('<?xml')).toBe(true);
    expect(xml.trim().endsWith('</Invoice>')).toBe(true);
  });

  it('F5-1: parser well-formedness cubre comentarios, CDATA, self-closing y entidades', () => {
    // XML válido con declaración, comentario, self-closing, CDATA y entidad.
    expect(() =>
      assertWellFormedXml(
        '<?xml version="1.0"?><Invoice><!-- c --><cac:Line/><cbc:ID><![CDATA[x]]></cbc:ID>&amp;text</Invoice>',
      ),
    ).not.toThrow();
    // Entidad inválida.
    expect(() => assertWellFormedXml('<Invoice><cbc:ID>&bogus;</cbc:ID></Invoice>')).toThrow(
      /MALFORMED_XML/,
    );
    // Segundo root.
    expect(() => assertWellFormedXml('<Invoice><a/></Invoice><b/>')).toThrow(/MALFORMED_XML/);
    // Root sin cerrar.
    expect(() => assertWellFormedXml('<Invoice><a></a>')).toThrow(/MALFORMED_XML/);
    // Sin root.
    expect(() => assertWellFormedXml('   ')).toThrow(/MALFORMED_XML/);
    // Tag abierto sin `>`.
    expect(() => assertWellFormedXml('<Invoice></Invoice')).toThrow(/MALFORMED_XML/);
    // Comentario sin cerrar.
    expect(() => assertWellFormedXml('<!-- x')).toThrow(/MALFORMED_XML/);
    // CDATA sin cerrar.
    expect(() => assertWellFormedXml('<Invoice><![CDATA[')).toThrow(/MALFORMED_XML/);
    // Atributo sin comillas.
    expect(() => assertWellFormedXml('<Invoice a=1></Invoice>')).toThrow(/MALFORMED_XML/);
    // Atributo sin `=`.
    expect(() => assertWellFormedXml('<Invoice a="1" b></Invoice>')).toThrow(/MALFORMED_XML/);
    // Valor de atributo sin cerrar (fin de archivo dentro del valor).
    expect(() => assertWellFormedXml('<Invoice a="1')).toThrow(/MALFORMED_XML/);
    // Entidad inválida en valor de atributo.
    expect(() => assertWellFormedXml('<Invoice a="x&bad;"></Invoice>')).toThrow(/MALFORMED_XML/);
    // Declaración XML sin cerrar.
    expect(() => assertWellFormedXml('<?xml version="1.0"')).toThrow(/MALFORMED_XML/);
    // Tag de apertura sin `>`.
    expect(() => assertWellFormedXml('<Invoice a="1"')).toThrow(/MALFORMED_XML/);
    // Texto con `&` sin entidad válida.
    expect(() => assertWellFormedXml('<Invoice>a & b</Invoice>')).toThrow(/MALFORMED_XML/);
    // Cierre malformado (nombre seguido de no-`>`).
    expect(() => assertWellFormedXml('<Invoice></Invoice x>')).toThrow(/MALFORMED_XML/);
    // Self-closing malformado (`/x` sin `>`).
    expect(() => assertWellFormedXml('<Invoice><a/x></Invoice>')).toThrow(/MALFORMED_XML/);
  });
});
