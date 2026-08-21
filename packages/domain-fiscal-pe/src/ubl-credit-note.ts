/**
 * UBL 2.1 CreditNote builder (NC `07`) — zero-dep Web Platform.
 * Arquitectura §5.2 / §8 / ADR-FISCAL-001. Usa el mismo esqueleto UBL que la
 * factura (`ubl-shared`) y añade: `DiscrepancyResponse` (motivo Catálogo 09),
 * `BillingReference` al comprobante que ajusta y `CreditNoteLine` con montos
 * negativos (la NC resta). Las líneas provienen del documento ORIGEN que la NC
 * ajusta (la NC en sí no persiste sale_items: el monto viaja en la línea).
 */
/* eslint-disable no-secrets/no-secrets -- plantillas XML UBL normativas */

import { assertWellFormedXml, centsToAmount, escapeXml } from './ubl-shared.js';

export interface UblCreditNoteLine {
  readonly id: number;
  readonly description: string;
  readonly quantity: number;
  readonly unitCode: string;
  readonly igvAffectationCode: string; // Catálogo 07
  readonly igvCents: number;
  readonly lineTotalCents: number;
  readonly icbperCents: number;
}

export interface UblCreditNoteInput {
  readonly ublVersion: '2.1';
  readonly customizationId: '1.0'; // NC de factura (boleta usa RC, no XML unitario)
  readonly id: string; // FC01-00000001
  readonly issueDate: string; // YYYY-MM-DD Lima
  readonly issueTime: string; // HH:MM:SS
  readonly currency: 'PEN';
  readonly issuerRuc: string;
  readonly issuerName: string;
  readonly customerDocType: string;
  readonly customerDocNumber: string;
  readonly customerName: string;
  /** Documento origen que ajusta (factura `01`): serie-número. */
  readonly referencedDocId: string;
  /** Motivo Catálogo 09 (cerrado). */
  readonly motiveCode: string;
  readonly totalTaxableCents: number;
  readonly totalIgvCents: number;
  readonly totalIcbperCents: number;
  readonly totalAmountCents: number;
  readonly lines: readonly UblCreditNoteLine[];
}

function buildCreditNoteLines(input: UblCreditNoteInput, linesXml: string): string {
  return linesXml;
}

export function buildUblCreditNoteXml(input: UblCreditNoteInput): string {
  if (input.ublVersion !== '2.1') throw new Error('UNSUPPORTED_UBL_VERSION');
  if (!/^\d{11}$/.test(input.issuerRuc)) throw new Error('INVALID_ISSUER_RUC');
  if (!/^[A-Za-z0-9-]{1,20}$/.test(input.referencedDocId))
    throw new Error('INVALID_REFERENCED_DOC');
  if (!/^\d{2}$/.test(input.motiveCode)) throw new Error('INVALID_MOTIVE_CODE');
  if (!input.lines.length) throw new Error('EMPTY_LINES');
  if (input.totalAmountCents >= 0) throw new Error('NC_TOTAL_MUST_BE_NEGATIVE');

  const linesXml = input.lines
    .map((line) => {
      const netCents = line.lineTotalCents - line.igvCents - line.icbperCents;
      return `
  <cac:CreditNoteLine>
    <cbc:ID>${line.id}</cbc:ID>
    <cbc:CreditedQuantity unitCode="${escapeXml(line.unitCode)}">${line.quantity}</cbc:CreditedQuantity>
    <cbc:LineExtensionAmount currencyID="${input.currency}">${centsToAmount(netCents)}</cbc:LineExtensionAmount>
    <cac:PricingReference>
      <cac:AlternativeConditionPrice>
        <cbc:PriceAmount currencyID="${input.currency}">${centsToAmount(line.lineTotalCents)}</cbc:PriceAmount>
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
  </cac:CreditNoteLine>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>${input.customizationId}</cbc:CustomizationID>
  <cbc:ID>${escapeXml(input.id)}</cbc:ID>
  <cbc:IssueDate>${escapeXml(input.issueDate)}</cbc:IssueDate>
  <cbc:IssueTime>${escapeXml(input.issueTime)}</cbc:IssueTime>
  <cbc:CreditNoteTypeCode listID="0101">07</cbc:CreditNoteTypeCode>
  <cbc:DocumentCurrencyCode>${input.currency}</cbc:DocumentCurrencyCode>
  <cac:DiscrepancyResponse>
    <cbc:ReferenceID>${escapeXml(input.referencedDocId)}</cbc:ReferenceID>
    <cbc:ResponseCode>${escapeXml(input.motiveCode)}</cbc:ResponseCode>
  </cac:DiscrepancyResponse>
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${escapeXml(input.referencedDocId)}</cbc:ID>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>
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
  </cac:LegalMonetaryTotal>${buildCreditNoteLines(input, linesXml)}
</CreditNote>
`;
}

export function assertValidCreditNoteXml(xml: string): void {
  assertWellFormedXml(xml);
  if (!xml.includes('<cbc:UBLVersionID>2.1</cbc:UBLVersionID>')) {
    throw new Error('INVALID_UBL_VERSION');
  }
  if (!xml.includes('<cbc:CreditNoteTypeCode listID="0101">07</cbc:CreditNoteTypeCode>')) {
    throw new Error('INVALID_CREDIT_NOTE_TYPE');
  }
  if (!xml.includes('<cac:DiscrepancyResponse>')) throw new Error('MISSING_DISCREPANCY_RESPONSE');
  if (!xml.includes('<cac:BillingReference>')) throw new Error('MISSING_BILLING_REFERENCE');
  if (!xml.includes('<cac:CreditNoteLine>')) throw new Error('MISSING_LINES');
  if (xml.toLowerCase().includes('contingencia')) throw new Error('CONTINGENCIA_FORBIDDEN');
}
