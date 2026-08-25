/**
 * UBL SummaryDocuments (RC) — SUNAT beta sendSummary. Arquitectura §5.2.
 * Boletas `03` no viajan XML unitario; el RC es el sobre.
 */
/* eslint-disable no-secrets/no-secrets -- plantillas XML UBL normativas */
import { assertWellFormedXml, centsToAmount, escapeXml } from './ubl-shared.js';

export interface UblSummaryLine {
  readonly lineId: number;
  readonly documentType: '03' | '07' | '08' | '12';
  readonly documentId: string;
  readonly customerDocType: string;
  readonly customerDocNumber: string;
  /** Catálogo 19: 1=adición, 2=modificación, 3=baja. */
  readonly conditionCode: '1' | '2' | '3';
  readonly totalTaxableCents: number;
  readonly totalIgvCents: number;
  readonly totalAmountCents: number;
  /** Catálogo 07 (afectación IGV): 10=gravado (default), 20=exonerado, 30=inafecto. */
  readonly igvAffectationCode?: '10' | '20' | '30';
  /** H1 E2E: notas (07/08) referencian el CPE afectado. */
  readonly referencedDocId?: string;
  readonly referencedDocTypeCode?: '01' | '03' | '12';
  /**
   * Emite cac:BillingReference tras cbc:ID (posición del XSD oficial SUNAT).
   * Default OFF: el schema restringido de e-beta lo rechaza (CDR 0306,
   * cvc-particle) — la referencia queda implícita por tipo+serie+número.
   */
  readonly billingReference?: boolean;
}

/** Tributo del subtotal por afectación (catálogo 05): gravado/exonerado/inafecto. */
function taxSchemeFor(affectation: UblSummaryLine['igvAffectationCode']): {
  id: string;
  name: string;
} {
  if (affectation === '20') return { id: '9997', name: 'EXO' };
  if (affectation === '30') return { id: '9998', name: 'INA' };
  return { id: '1000', name: 'IGV' };
}

export interface UblSummaryDocumentsInput {
  readonly id: string;
  readonly referenceDate: string;
  readonly issueDate: string;
  readonly issuerRuc: string;
  readonly issuerName: string;
  readonly lines: readonly UblSummaryLine[];
}

export function rcSummaryId(summaryDate: string, correlative = 1): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(summaryDate)) throw new Error('RC_DATE_INVALID');
  if (!Number.isInteger(correlative) || correlative < 1) throw new Error('RC_CORRELATIVE_INVALID');
  const ymd = summaryDate.replaceAll('-', '');
  return `RC-${ymd}-${String(correlative).padStart(3, '0')}`;
}

/** Siguiente correlativo UBL `RC-YYYYMMDD-NNN` a partir de tickets ya emitidos. */
export function nextRcCorrelative(
  summaryDate: string,
  existingTickets: readonly string[],
  existingCount = 0,
): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(summaryDate)) throw new Error('RC_DATE_INVALID');
  const prefix = `RC-${summaryDate.replaceAll('-', '')}-`;
  let parsedMax = 0;
  for (const ticket of existingTickets) {
    if (!ticket.startsWith(prefix)) continue;
    const n = Number.parseInt(ticket.slice(prefix.length), 10);
    if (Number.isInteger(n) && n > parsedMax) parsedMax = n;
  }
  return Math.max(parsedMax, existingCount) + 1;
}

