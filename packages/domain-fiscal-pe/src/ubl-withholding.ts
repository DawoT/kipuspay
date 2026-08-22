/**
 * UBL Percepción `02` / Retención `20` — zero-dep Web Platform.
 * Arquitectura §5.2c / ADR-FISCAL-005. Montos en cents (enteros).
 */
import { assertWellFormedXml, centsToAmount, escapeXml } from './ubl-shared.js';

export interface UblWithholdingInput {
  readonly ublVersion: '2.0';
  readonly documentType: '02' | '20';
  readonly id: string;
  readonly issueDate: string;
  readonly issuerRuc: string;
  readonly issuerName: string;
  readonly customerDocType: string;
  readonly customerDocNumber: string;
  readonly customerName: string;
  readonly referencedDocId: string;
  readonly baseAmountCents: number;
  readonly amountCents: number;
  readonly ratePercentage: number;
}

function rootName(documentType: '02' | '20'): 'Perception' | 'Retention' {
  return documentType === '02' ? 'Perception' : 'Retention';
}

export function buildUblWithholdingXml(input: UblWithholdingInput): string {
  if (input.ublVersion !== '2.0') throw new Error('UNSUPPORTED_UBL_VERSION');
  if (!/^\d{11}$/.test(input.issuerRuc)) throw new Error('INVALID_ISSUER_RUC');
  if (!Number.isInteger(input.baseAmountCents) || input.baseAmountCents <= 0) {
    throw new Error('INVALID_BASE_CENTS');
  }
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error('INVALID_AMOUNT_CENTS');
  }
  const root = rootName(input.documentType);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<${root} xmlns="urn:sunat:names:specification:ubl:peru:schema:xsd:${root}-1"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.0</cbc:UBLVersionID>
  <cbc:CustomizationID>1.0</cbc:CustomizationID>
  <cbc:ID>${escapeXml(input.id)}</cbc:ID>
  <cbc:IssueDate>${escapeXml(input.issueDate)}</cbc:IssueDate>
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
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${escapeXml(input.referencedDocId)}</cbc:ID>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="PEN">${centsToAmount(input.amountCents)}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cbc:TotalInvoiceAmount currencyID="PEN">${centsToAmount(input.baseAmountCents)}</cbc:TotalInvoiceAmount>
  <cbc:Percent>${centsToAmount(input.ratePercentage)}</cbc:Percent>
</${root}>
`;
  assertWellFormedXml(xml);
  return xml;
}

export function assertValidWithholdingXml(xml: string, documentType: '02' | '20'): void {
  assertWellFormedXml(xml);
  const root = rootName(documentType);
  if (!xml.includes(`<${root}`)) throw new Error('MISSING_WITHHOLDING_ROOT');
  if (!xml.includes('<cbc:UBLVersionID>2.0</cbc:UBLVersionID>')) {
    throw new Error('INVALID_UBL_VERSION');
  }
  if (!xml.includes('schemeID="6"')) throw new Error('MISSING_ISSUER_RUC');
  if (xml.toLowerCase().includes('contingencia')) throw new Error('CONTINGENCIA_FORBIDDEN');
}
