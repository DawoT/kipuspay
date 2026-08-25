/**
 * Builder del payload QR fiscal peruano — zero-dep (§10, invariante 10).
 *
 * Regla SUNAT (RS 402-2019/SUNAT, anexo de representación impresa de la
 * RS 097-2012): los CPE llevan un código de barras bidimensional (QR Code
 * 2005, ISO/IEC 18004:2006, sin variantes Micro QR, UTF-8) que codifica,
 * con separador pipe ("|") y en este orden normativo:
 *
 *   RUC | TIPO | SERIE | NUMERO | MTO TOTAL IGV | MTO TOTAL DEL COMPROBANTE |
 *   FECHA DE EMISION | TIPO DE DOCUMENTO ADQUIRENTE |
 *   NUMERO DE DOCUMENTO ADQUIRENTE | CODIGO HASH
 *
 * Cada campo se consigna "con el mismo formato empleado en el comprobante":
 * montos n(12,2) con punto decimal (desde INTEGER cents), fecha yyyy-mm-dd
 * (UBL cbc:IssueDate), correlativo rellenado a 8 dígitos (cbc:ID F###-NNNNNNNN).
 * El adquirente es "de ser el caso": sin datos se consigna "-".
 * La matriz QR la dibuja el código vendorizado MIT del POS o el GS ( k )
 * nativo de la térmica; este módulo solo produce la CADENA.
 */
import { formatTicketCents } from './format-cents.js';

/** Tipos de CPE con QR fiscal (Catálogo 01). NV interna jamás lleva QR. */
export type FiscalCpeType = '01' | '03' | '07' | '08';

const CPE_TYPES: readonly string[] = ['01', '03', '07', '08'];

export interface FiscalQrInput {
  /** RUC del emisor: exactamente 11 dígitos. */
  readonly ruc: string;
  /** Tipo de comprobante (Catálogo 01): 01/03/07/08. */
  readonly documentType: string;
  /** Serie: 4 caracteres alfanuméricos (F001, B001, FC01…). */
  readonly series: string;
  /** Correlativo entero 1..99999999; se rellena a 8 dígitos. */
  readonly number: number;
  /** Sumatoria IGV en cents (0.00 legítimo en exoneradas). */
  readonly igvCents: number;
  /** Importe total en cents. */
  readonly totalCents: number;
  /** Fecha de emisión ISO yyyy-mm-dd (formato UBL cbc:IssueDate). */
  readonly issueDateIso: string;
  /** Catálogo 06 del adquirente ('-' si no aplica): 1 DNI, 4 RUC, 6 pasaporte, 7 CE. */
  readonly buyerDocType?: string | undefined;
  /** Número de documento del adquirente ('-' si no aplica). */
  readonly buyerDocNumber?: string | undefined;
  /** Código hash (DigestValue del XML firmado). */
  readonly digestValue: string;
}

function rejectPipe(value: string, code: string): string {
  if (/[|\r\n\0]/.test(value)) throw new Error(code);
  return value;
}

function validIsoDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('INVALID_ISSUE_DATE');
  const d = new Date(`${value}T00:00:00Z`);
  if (
    Number.isNaN(d.getTime()) ||
    d.getUTCFullYear() !== Number(value.slice(0, 4)) ||
    d.getUTCMonth() !== Number(value.slice(5, 7)) - 1 ||
    d.getUTCDate() !== Number(value.slice(8, 10))
  ) {
    throw new Error('INVALID_ISSUE_DATE');
  }
  return value;
}

function nonNegativeCents(cents: number): number {
  if (!Number.isInteger(cents) || cents < 0) throw new Error('INVALID_TICKET_CENTS');
  return cents;
}

/**
 * Construye la cadena exacta que exige el anexo RS 402-2019 para el QR.
 * Falla cerrada ante cualquier campo inválido: nunca produce un QR parcial.
 */
export function buildFiscalQrPayload(input: FiscalQrInput): string {
  if (!/^\d{11}$/.test(input.ruc)) throw new Error('INVALID_RUC');
  if (!CPE_TYPES.includes(input.documentType)) throw new Error('INVALID_DOCUMENT_TYPE');
  if (!/^[A-Z0-9]{4}$/.test(input.series)) throw new Error('INVALID_SERIES');
  if (!Number.isInteger(input.number) || input.number < 1 || input.number > 99999999) {
    throw new Error('INVALID_NUMBER');
  }
  const igv = formatTicketCents(nonNegativeCents(input.igvCents));
  const total = formatTicketCents(nonNegativeCents(input.totalCents));
  const date = validIsoDate(input.issueDateIso);
  const docType =
    input.buyerDocType === undefined
      ? '-'
      : rejectPipe(input.buyerDocType.trim(), 'INVALID_BUYER') || '-';
  const docNumber =
    input.buyerDocNumber === undefined
      ? '-'
      : rejectPipe(input.buyerDocNumber.trim(), 'INVALID_BUYER') || '-';
  const digest = rejectPipe(input.digestValue.trim(), 'INVALID_DIGEST');
  if (!digest) throw new Error('INVALID_DIGEST');

  return [
    input.ruc,
    input.documentType,
    input.series,
    String(input.number).padStart(8, '0'),
    igv,
    total,
    date,
    docType,
    docNumber,
    digest,
  ].join('|');
}

const OFFICIAL_NAMES: Readonly<Record<string, string>> = {
  '01': 'FACTURA ELECTRÓNICA',
  '03': 'BOLETA DE VENTA ELECTRÓNICA',
  '07': 'NOTA DE CRÉDITO ELECTRÓNICA',
  '08': 'NOTA DE DÉBITO ELECTRÓNICA',
  NV: 'NOTA DE VENTA',
  NV_RETURN: 'NOTA DE VENTA',
};

/** Denominación oficial del documento (RS 097-2012 anexos 1-2). */
export function officialDocumentNameFor(documentType: string): string {
  return OFFICIAL_NAMES[documentType] ?? documentType;
}

/** Etiqueta legible del tipo de documento del adquirente (Catálogo 06). */
export function buyerDocLabel(docType: string): string {
  if (docType === '1') return 'DNI';
  if (docType === '4') return 'RUC';
  if (docType === '6') return 'Pasaporte';
  if (docType === '7') return 'Carné de extranjería';
  return 'Doc';
}