export function buildUblSummaryDocumentsXml(input: UblSummaryDocumentsInput): string {
  if (!/^RC-\d{8}-\d{3}$/.test(input.id)) throw new Error('INVALID_RC_ID');
  if (!/^\d{11}$/.test(input.issuerRuc)) throw new Error('INVALID_ISSUER_RUC');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.referenceDate)) throw new Error('RC_DATE_INVALID');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.issueDate)) throw new Error('RC_DATE_INVALID');
  if (!input.lines.length) throw new Error('RC_NO_BOLETAS');

  const linesXml = input.lines
    .map((line) => {
      const taxable = Math.max(0, line.totalTaxableCents);
      const scheme = taxSchemeFor(line.igvAffectationCode);
      // Nota (07/08) sobre CPE: referencia al documento afectado — OBLIGATORIA
      // para notas (e-beta CDR 2583). Forma canónica: wrapper
      // cac:InvoiceDocumentReference (cbc:ID + cbc:DocumentTypeCode),
      // posicionada TRAS cac:AccountingCustomerParty (orden del
      // SummaryDocumentsLine; antes del party → CDR 0306 posicional).
      const billingReference =
        line.referencedDocId && line.referencedDocTypeCode
          ? `
    <cac:BillingReference>
      <cac:InvoiceDocumentReference><cbc:ID>${escapeXml(line.referencedDocId)}</cbc:ID><cbc:DocumentTypeCode>${escapeXml(
        line.referencedDocTypeCode,
      )}</cbc:DocumentTypeCode></cac:InvoiceDocumentReference>
    </cac:BillingReference>`
          : '';
      return `
  <sac:SummaryDocumentsLine>
    <cbc:LineID>${line.lineId}</cbc:LineID>
    <cbc:DocumentTypeCode>${line.documentType}</cbc:DocumentTypeCode>
    <cbc:ID>${escapeXml(line.documentId)}</cbc:ID>
    <cac:AccountingCustomerParty>
      <cbc:CustomerAssignedAccountID>${escapeXml(line.customerDocNumber)}</cbc:CustomerAssignedAccountID>
      <cbc:AdditionalAccountID>${escapeXml(line.customerDocType)}</cbc:AdditionalAccountID>
      <cac:Party>
        <cac:PartyIdentification>
          <cbc:ID schemeID="${escapeXml(line.customerDocType)}">${escapeXml(line.customerDocNumber)}</cbc:ID>
        </cac:PartyIdentification>
      </cac:Party>
    </cac:AccountingCustomerParty>${billingReference}
    <cac:Status>
      <cbc:ConditionCode>${line.conditionCode}</cbc:ConditionCode>
    </cac:Status>
    <sac:TotalAmount currencyID="PEN">${centsToAmount(line.totalAmountCents)}</sac:TotalAmount>
    <sac:BillingPayment>
      <cbc:PaidAmount currencyID="PEN">${centsToAmount(taxable)}</cbc:PaidAmount>
      <cbc:InstructionID>01</cbc:InstructionID>
    </sac:BillingPayment>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="PEN">${centsToAmount(line.totalIgvCents)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxAmount currencyID="PEN">${centsToAmount(line.totalIgvCents)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cac:TaxScheme>
            <cbc:ID>${scheme.id}</cbc:ID>
            <cbc:Name>${scheme.name}</cbc:Name>
            <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
  </sac:SummaryDocumentsLine>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<SummaryDocuments xmlns="urn:sunat:names:specification:ubl:peru:schema:xsd:SummaryDocuments-1"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:sac="urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1">
  <cbc:UBLVersionID>2.0</cbc:UBLVersionID>
  <cbc:CustomizationID>1.1</cbc:CustomizationID>
  <cbc:ID>${escapeXml(input.id)}</cbc:ID>
  <cbc:ReferenceDate>${escapeXml(input.referenceDate)}</cbc:ReferenceDate>
  <cbc:IssueDate>${escapeXml(input.issueDate)}</cbc:IssueDate>
  <cac:AccountingSupplierParty>
    <cbc:CustomerAssignedAccountID>${escapeXml(input.issuerRuc)}</cbc:CustomerAssignedAccountID>
    <cbc:AdditionalAccountID>6</cbc:AdditionalAccountID>
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
  </cac:AccountingSupplierParty>${linesXml}
</SummaryDocuments>
`;
}

export function assertValidSummaryDocumentsXml(xml: string): void {
  assertWellFormedXml(xml);
  if (!xml.includes('<SummaryDocuments')) throw new Error('MISSING_SUMMARY_ROOT');
  if (!xml.includes('<cbc:UBLVersionID>2.0</cbc:UBLVersionID>')) {
    throw new Error('INVALID_UBL_VERSION');
  }
  if (!xml.includes('<sac:SummaryDocumentsLine>')) throw new Error('RC_NO_BOLETAS');
  if (!xml.includes('<cbc:CustomerAssignedAccountID>')) {
    throw new Error('MISSING_ISSUER_ACCOUNT_ID');
  }
  if (xml.toLowerCase().includes('contingencia')) throw new Error('CONTINGENCIA_FORBIDDEN');
}
