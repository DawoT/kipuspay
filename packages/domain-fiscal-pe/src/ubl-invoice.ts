/**
 * UBL 2.1 Invoice builder mínimo (factura 01) — zero-dep Web Platform.
 * Arquitectura §5.2 / ADR-FISCAL-001. No usa npm runtime.
 */

export interface UblInvoiceLine {
  readonly id: number;
  readonly description: string;
  readonly quantity: number;
  readonly unitCode: string;
  readonly unitPriceCents: number;
  readonly igvAffectationCode: string; // Catálogo 07
  readonly igvCents: number;
  readonly lineTotalCents: number;
  readonly icbperCents: number;
}

export interface UblInvoiceInput {
  readonly ublVersion: '2.1';
  readonly customizationId: '2.0';
  readonly id: string; // F001-00000001
  readonly issueDate: string; // YYYY-MM-DD Lima
  readonly issueTime: string; // HH:MM:SS
  readonly invoiceTypeCode: '01' | '03';
  readonly currency: 'PEN';
  readonly issuerRuc: string;
  readonly issuerName: string;
  readonly customerDocType: string;
  readonly customerDocNumber: string;
  readonly customerName: string;
  readonly totalTaxableCents: number;
  readonly totalIgvCents: number;
  readonly totalIcbperCents: number;
  readonly totalAmountCents: number;
  readonly lines: readonly UblInvoiceLine[];
}

import { assertWellFormedXml, centsToAmount, escapeXml, hashUblXml } from './ubl-shared.js';

/** Construye XML UBL Invoice 2.1 mínimo válido para fixtures de prueba. */
export function buildUblInvoiceXml(input: UblInvoiceInput): string {
  if (input.ublVersion !== '2.1') throw new Error('UNSUPPORTED_UBL_VERSION');
  if (!/^\d{11}$/.test(input.issuerRuc)) throw new Error('INVALID_ISSUER_RUC');
  if (input.invoiceTypeCode === '01' && input.customerDocType !== '6') {
    throw new Error('FACTURA_REQUIRES_RUC');
  }
  if (!input.lines.length) throw new Error('EMPTY_LINES');

  const linesXml = input.lines
    .map((line) => {
      const netCents = line.lineTotalCents - line.igvCents - line.icbperCents;
      const unitValueCents = Math.round(netCents / (line.quantity || 1));
      return `
  <cac:InvoiceLine>
    <cbc:ID>${line.id}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${escapeXml(line.unitCode)}">${line.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${input.currency}">${centsToAmount(netCents)}</cbc:LineExtensionAmount>
    <cac:PricingReference>
      <cac:AlternativeConditionPrice>
        <cbc:PriceAmount currencyID="${input.currency}">${centsToAmount(line.unitPriceCents)}</cbc:PriceAmount>
        <cbc:PriceTypeCode>01</cbc:PriceTypeCode>
      </cac:AlternativeConditionPrice>
    </cac:PricingReference>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${input.currency}">${centsToAmount(line.igvCents + line.icbperCents)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxAmount currencyID="${input.currency}">${centsToAmount(line.igvCents)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:TaxExemptionReasonCode>${escapeXml(line.igvAffectationCode)}</cbc:TaxExemptionReasonCode>
          <cac:TaxScheme>
            <cbc:ID>1000</cbc:ID>
            <cbc:Name>IGV</cbc:Name>
            <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Description>${escapeXml(line.description)}</cbc:Description>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${input.currency}">${centsToAmount(unitValueCents)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>${input.customizationId}</cbc:CustomizationID>
  <cbc:ID>${escapeXml(input.id)}</cbc:ID>
  <cbc:IssueDate>${escapeXml(input.issueDate)}</cbc:IssueDate>
  <cbc:IssueTime>${escapeXml(input.issueTime)}</cbc:IssueTime>
  <cbc:InvoiceTypeCode listID="0101">${input.invoiceTypeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${input.currency}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6">${escapeXml(input.issuerRuc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(input.issuerName)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${escapeXml(input.customerDocType)}">${escapeXml(input.customerDocNumber)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(input.customerName)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${input.currency}">${centsToAmount(input.totalIgvCents + input.totalIcbperCents)}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${input.currency}">${centsToAmount(input.totalTaxableCents)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${input.currency}">${centsToAmount(input.totalAmountCents)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${input.currency}">${centsToAmount(input.totalAmountCents)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${linesXml}
</Invoice>
`;
}

/** Firma detachada SHA-256 del XML (staging / mock PSE — no XAdES completo). */
export { hashUblXml };

export { assertWellFormedXml };

export function assertValidFacturaXml(xml: string): void {
  assertWellFormedXml(xml);
  if (!xml.includes('<cbc:UBLVersionID>2.1</cbc:UBLVersionID>')) {
    throw new Error('INVALID_UBL_VERSION');
  }
  if (!xml.includes('<cbc:InvoiceTypeCode')) throw new Error('MISSING_INVOICE_TYPE');
  if (!xml.includes('schemeID="6"')) throw new Error('MISSING_ISSUER_RUC');
  if (!xml.includes('<cac:InvoiceLine>')) throw new Error('MISSING_LINES');
  if (xml.toLowerCase().includes('contingencia')) throw new Error('CONTINGENCIA_FORBIDDEN');
}
