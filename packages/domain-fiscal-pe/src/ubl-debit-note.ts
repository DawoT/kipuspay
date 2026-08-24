/**
 * UBL 2.1 DebitNote builder (ND `08`) — zero-dep Web Platform.
 * Arquitectura §5.2 / §8 / ADR-FISCAL-003. Mismo esqueleto UBL que la NC
 * (`ubl-shared`) con: `DiscrepancyResponse` (motivo INTERNO traducido a wire
 * catálogo 10 vía `nd-motive-catalog` — FL-1: CDR 2172 con wire 06), referencia
 * al comprobante que ajusta y `DebitNoteLine` con montos POSITIVOS (la ND
 * incrementa valor; jamás toca stock, FIS-13/ADR-FISCAL-003).
 */

import { assertWellFormedXml, centsToAmount, escapeXml, ublIgvPercent } from './ubl-shared.js';
import { translateNdMotiveToWire } from './nd-motive-catalog.js';

export interface UblDebitNoteLine {
  readonly id: number;
  readonly description: string;
  readonly quantity: number;
  readonly unitCode: string;
  readonly igvAffectationCode: string; // Catálogo 07
  readonly igvCents: number;
  readonly lineTotalCents: number;
  readonly icbperCents: number;
}

export interface UblDebitNoteInput {
  readonly ublVersion: '2.1';
  readonly customizationId: '2.0';
  readonly id: string; // FD01-00000001
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
  /** Motivo INTERNO (taxonomía ADR-FISCAL-003: 01|02|03|10); se traduce a
   *  wire catálogo 10 — desconocido o sin homologar lanza error tipado. */
  readonly motiveCode: string;
  readonly totalTaxableCents: number;
  readonly totalIgvCents: number;
  readonly totalIcbperCents: number;
  readonly totalAmountCents: number;
  readonly lines: readonly UblDebitNoteLine[];
}

export function buildUblDebitNoteXml(input: UblDebitNoteInput): string {
  if (input.ublVersion !== '2.1') throw new Error('UNSUPPORTED_UBL_VERSION');
  if (!/^\d{11}$/.test(input.issuerRuc)) throw new Error('INVALID_ISSUER_RUC');
  if (!/^[A-Za-z0-9-]{1,20}$/.test(input.referencedDocId))
    throw new Error('INVALID_REFERENCED_DOC');
  // Fail-closed: el motivo interno se traduce a wire catálogo 10 ANTES de
  // construir XML — desconocido (p.ej. `06`, CDR 2172 FL-1) o sin homologar
  // (`10`) lanza error tipado y jamás produce DebitNote.
  const motiveWire = translateNdMotiveToWire(input.motiveCode);
  if (!input.lines.length) throw new Error('EMPTY_LINES');
  if (input.totalAmountCents <= 0) throw new Error('ND_TOTAL_MUST_BE_POSITIVE');

  const linesXml = input.lines
    .map((line) => {
      const netCents = line.lineTotalCents - line.igvCents - line.icbperCents;
      return `
  <cac:DebitNoteLine>
    <cbc:ID>${line.id}</cbc:ID>
    <cbc:DebitedQuantity unitCode="${escapeXml(line.unitCode)}">${line.quantity}</cbc:DebitedQuantity>
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
        <cbc:TaxableAmount currencyID="${input.currency}">${centsToAmount(netCents)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${input.currency}">${centsToAmount(line.igvCents)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:Percent>${ublIgvPercent(line.igvAffectationCode)}</cbc:Percent>
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
  </cac:DebitNoteLine>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<DebitNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>${input.customizationId}</cbc:CustomizationID>
  <cbc:ProfileID>0101</cbc:ProfileID>
  <cbc:ID>${escapeXml(input.id)}</cbc:ID>
  <cbc:IssueDate>${escapeXml(input.issueDate)}</cbc:IssueDate>
  <cbc:IssueTime>${escapeXml(input.issueTime)}</cbc:IssueTime>
  <!-- Sin cbc:DebitNoteTypeCode: el schema restringido de SUNAT e-beta NO lo
       admite (CDR 0306 cvc-particle, FL-1 2026-08-24); el tipo 08 vive en el
       root <DebitNote>. Shape idéntico al FD01-00000001 ACEPTADO (CDR 0). -->
  <cbc:DocumentCurrencyCode>${input.currency}</cbc:DocumentCurrencyCode>
  <cac:DiscrepancyResponse>
    <cbc:ReferenceID>${escapeXml(input.referencedDocId)}</cbc:ReferenceID>
    <cbc:ResponseCode>${escapeXml(motiveWire.responseCode)}</cbc:ResponseCode>
    <cbc:Description>${escapeXml(motiveWire.description)}</cbc:Description>
  </cac:DiscrepancyResponse>
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${escapeXml(input.referencedDocId)}</cbc:ID>
      <cbc:DocumentTypeCode>01</cbc:DocumentTypeCode>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6">${escapeXml(input.issuerRuc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(input.issuerName)}</cbc:RegistrationName>
        <cac:RegistrationAddress>
          <cbc:AddressTypeCode>0000</cbc:AddressTypeCode>
        </cac:RegistrationAddress>
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
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${input.currency}">${centsToAmount(input.totalTaxableCents)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${input.currency}">${centsToAmount(input.totalIgvCents)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:Percent>${input.totalIgvCents === 0 ? '0.00' : '18.00'}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>1000</cbc:ID>
          <cbc:Name>IGV</cbc:Name>
          <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <!-- UBL 2.1 DebitNote usa cac:RequestedMonetaryTotal (no LegalMonetaryTotal;
       e-beta 0306 cvc-particle, FL-1 2026-08-24). -->
  <cac:RequestedMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${input.currency}">${centsToAmount(input.totalTaxableCents)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${input.currency}">${centsToAmount(input.totalAmountCents)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${input.currency}">${centsToAmount(input.totalAmountCents)}</cbc:PayableAmount>
  </cac:RequestedMonetaryTotal>${linesXml}
</DebitNote>
`;
}

export function assertValidDebitNoteXml(xml: string): void {
  assertWellFormedXml(xml);
  if (!xml.includes('<cbc:UBLVersionID>2.1</cbc:UBLVersionID>')) {
    throw new Error('INVALID_UBL_VERSION');
  }
  // e-beta 0306 (FL-1 2026-08-24): el schema restringido rechaza el elemento.
  if (xml.includes('<cbc:DebitNoteTypeCode')) throw new Error('INVALID_DEBIT_NOTE_TYPE');
  if (!xml.includes('<cac:DiscrepancyResponse>')) throw new Error('MISSING_DISCREPANCY_RESPONSE');
  const discStart = xml.indexOf('<cac:DiscrepancyResponse>');
  const discEnd = xml.indexOf('</cac:DiscrepancyResponse>');
  if (
    discStart < 0 ||
    discEnd < 0 ||
    !xml.slice(discStart, discEnd).includes('<cbc:Description>')
  ) {
    throw new Error('MISSING_DISCREPANCY_DESCRIPTION');
  }
  if (!xml.includes('<cac:BillingReference>')) throw new Error('MISSING_BILLING_REFERENCE');
  if (!xml.includes('<cbc:DocumentTypeCode>01</cbc:DocumentTypeCode>')) {
    throw new Error('MISSING_REFERENCE_DOCUMENT_TYPE');
  }
  if (!xml.includes('<cac:DebitNoteLine>')) throw new Error('MISSING_LINES');
  if (xml.toLowerCase().includes('contingencia')) throw new Error('CONTINGENCIA_FORBIDDEN');
}
