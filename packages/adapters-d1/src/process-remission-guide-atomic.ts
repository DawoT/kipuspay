/**
 * processRemissionGuideAtomic — GRE `31` (Arquitectura §5.2b, ADR-FISCAL-004).
 *
 * Correlativo server-side en branch_document_series ('31', serie T…) con
 * guardState anti-doble; INSERT cabecera + ítems en un solo batch; audit
 * REMISSION_GUIDE con hash-chain. 0 impacto en stock/ventas/saldos: la GRE
 * solo declara el traslado.
 */
import {
  assertRemissionGuideAllowed,
  type RemissionGuideRequest,
} from '@kipuspay/domain-fiscal-pe';
import { runD1AtomicPlan, type AtomicPlanBuilder, type D1DatabaseLike } from './index.js';

export interface RemissionGuideResult {
  readonly remissionGuideId: string;
  readonly series: string;
  readonly number: number;
  readonly transferReasonCode: string;
  readonly sunatStatus: 'PENDING';
}

export async function processRemissionGuideAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  branchId: string,
  userId: string,
  request: RemissionGuideRequest,
): Promise<RemissionGuideResult> {
  const gate = assertRemissionGuideAllowed(request);
  if (!gate.ok) throw new Error(gate.code);

  const seriesRow = await db
    .prepare(
      `SELECT id, series, current_number FROM branch_document_series
       WHERE tenant_id = ? AND branch_id = ? AND document_type_code = '31'
         AND series = ? AND is_active = 1`,
    )
    .bind(tenantId, branchId, request.series)
    .first<{ id: string; series: string; current_number: number }>();
  if (!seriesRow) throw new Error('GRE_SERIES_NOT_FOUND');

  const remissionGuideId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const prevHash = await db
    .prepare(
      `SELECT row_hash FROM audit_events WHERE tenant_id = ?
       ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .bind(tenantId)
    .first<{ row_hash: string }>();
  const rowHash = await crypto.subtle
    .digest(
      'SHA-256',
      new TextEncoder().encode(
        JSON.stringify({
          action: 'REMISSION_GUIDE',
          entity_id: remissionGuideId,
          prev: prevHash?.row_hash ?? null,
        }),
      ),
    )
    .then((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join(''));

  const itemIds = request.items.map(() => crypto.randomUUID());

  const build = (plan: AtomicPlanBuilder): void => {
    plan.guardState(
      `SELECT 1 FROM branch_document_series
       WHERE id = ? AND tenant_id = ? AND current_number = ?`,
      [seriesRow.id, tenantId, seriesRow.current_number],
    );
    plan.add(
      db
        .prepare(
          `UPDATE branch_document_series SET current_number = current_number + 1
           WHERE id = ? AND tenant_id = ?`,
        )
        .bind(seriesRow.id, tenantId),
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO remission_guides (
             id, tenant_id, branch_id, series, number,
             transfer_reason_code, transport_mode_code,
             vehicle_plate, carrier_document_type, carrier_document_number, carrier_name,
             origin_ubigeo, origin_address, destination_ubigeo, destination_address,
             transfer_started_at, related_document_type, related_document_series, related_document_number,
             sunat_status, created_by_user_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
        )
        .bind(
          remissionGuideId,
          tenantId,
          branchId,
          seriesRow.series,
          seriesRow.current_number + 1,
          request.transferReasonCode,
          request.transportModeCode,
          request.vehiclePlate.trim(),
          request.carrier.documentType,
          request.carrier.documentNumber.trim(),
          request.carrier.name.trim(),
          request.origin.ubigeo.trim(),
          request.origin.address.trim(),
          request.destination.ubigeo.trim(),
          request.destination.address.trim(),
          request.transferStartedAt,
          request.relatedDocument?.documentType ?? null,
          request.relatedDocument?.series ?? null,
          request.relatedDocument?.number ?? null,
          userId,
        ),
    );
    request.items.forEach((item, index) => {
      plan.add(
        db
          .prepare(
            `INSERT INTO remission_guide_items (
               id, tenant_id, remission_guide_id, product_id,
               quantity_microunits, uom_code, batch_id
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            itemIds[index],
            tenantId,
            remissionGuideId,
            item.productId,
            item.quantityMicrounits,
            item.uomCode,
            item.batchId ?? null,
          ),
      );
    });
    plan.add(
      db
        .prepare(
          `INSERT INTO audit_events (
             id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
             payload_json, prev_hash, row_hash
           ) VALUES (?, ?, ?, ?, 'REMISSION_GUIDE', 'remission_guide', ?, ?, ?, ?)`,
        )
        .bind(
          auditId,
          tenantId,
          branchId,
          userId,
          remissionGuideId,
          JSON.stringify({
            transferReasonCode: request.transferReasonCode,
            transportModeCode: request.transportModeCode,
            items: request.items.length,
            transferStartedAt: request.transferStartedAt,
          }),
          prevHash?.row_hash ?? null,
          rowHash,
        ),
    );
  };
  await runD1AtomicPlan(db, build);

  return {
    remissionGuideId,
    series: seriesRow.series,
    number: seriesRow.current_number + 1,
    transferReasonCode: request.transferReasonCode,
    sunatStatus: 'PENDING',
  };
}
