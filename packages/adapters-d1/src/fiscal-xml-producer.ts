/**
 * Producer fiscal — genera y persiste el XML unitario de un CPE a R2 y
 * actualiza `fiscal_outbox.r2_xml_key` (spec §5.2 / §8). Cierra el gap C6:
 * el outbox nacía con `r2_xml_key NULL` y el drain cuarentenaba todo
 * (`MISSING_R2_XML`). Solo los documentos UNIT_XML se producen aquí; las
 * boletas (RC) no generan XML unitario — las cubre `buildDailySummary`.
 *
 * Idempotente: si el outbox ya tiene `r2_xml_key`, no-op.
 * Zero-dependency: Web Platform APIs + `buildUblInvoiceXml` del dominio.
 */
import {
  assertValidFacturaXml,
  buildUblInvoiceXml,
  classifyUnitaryXmlTarget,
  hashUblXml,
  type UblInvoiceInput,
  type UblInvoiceLine,
} from '@kipuspay/domain-fiscal-pe';
import type { D1DatabaseLike } from './index.js';

export interface FiscalXmlR2Like {
  put(key: string, value: string): Promise<void>;
}

export interface ProduceFiscalXmlInput {
  readonly db: D1DatabaseLike;
  readonly r2: FiscalXmlR2Like;
  readonly tenantId: string;
  readonly saleId: string;
}

export type ProduceFiscalXmlResult =
  | { readonly outcome: 'PRODUCED'; readonly r2XmlKey: string; readonly xmlHash: string }
  | { readonly outcome: 'NOOP_ALREADY_HAS_KEY'; readonly r2XmlKey: string }
  | { readonly outcome: 'SKIP_RC'; readonly channel: 'RC' }
  | { readonly outcome: 'SKIP_NONE'; readonly channel: 'NONE' }
  | { readonly outcome: 'SKIP_UNSUPPORTED_BUILDER'; readonly documentType: string }
  | { readonly outcome: 'NOT_FOUND' };

interface SaleForXml {
  readonly id: string;
  readonly tenant_id: string;
  readonly document_type: string;
  readonly referenced_sale_id: string | null;
  readonly series: string;
  readonly number: number;
  readonly client_document_type: string;
  readonly client_document_number: string;
  readonly client_name: string;
  readonly total_taxable_cents: number;
  readonly total_igv_cents: number;
  readonly total_icbper_cents: number;
  readonly total_amount_cents: number;
  readonly issued_at_lima: string;
}

interface SaleItemForXml {
  readonly id: string;
  readonly product_name: string;
  readonly quantity: number;
  readonly unit_price_cents: number;
  readonly igv_affectation_code: string;
  readonly igv_amount_cents: number;
  readonly icbper_amount_cents: number;
  readonly total_amount_cents: number;
}

interface TenantForXml {
  readonly ruc: string | null;
  readonly business_name: string;
}

/** Resuelve el document_type del documento referenciado (para NC/ND 07/08). */
export async function resolveReferencedDocumentType(
  db: D1DatabaseLike,
  tenantId: string,
  referencedSaleId: string | null | undefined,
): Promise<string | undefined> {
  if (!referencedSaleId) return undefined;
  const row = await db
    .prepare(`SELECT document_type FROM sales WHERE id = ? AND tenant_id = ?`)
    .bind(referencedSaleId, tenantId)
    .first<{ document_type: string }>();
  return row?.document_type;
}

export function r2XmlKeyForSale(tenantId: string, saleId: string): string {
  return `fiscal-xml/${tenantId}/${saleId}.xml`;
}

