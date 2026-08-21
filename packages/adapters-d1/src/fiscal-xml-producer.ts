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
  assertValidCreditNoteXml,
  assertValidDebitNoteXml,
  assertValidFacturaXml,
  buildUblCreditNoteXml,
  buildUblDebitNoteXml,
  buildUblInvoiceXml,
  classifyUnitaryXmlTarget,
  hashUblXml,
  type UblCreditNoteInput,
  type UblDebitNoteInput,
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
  readonly signer?: FiscalXmlSigner;
}

export interface FiscalXmlSigner {
  sign(xml: string, tenantId: string): Promise<string>;
}

export type ProduceFiscalXmlResult =
  | { readonly outcome: 'PRODUCED'; readonly r2XmlKey: string; readonly xmlHash: string }
  | { readonly outcome: 'NOOP_ALREADY_HAS_KEY'; readonly r2XmlKey: string }
  | { readonly outcome: 'SKIP_RC'; readonly channel: 'RC' }
  | { readonly outcome: 'SKIP_NONE'; readonly channel: 'NONE' }
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
  readonly credit_note_motive_code: string | null;
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

interface ReferencedSaleForXml {
  readonly document_type: string;
  readonly series: string;
  readonly number: number;
  readonly total_amount_cents: number;
}

interface TenantForXml {
  readonly ruc: string | null;
  readonly business_name: string;
}

