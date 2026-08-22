/**
 * XML unitario GRE/02/20 → R2 + r2_xml_key (FASE FL-5).
 */
import {
  assertValidDespatchXml,
  assertValidWithholdingXml,
  buildUblDespatchXml,
  buildUblWithholdingXml,
} from '@kipuspay/domain-fiscal-pe';
import type { D1DatabaseLike } from './index.js';
import type { FiscalXmlR2Like, FiscalXmlSigner } from './fiscal-xml-producer.js';

const QUANTITY_SCALE = 1_000_000;

export async function produceFiscalXmlForNonSale(input: {
  readonly db: D1DatabaseLike;
  readonly r2: FiscalXmlR2Like;
  readonly tenantId: string;
  readonly outboxId: string;
  readonly signer?: FiscalXmlSigner;
}): Promise<string | null> {
  const row = await input.db
    .prepare(
      `SELECT id, document_type, entity_id, r2_xml_key
       FROM fiscal_non_sale_outbox WHERE id = ? AND tenant_id = ?`,
    )
    .bind(input.outboxId, input.tenantId)
    .first<{
      id: string;
      document_type: '31' | '02' | '20';
      entity_id: string;
      r2_xml_key: string | null;
    }>();
  if (!row) return null;
  if (row.r2_xml_key) return row.r2_xml_key;

  const tenant = await input.db
    .prepare(`SELECT ruc, business_name FROM tenants WHERE id = ?`)
    .bind(input.tenantId)
    .first<{ ruc: string; business_name: string }>();
  if (!tenant?.ruc) return null;

  let xml: string;
  if (row.document_type === '31') {
    xml = await buildGreXml(input.db, input.tenantId, row.entity_id, tenant);
  } else {
    xml = await buildWithholdingXml(
      input.db,
      input.tenantId,
      row.document_type,
      row.entity_id,
      tenant,
    );
  }
  if (input.signer) xml = await input.signer.sign(xml, input.tenantId);

  const key = `fiscal-xml/${input.tenantId}/nonsale-${row.entity_id}.xml`;
  await input.r2.put(key, xml);
  await input.db
    .prepare(`UPDATE fiscal_non_sale_outbox SET r2_xml_key = ? WHERE id = ? AND tenant_id = ?`)
    .bind(key, row.id, input.tenantId)
    .run();
  return key;
}

async function buildGreXml(
  db: D1DatabaseLike,
  tenantId: string,
  entityId: string,
  tenant: { ruc: string; business_name: string },
): Promise<string> {
  const gre = await db
    .prepare(
      `SELECT series, number, transfer_reason_code, transport_mode_code, vehicle_plate,
              carrier_document_type, carrier_document_number, carrier_name,
              origin_ubigeo, origin_address, destination_ubigeo, destination_address,
              transfer_started_at
       FROM remission_guides WHERE id = ? AND tenant_id = ?`,
    )
    .bind(entityId, tenantId)
    .first<{
      series: string;
      number: number;
      transfer_reason_code: string;
      transport_mode_code: string;
      vehicle_plate: string;
      carrier_document_type: string;
      carrier_document_number: string;
      carrier_name: string;
      origin_ubigeo: string;
      origin_address: string;
      destination_ubigeo: string;
      destination_address: string;
      transfer_started_at: string;
    }>();
  if (!gre) throw new Error('GRE_NOT_FOUND');
  const items = await db
    .prepare(
      `SELECT i.quantity_microunits, i.uom_code, COALESCE(p.name, i.product_id) AS description
       FROM remission_guide_items i
       LEFT JOIN products p ON p.tenant_id = i.tenant_id AND p.id = i.product_id
       WHERE i.tenant_id = ? AND i.remission_guide_id = ?`,
    )
    .bind(tenantId, entityId)
    .all<{ quantity_microunits: number; uom_code: string; description: string }>();
  const lines = (items.results ?? []).map((item, index) => ({
    id: index + 1,
    description: item.description,
    quantity: item.quantity_microunits / QUANTITY_SCALE,
    unitCode: item.uom_code,
  }));
  const issued = gre.transfer_started_at.slice(0, 19);
  const xml = buildUblDespatchXml({
    ublVersion: '2.1',
    id: `${gre.series}-${String(gre.number).padStart(8, '0')}`,
    issueDate: issued.slice(0, 10),
    issueTime: issued.slice(11, 19) || '00:00:00',
    issuerRuc: tenant.ruc,
    issuerName: tenant.business_name,
    transferReasonCode: gre.transfer_reason_code,
    transportModeCode: gre.transport_mode_code,
    vehiclePlate: gre.vehicle_plate,
    carrierDocumentType: gre.carrier_document_type,
    carrierDocumentNumber: gre.carrier_document_number,
    carrierName: gre.carrier_name,
    originUbigeo: gre.origin_ubigeo,
    originAddress: gre.origin_address,
    destinationUbigeo: gre.destination_ubigeo,
    destinationAddress: gre.destination_address,
    transferStartedAt: gre.transfer_started_at,
    lines,
  });
  assertValidDespatchXml(xml);
  return xml;
}

async function buildWithholdingXml(
  db: D1DatabaseLike,
  tenantId: string,
  documentType: '02' | '20',
  entityId: string,
  tenant: { ruc: string; business_name: string },
): Promise<string> {
  const row = await db
    .prepare(
      documentType === '02'
        ? `SELECT p.series, p.number, p.base_amount_cents, p.amount_cents, p.rate_percentage,
                  COALESCE(s.client_document_type, '6') AS customer_doc_type,
                  COALESCE(s.client_document_number, ?) AS customer_doc_number,
                  COALESCE(s.client_name, ?) AS customer_name
           FROM perceptions p
           LEFT JOIN sales s ON s.tenant_id = p.tenant_id AND s.id = p.origin_sale_id
           WHERE p.id = ? AND p.tenant_id = ?`
        : `SELECT series, number, base_amount_cents, amount_cents, rate_percentage,
                  '6' AS customer_doc_type, ? AS customer_doc_number, ? AS customer_name
           FROM retentions WHERE id = ? AND tenant_id = ?`,
    )
    .bind(tenant.ruc, tenant.business_name, entityId, tenantId)
    .first<{
      series: string;
      number: number;
      base_amount_cents: number;
      amount_cents: number;
      rate_percentage: number;
      customer_doc_type: string;
      customer_doc_number: string;
      customer_name: string;
    }>();
  if (!row) throw new Error('WITHHOLDING_NOT_FOUND');
  const xml = buildUblWithholdingXml({
    ublVersion: '2.0',
    documentType,
    id: `${row.series}-${String(row.number).padStart(8, '0')}`,
    issueDate: new Date().toISOString().slice(0, 10),
    issuerRuc: tenant.ruc,
    issuerName: tenant.business_name,
    customerDocType: row.customer_doc_type,
    customerDocNumber: row.customer_doc_number,
    customerName: row.customer_name,
    referencedDocId: `${row.series}-${row.number}`,
    baseAmountCents: row.base_amount_cents,
    amountCents: row.amount_cents,
    ratePercentage: row.rate_percentage,
  });
  assertValidWithholdingXml(xml, documentType);
  return xml;
}
