/**
 * DTO frontera R-01 — FiscalTransport solo consume estos (ADR-FISCAL-002 / §8.1).
 * Prohibido importar entidades retail (inventory_*, sales_returns, orders_*).
 */

export type CpeDocumentType = '01' | '03' | '07' | '08';

/** Comprobante unitario ya resuelto por el motor (hash/QR/leyendas). */
export interface CPEInvoiceDTO {
  readonly tenantId: string;
  readonly saleId: string;
  readonly documentType: CpeDocumentType;
  readonly series: string;
  readonly number: number;
  readonly issuerRuc: string;
  readonly totalCents: number;
  readonly xml: string;
  readonly xmlHash: string;
  readonly digestValue?: string;
  readonly qrPayload?: string;
  readonly mustSubmitByIso: string;
}

/** Línea / agrupación de Resumen Diario ya resuelto. */
export interface CPESummaryDTO {
  readonly tenantId: string;
  readonly summaryDateLima: string;
  readonly documentType: 'RC';
  readonly xml: string;
  readonly xmlHash: string;
  readonly saleIds: readonly string[];
}

export function assertCpeInvoiceDto(dto: CPEInvoiceDTO): void {
  if (!dto.tenantId.trim()) throw new Error('CPE_DTO_TENANT_REQUIRED');
  if (!dto.saleId.trim()) throw new Error('CPE_DTO_SALE_REQUIRED');
  if (!dto.xml.trim()) throw new Error('CPE_DTO_XML_REQUIRED');
  if (!dto.xmlHash.trim()) throw new Error('CPE_DTO_HASH_REQUIRED');
  if (!Number.isInteger(dto.totalCents) || dto.totalCents < 0) {
    throw new Error('CPE_DTO_TOTAL_CENTS_INVALID');
  }
}

export function assertCpeSummaryDto(dto: CPESummaryDTO): void {
  if (!dto.tenantId.trim()) throw new Error('CPE_SUMMARY_TENANT_REQUIRED');
  if (!dto.xml.trim()) throw new Error('CPE_SUMMARY_XML_REQUIRED');
  if (dto.documentType !== 'RC') throw new Error('CPE_SUMMARY_TYPE_INVALID');
}