/** Resuelve el documento referenciado (para NC/ND 07/08): tipo + serie-número. */
export async function resolveReferencedSale(
  db: D1DatabaseLike,
  tenantId: string,
  referencedSaleId: string | null | undefined,
): Promise<ReferencedSaleForXml | undefined> {
  if (!referencedSaleId) return undefined;
  const row = await db
    .prepare(
      `SELECT document_type, series, number, total_amount_cents
       FROM sales WHERE id = ? AND tenant_id = ?`,
    )
    .bind(referencedSaleId, tenantId)
    .first<ReferencedSaleForXml>();
  return row ?? undefined;
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
              total_amount_cents, issued_at_lima, credit_note_motive_code
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

/** Lee las líneas del documento ORIGEN que ajusta una NC/ND (07/08). */
export async function loadReferencedItems(
  db: D1DatabaseLike,
  tenantId: string,
  referencedSaleId: string,
): Promise<readonly SaleItemForXml[]> {
  const items = await db
    .prepare(
      `SELECT ref.id, ref.product_name, ref.quantity, ref.unit_price_cents,
              ref.igv_affectation_code, ref.igv_amount_cents,
              ref.icbper_amount_cents, ref.total_amount_cents
       FROM sale_items ref
       WHERE ref.sale_id = ? AND ref.tenant_id = ?
       ORDER BY ref.id`,
    )
    .bind(referencedSaleId, tenantId)
    .all<SaleItemForXml>();
  return items.results ?? [];
}

function limaIssueDateTime(issuedAtLima: string): { issueDate: string; issueTime: string } {
  const normalized = issuedAtLima.includes('T') ? issuedAtLima : issuedAtLima.replace(' ', 'T');
  const [datePart = '', timePart = '00:00:00'] = normalized.split('T');
  return { issueDate: datePart.slice(0, 10), issueTime: timePart.slice(0, 8) };
}

function documentId(sale: Pick<SaleForXml, 'series' | 'number'>): string {
  return `${sale.series}-${String(sale.number).padStart(8, '0')}`;
}

function buildUblInput(ctx: {
  readonly sale: SaleForXml;
  readonly items: readonly SaleItemForXml[];
  readonly tenant: TenantForXml;
}): UblInvoiceInput {
  const { sale, items, tenant } = ctx;
  const { issueDate, issueTime } = limaIssueDateTime(sale.issued_at_lima);
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
    id: documentId(sale),
    issueDate,
    issueTime,
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
 * Ops-3: arma el input UBL de NC (07) / ND (08). La NC/ND no persiste
 * `sale_items` propios (el proceso ajusta el origen); las líneas del XML se
 * construyen desde el documento ORIGEN que ajusta, con los montos de la nota.
 * Devuelve CreditNote para 07 y DebitNote para 08 (fail-closed: tipo distinto
 * no llega aquí — el caller ya clasificó el canal).
 */
function buildAdjustmentInput(
  sale: SaleForXml,
  tenant: TenantForXml,
  referenced: ReferencedSaleForXml,
  originItems: readonly SaleItemForXml[],
  kind: '07' | '08',
): UblCreditNoteInput | UblDebitNoteInput {
  const { issueDate, issueTime } = limaIssueDateTime(sale.issued_at_lima);
  const sign = kind === '08' ? 1 : -1;
  const motive = sale.credit_note_motive_code ?? '01';
  const base = {
    ublVersion: '2.1' as const,
    customizationId: '1.0' as const,
    id: documentId(sale),
    issueDate,
    issueTime,
    currency: 'PEN' as const,
    issuerRuc: tenant.ruc ?? '',
    issuerName: tenant.business_name,
    customerDocType: sale.client_document_type,
    customerDocNumber: sale.client_document_number,
    customerName: sale.client_name,
    referencedDocId: documentId(referenced),
    motiveCode: motive,
    totalTaxableCents: sign * sale.total_taxable_cents,
    totalIgvCents: sign * sale.total_igv_cents,
    totalIcbperCents: sign * sale.total_icbper_cents,
    totalAmountCents: sign * sale.total_amount_cents,
  };

  const lines = originItems.map((item, index) => ({
    id: index + 1,
    description: item.product_name,
    quantity: item.quantity,
    unitCode: 'NIU' as const,
    igvAffectationCode: item.igv_affectation_code || '10',
    igvCents: item.igv_amount_cents,
    lineTotalCents: item.total_amount_cents,
    icbperCents: item.icbper_amount_cents,
  }));

  if (kind === '08') return { ...base, lines };
  return { ...base, lines };
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

  const referenced = await resolveReferencedSale(db, tenantId, sale.referenced_sale_id);
  const channel = classifyUnitaryXmlTarget(
    sale.document_type as '01' | '03' | '07' | '08' | '12' | 'NV' | 'NV_RETURN',
    referenced?.document_type,
  );
  if (channel === 'RC') return { outcome: 'SKIP_RC', channel };
  if (channel === 'NONE') return { outcome: 'SKIP_NONE', channel };

  let ublInput: UblInvoiceInput | UblCreditNoteInput | UblDebitNoteInput;
  let validate: (xml: string) => void;
  if (sale.document_type === '01') {
    ublInput = buildUblInput(ctx);
    validate = assertValidFacturaXml;
  } else if (sale.document_type === '08') {
    if (!referenced || !sale.referenced_sale_id) {
      return { outcome: 'SKIP_NONE', channel: 'NONE' };
    }
    const originItems = await loadReferencedItems(db, tenantId, sale.referenced_sale_id);
    if (!originItems.length) return { outcome: 'SKIP_NONE', channel: 'NONE' };
    ublInput = buildAdjustmentInput(sale, ctx.tenant, referenced, originItems, '08');
    validate = assertValidDebitNoteXml;
  } else {
    if (!referenced || !sale.referenced_sale_id) {
      return { outcome: 'SKIP_NONE', channel: 'NONE' };
    }
    const originItems = await loadReferencedItems(db, tenantId, sale.referenced_sale_id);
    if (!originItems.length) return { outcome: 'SKIP_NONE', channel: 'NONE' };
    ublInput = buildAdjustmentInput(sale, ctx.tenant, referenced, originItems, '07');
    validate = assertValidCreditNoteXml;
  }

  let xml =
    sale.document_type === '01'
      ? buildUblInvoiceXml(ublInput as UblInvoiceInput)
      : sale.document_type === '08'
        ? buildUblDebitNoteXml(ublInput as UblDebitNoteInput)
        : buildUblCreditNoteXml(ublInput as UblCreditNoteInput);
  validate(xml);
  if (input.signer) {
    xml = await input.signer.sign(xml, tenantId);
  }
  const xmlHash = await hashUblXml(xml);
  const key = r2XmlKeyForSale(tenantId, saleId);
  await r2.put(key, xml);

  await db.batch([
    db
      .prepare(
        `UPDATE fiscal_outbox SET r2_xml_key = ?
         WHERE sale_id = ? AND tenant_id = ? AND status != 'PROCESSING'`,
      )
      .bind(key, saleId, tenantId),
    db
      .prepare(`UPDATE sales SET sunat_xml_hash = ? WHERE id = ? AND tenant_id = ?`)
      .bind(xmlHash, saleId, tenantId),
  ]);

  return { outcome: 'PRODUCED', r2XmlKey: key, xmlHash };
}