/** Lee el contexto completo de la venta para armar el UblInvoiceInput. */
export async function loadSaleForXml(
  db: D1DatabaseLike,
  tenantId: string,
  saleId: string,
): Promise<{
  sale: SaleForXml;
  items: readonly SaleItemForXml[];
  tenant: TenantForXml;
} | null> {
  const sale = await db
    .prepare(
      `SELECT id, tenant_id, document_type, referenced_sale_id, series, number,
              client_document_type, client_document_number, client_name,
              total_taxable_cents, total_igv_cents, total_icbper_cents,
              total_amount_cents, issued_at_lima
       FROM sales WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    )
    .bind(saleId, tenantId)
    .first<SaleForXml>();
  if (!sale) return null;

  const items = await db
    .prepare(
      `SELECT id, product_name, quantity, unit_price_cents, igv_affectation_code,
              igv_amount_cents, icbper_amount_cents, total_amount_cents
       FROM sale_items WHERE sale_id = ? AND tenant_id = ?
       ORDER BY id`,
    )
    .bind(saleId, tenantId)
    .all<SaleItemForXml>();
  const tenant = await db
    .prepare(`SELECT ruc, business_name FROM tenants WHERE id = ?`)
    .bind(tenantId)
    .first<TenantForXml>();

  if (!tenant) return null;
  return { sale, items: items.results ?? [], tenant };
}

function buildUblInput(ctx: {
  readonly sale: SaleForXml;
  readonly items: readonly SaleItemForXml[];
  readonly tenant: TenantForXml;
}): UblInvoiceInput {
  const { sale, items, tenant } = ctx;
  const [datePart = '', timePart = '00:00:00'] = sale.issued_at_lima.split('T');
  const lines: UblInvoiceLine[] = items.map((item, index) => {
    const igvCents = item.igv_amount_cents;
    const icbperCents = item.icbper_amount_cents;
    const lineTotal = item.total_amount_cents;
    return {
      id: index + 1,
      description: item.product_name,
      quantity: item.quantity,
      unitCode: 'NIU',
      unitPriceCents: item.unit_price_cents,
      igvAffectationCode: item.igv_affectation_code || '10',
      igvCents,
      lineTotalCents: lineTotal,
      icbperCents,
    };
  });

  return {
    ublVersion: '2.1',
    customizationId: '2.0',
    id: `${sale.series}-${String(sale.number).padStart(8, '0')}`,
    issueDate: datePart,
    issueTime: timePart.slice(0, 8),
    invoiceTypeCode: '01',
    currency: 'PEN',
    issuerRuc: tenant.ruc ?? '',
    issuerName: tenant.business_name,
    customerDocType: sale.client_document_type,
    customerDocNumber: sale.client_document_number,
    customerName: sale.client_name,
    totalTaxableCents: sale.total_taxable_cents,
    totalIgvCents: sale.total_igv_cents,
    totalIcbperCents: sale.total_icbper_cents,
    totalAmountCents: sale.total_amount_cents,
    lines,
  };
}

/**
 * Genera, valida y persiste el XML unitario del CPE a R2, actualizando
 * `fiscal_outbox.r2_xml_key`. Idempotente y best-effort (nunca lanza por
 * razones de negocio — el drain decide cuarentena).
 */
export async function produceFiscalXmlForSale(
  input: ProduceFiscalXmlInput,
): Promise<ProduceFiscalXmlResult> {
  const { db, r2, tenantId, saleId } = input;

  const existing = await db
    .prepare(`SELECT r2_xml_key FROM fiscal_outbox WHERE sale_id = ? AND tenant_id = ?`)
    .bind(saleId, tenantId)
    .first<{ r2_xml_key: string | null }>();
  if (existing?.r2_xml_key) {
    return { outcome: 'NOOP_ALREADY_HAS_KEY', r2XmlKey: existing.r2_xml_key };
  }

  const ctx = await loadSaleForXml(db, tenantId, saleId);
  if (!ctx) return { outcome: 'NOT_FOUND' };
  const { sale } = ctx;

  const referencedDocType = await resolveReferencedDocumentType(
    db,
    tenantId,
    sale.referenced_sale_id,
  );
  const channel = classifyUnitaryXmlTarget(
    sale.document_type as '01' | '03' | '07' | '08' | '12' | 'NV' | 'NV_RETURN',
    referencedDocType,
  );
  if (channel === 'RC') return { outcome: 'SKIP_RC', channel };
  if (channel === 'NONE') return { outcome: 'SKIP_NONE', channel };

  // C6: el builder solo soporta factura 01. NC/ND (07/08) se cablean en Ops-3.
  if (sale.document_type !== '01') {
    return { outcome: 'SKIP_UNSUPPORTED_BUILDER', documentType: sale.document_type };
  }

  const ublInput = buildUblInput(ctx);
  const xml = buildUblInvoiceXml(ublInput);
  assertValidFacturaXml(xml);
  const xmlHash = await hashUblXml(xml);
  const key = r2XmlKeyForSale(tenantId, saleId);
  await r2.put(key, xml);

  await db.batch([
    db
      .prepare(
        `UPDATE fiscal_outbox SET r2_xml_key = ?, status = 'PENDING'
         WHERE sale_id = ? AND tenant_id = ?`,
      )
      .bind(key, saleId, tenantId),
    db
      .prepare(`UPDATE sales SET sunat_xml_hash = ? WHERE id = ? AND tenant_id = ?`)
      .bind(xmlHash, saleId, tenantId),
  ]);

  return { outcome: 'PRODUCED', r2XmlKey: key, xmlHash };
}