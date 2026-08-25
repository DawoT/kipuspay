/**
 * buildDailySummaryCron — RC PRIMARY por (tenant_id, summary_date) FIS-03.
 * CDR vía puerto inyectable (mock PSE en worker). No se dispara desde arqueo Z.
 * H1 (auditoría 0031): el sobre lleva boletas/tickets (03/12) y las NC/ND
 * (07/08) vinculadas a boletas — regla SUNAT §5.2 (nunca XML unitario).
 */
import {
  buildUblSummaryDocumentsXml,
  createMockRcCdrPort,
  markVoidedAfterRc,
  planDailySummary,
  planNrusDailyConsolidation,
  canOmitUnitaryNrus,
  rcSummaryId,
  FISCAL_ARCHIVE_RETENTION_YEARS,
  type BoletaForRc,
  type RcCdrPort,
  type RcSubmitResult,
} from '@kipuspay/domain-fiscal-pe';
import { runD1AtomicPlan, type D1DatabaseLike } from './index.js';
import type { FiscalXmlSigner } from './fiscal-xml-producer.js';

export type { RcCdrPort, RcSubmitResult } from '@kipuspay/domain-fiscal-pe';
export { createMockRcCdrPort } from '@kipuspay/domain-fiscal-pe';

/**
 * H3 (auditoría 0031) — política de retención del archivo fiscal (fuente de
 * verdad en domain-fiscal-pe): mínimo legal 5 años (Código de Comercio art.
 * 190 / Reglamento SUNAT). Un job futuro la aplica; aquí se expone para ese
 * consumidor. NO hay borrador automático en este módulo.
 */
export {
  FISCAL_ARCHIVE_RETENTION_MS,
  FISCAL_ARCHIVE_RETENTION_YEARS,
} from '@kipuspay/domain-fiscal-pe';

/** Puerto R2 del archivo fiscal (patrón FiscalXmlR2Like de fiscal-xml-producer). */
export interface FiscalArchiveR2 {
  put(key: string, value: string | Uint8Array): Promise<void>;
}

/** Clave R2 del sobre RC firmado — patrón consistente con fiscal-xml/<t>/<id>.xml. */
export function rcXmlArchiveKey(tenantId: string, summaryId: string): string {
  return `rc/${tenantId}/${summaryId}.xml`;
}

/** Clave R2 del CDR completo (zip) del RC. */
export function rcCdrArchiveKey(tenantId: string, summaryId: string): string {
  return `rc/${tenantId}/${summaryId}-cdr.zip`;
}

/** Clave R2 del receipt JSON del CDR cuando el PSE aún no entrega zip. */
export function rcCdrReceiptArchiveKey(tenantId: string, summaryId: string): string {
  return `rc/${tenantId}/${summaryId}-cdr.json`;
}

function cdrZipBytes(cdrZipB64: string): Uint8Array {
  const bin = atob(cdrZipB64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * H3 (auditoría 0031) — archivo post-commit del sobre firmado + CDR.
 * BEST-EFFORT: el SUCCESS del CDR ya es válido ante SUNAT; un fallo de R2
 * jamás revierte la tx ni el estado ACCEPTED (warn + claves NULL). Referencia
 * honesta: clave en D1 ⇒ objeto en R2 — la referencia se escribe en UNA sola
 * sentencia UPDATE DESPUÉS de que ambos objetos existen; si cualquier put
 * falla, no se escribe ninguna clave (sin referencias colgantes).
 */
async function archiveRcEnvelope(input: {
  readonly db: D1DatabaseLike;
  readonly archive: FiscalArchiveR2;
  readonly tenantId: string;
  readonly summaryId: string;
  readonly xml: string;
  readonly cdr: RcSubmitResult;
}): Promise<void> {
  const { db, archive, tenantId, summaryId, xml, cdr } = input;
  try {
    await archive.put(rcXmlArchiveKey(tenantId, summaryId), xml);
    if (cdr.cdrZipB64 !== undefined) {
      await archive.put(rcCdrArchiveKey(tenantId, summaryId), cdrZipBytes(cdr.cdrZipB64));
    } else {
      const receipt = JSON.stringify({
        kind: 'RC_CDR_RECEIPT',
        summaryId,
        tenantId,
        accepted: cdr.accepted,
        cdrCode: cdr.cdrCode,
        cdrMessage: cdr.cdrMessage,
        archivedAt: new Date().toISOString(),
        retentionYears: FISCAL_ARCHIVE_RETENTION_YEARS,
      });
      await archive.put(rcCdrReceiptArchiveKey(tenantId, summaryId), receipt);
    }
    await db
      .prepare(
        `UPDATE sunat_daily_summaries SET r2_rc_xml_key = ?, r2_cdr_key = ?
         WHERE id = ? AND tenant_id = ?`,
      )
      .bind(
        rcXmlArchiveKey(tenantId, summaryId),
        cdr.cdrZipB64 !== undefined
          ? rcCdrArchiveKey(tenantId, summaryId)
          : rcCdrReceiptArchiveKey(tenantId, summaryId),
        summaryId,
        tenantId,
      )
      .run();
  } catch (err) {
    console.warn('RC_ARCHIVE_FAILED', tenantId, summaryId, String(err));
  }
}

async function archiveRcXmlOnly(input: {
  readonly db: D1DatabaseLike;
  readonly archive: FiscalArchiveR2;
  readonly tenantId: string;
  readonly summaryId: string;
  readonly xml: string;
}): Promise<void> {
  const { db, archive, tenantId, summaryId, xml } = input;
  try {
    const xmlKey = rcXmlArchiveKey(tenantId, summaryId);
    await archive.put(xmlKey, xml);
    await db
      .prepare(`UPDATE sunat_daily_summaries SET r2_rc_xml_key = ? WHERE id = ? AND tenant_id = ?`)
      .bind(xmlKey, summaryId, tenantId)
      .run();
  } catch (err) {
    console.warn('RC_ARCHIVE_FAILED', tenantId, summaryId, String(err));
  }
}

async function archiveRcCdrOnly(input: {
  readonly db: D1DatabaseLike;
  readonly archive: FiscalArchiveR2;
  readonly tenantId: string;
  readonly summaryId: string;
  readonly cdr: {
    readonly accepted: boolean;
    readonly cdrCode?: string | undefined;
    readonly cdrMessage?: string | undefined;
    readonly cdrZipB64?: string | undefined;
  };
}): Promise<void> {
  const { db, archive, tenantId, summaryId, cdr } = input;
  try {
    if (cdr.cdrZipB64 !== undefined) {
      const zipKey = rcCdrArchiveKey(tenantId, summaryId);
      await archive.put(zipKey, cdrZipBytes(cdr.cdrZipB64));
      await db
        .prepare(`UPDATE sunat_daily_summaries SET r2_cdr_key = ? WHERE id = ? AND tenant_id = ?`)
        .bind(zipKey, summaryId, tenantId)
        .run();
    } else {
      const receiptKey = rcCdrReceiptArchiveKey(tenantId, summaryId);
      const receipt = JSON.stringify({
        kind: 'RC_CDR_RECEIPT',
        summaryId,
        tenantId,
        accepted: cdr.accepted,
        cdrCode: cdr.cdrCode ?? '0',
        cdrMessage: cdr.cdrMessage ?? 'Aceptado',
        archivedAt: new Date().toISOString(),
        retentionYears: FISCAL_ARCHIVE_RETENTION_YEARS,
      });
      await archive.put(receiptKey, receipt);
      await db
        .prepare(`UPDATE sunat_daily_summaries SET r2_cdr_key = ? WHERE id = ? AND tenant_id = ?`)
        .bind(receiptKey, summaryId, tenantId)
        .run();
    }
  } catch (err) {
    console.warn('RC_ARCHIVE_FAILED', tenantId, summaryId, String(err));
  }
}

export interface BuildDailySummaryInput {
  readonly tenantId: string;
  readonly summaryDate: string;
  readonly nowMs: number;
  readonly cdr?: RcCdrPort;
  readonly signer?: FiscalXmlSigner;
  /**
   * H3 (auditoría 0031): archivo R2 del sobre RC firmado + CDR (conservación
   * SUNAT). Best-effort post-commit — ver archiveRcEnvelope.
   */
  readonly archive?: FiscalArchiveR2;
}

export interface BuildDailySummaryResult {
  readonly status: 'SUCCESS' | 'NOOP_EMPTY' | 'ALREADY_EXISTS' | 'MISSING_SIGNER';
  readonly dailySummaryId?: string | undefined;
  readonly sunatStatus?: string | undefined;
  readonly ticketCount?: number | undefined;
  readonly nrusOmittedCount?: number | undefined;
  /** FIS-03 — tipo de sobre RC emitido (solo en SUCCESS). */
  readonly rcType?: ('PRIMARY' | 'COMPLEMENTARY') | undefined;
  /** ID UBL del sobre `RC-YYYYMMDD-NNN` (solo en SUCCESS). */
  readonly rcUblId?: string | undefined;
  /** Número de ticket de recepción SUNAT retornado ante statusCode 98 o consulta. */
  readonly sunatReceptionTicket?: string | undefined;
}

/** Fail-closed §5.2 (ADR-FISCAL-008): ¿emisor TENANT_CERT sin material de firma? */
function isTenantCertWithoutSigner(
  tenant: { readonly pse_mode: string | null } | null | undefined,
  signer: FiscalXmlSigner | undefined,
): boolean {
  return tenant?.pse_mode === 'TENANT_CERT' && !signer;
}

interface RcXmlRow {
  readonly document_type: string;
  readonly series: string;
  readonly number: number;
  readonly client_document_type: string;
  readonly client_document_number: string;
  readonly void_status: string;
  readonly total_taxable_cents: number;
  readonly total_igv_cents: number;
  readonly total_amount_cents: number;
  /** H1: motivo cat. 09/10 de la nota (07/08) — define la condición cat. 19. */
  readonly credit_note_motive_code: string | null;
}

/**
 * H1 (auditoría 0031): condición de línea del RC (catálogo 19 — 1=adición,
 * 3=baja). Boletas: baja solo con anulación pendiente de RC. Notas (07/08)
 * sobre boleta: primera inclusión → adición; la NC de anulación (motivo '01'
 * cat. 09, "Anulacion de la operacion") reporta la baja de la operación.
 */
function rcLineConditionCode(r: RcXmlRow): '1' | '3' {
  if (r.document_type === '07') return r.credit_note_motive_code === '01' ? '3' : '1';
  if (r.document_type === '08') return '1';
  return r.void_status === 'VOID_PENDING_RC' ? '3' : '1';
}

interface RcXmlTenant {
  readonly ruc: string | null;
  readonly business_name: string;
}

/**
 * Sobre del RC: UBL SummaryDocuments real cuando el emisor tiene RUC válido
 * (firmado si hay signer); placeholder staging-only para PSE sin RUC (el mock
 * CDR lo acepta — jamás llega a SUNAT real).
 */
async function buildRcEnvelopeXml(input: {
  readonly tenantId: string;
  readonly summaryDate: string;
  readonly ticketCount: number;
  readonly nrusOmitted: number;
  readonly sunatTicket: string;
  readonly tenant: RcXmlTenant | null;
  readonly rows: readonly RcXmlRow[];
  readonly signer?: FiscalXmlSigner | undefined;
}): Promise<string> {
  const tenant = input.tenant;
  const ruc = tenant?.ruc ?? null;
  if (!(tenant && ruc && /^\d{11}$/.test(ruc))) {
    return `<DailySummary tenant="${input.tenantId}" date="${input.summaryDate}" tickets="${input.ticketCount}" nrusOmit="${input.nrusOmitted}"/>`;
  }
  let xml = buildUblSummaryDocumentsXml({
    id: input.sunatTicket,
    referenceDate: input.summaryDate,
    issueDate: input.summaryDate,
    issuerRuc: ruc,
    issuerName: tenant.business_name,
    lines: input.rows.map((r, i) => ({
      lineId: i + 1,
      // H1: tipo real por línea — boleta (03), ticket (12) y notas sobre
      // boleta (07/08). Jamás se colapsan: SUNAT valida el tipo del CPE.
      documentType:
        r.document_type === '12'
          ? '12'
          : r.document_type === '07'
            ? '07'
            : r.document_type === '08'
              ? '08'
              : '03',
      documentId: `${r.series}-${String(r.number).padStart(8, '0')}`,
      customerDocType: r.client_document_type || '1',
      customerDocNumber: r.client_document_number || '00000000',
      conditionCode: rcLineConditionCode(r),
      totalTaxableCents: r.total_taxable_cents,
      totalIgvCents: r.total_igv_cents,
      totalAmountCents: r.total_amount_cents,
    })),
  });
  if (input.signer) xml = await input.signer.sign(xml, input.tenantId);
  return xml;
}

// eslint-disable-next-line complexity
export async function buildDailySummary(
  db: D1DatabaseLike,
  input: BuildDailySummaryInput,
): Promise<BuildDailySummaryResult> {
  const cdrPort = input.cdr ?? createMockRcCdrPort();

  /**
   * F-05a — Ventana atómica documentada:
   * Antes: await cdrPort.submit() (:604) → await runD1AtomicPlan INSERT (:626).
   * Si el proceso muere tras recibir ticket SUNAT-TICKET-98765 (SUNAT ya lo tiene)
   * pero antes del INSERT, el ticket se pierde (D1 no lo persiste) y el siguiente
   * buildDailySummary generaría un RC duplicado con correlativo distinto.
   * Solución crash-safe: INSERT optimista del RC en PROCESSING con
   * sunat_reception_ticket=NULL ANTES de submit, luego UPDATE con ticket tras
   * submit exitoso. Si el proceso muere entre submit y UPDATE, queda un
   * PROCESSING huérfano sin ticket para ese (tenant,summary_date,correlative);
   * al reintentar, buildDailySummary detecta el PROCESSING sin ticket y lo
   * reusa (resubmit idempotente con mismo summaryId/sunatTicket) sin pérdida.
   * Alternativa WAL pre-INSERT es aceptable pero se eligió INSERT optimista por
   * minimizar cambios y mantener una sola tabla como fuente de verdad.
   * La ventana ahora es submit→UPDATE (más corta) y es recuperable vía
   * summaryId determinista RC-YYYYMMDD-NNN (ublId) o vía fila huérfana.
   */

  // 1. Manejo de todos los PROCESSING (F-05c: sin LIMIT 1, itera todos)
  // Hacemos un fetch de tenant temprano para reusar en recuperación de huérfanos
  const tenantEarly = await db
    .prepare(`SELECT tax_regime, ruc, business_name, pse_mode FROM tenants WHERE id = ?`)
    .bind(input.tenantId)
    .first<{
      tax_regime: string;
      ruc: string | null;
      business_name: string;
      pse_mode: string | null;
    }>();

  const processingAll = await db
    .prepare(
      `SELECT id, status, rc_type, ticket_count, sunat_ticket, sunat_reception_ticket, correlative
       FROM sunat_daily_summaries
       WHERE tenant_id = ? AND summary_date = ? AND status = 'PROCESSING'
       ORDER BY correlative ASC`,
    )
    .bind(input.tenantId, input.summaryDate)
    .all<{
      id: string;
      status: string;
      rc_type: 'PRIMARY' | 'COMPLEMENTARY';
      ticket_count: number;
      sunat_ticket: string | null;
      sunat_reception_ticket: string | null;
      correlative: number;
    }>();

  const processings = processingAll.results ?? [];
  let pendingProcessing: (typeof processings)[number] | null = null;
  let lastAccepted: (typeof processings)[number] | null = null;
  let lastRejected: (typeof processings)[number] | null = null;
  let lastAcceptedTicket: string | null = null;
  let lastRejectedTicket: string | null = null;
  let pendingTicket: string | null = null;
  let hasAcceptedInLoop = false;

  for (const proc of processings) {
    if (proc.sunat_reception_ticket) {
      if (typeof cdrPort.queryStatus !== 'function') {
        if (!pendingProcessing) pendingProcessing = proc;
        continue;
      }
      const queryResult = await cdrPort.queryStatus({
        tenantId: input.tenantId,
        ticket: proc.sunat_reception_ticket,
      });

      if (queryResult.status === 'ACCEPTED' || queryResult.accepted) {
        await runD1AtomicPlan(db, (planBuilder) => {
          planBuilder.add(
            db
              .prepare(
                `UPDATE sunat_daily_summaries
                 SET status = 'ACCEPTED', cdr_code = ?, cdr_message = ?
                 WHERE id = ? AND tenant_id = ?`,
              )
              .bind(
                queryResult.cdrCode ?? '0',
                queryResult.cdrMessage ?? 'Aceptado',
                proc.id,
                input.tenantId,
              ),
          );
          planBuilder.add(
            db
              .prepare(
                `UPDATE sales
                 SET sunat_status = 'ACCEPTED',
                     void_status = CASE WHEN void_status = 'VOID_PENDING_RC' THEN 'VOIDED' ELSE void_status END
                 WHERE daily_summary_id = ? AND tenant_id = ?`,
              )
              .bind(proc.id, input.tenantId),
          );
        });

        if (input.archive) {
          await archiveRcCdrOnly({
            db,
            archive: input.archive,
            tenantId: input.tenantId,
            summaryId: proc.id,
            cdr: {
              accepted: true,
              cdrCode: queryResult.cdrCode ?? '0',
              cdrMessage: queryResult.cdrMessage ?? 'Aceptado',
              cdrZipB64: queryResult.cdrZipB64,
            },
          });
        }
        hasAcceptedInLoop = true;
        lastAccepted = proc;
        lastAcceptedTicket = proc.sunat_reception_ticket;
      } else if (queryResult.status === 'REJECTED') {
        await runD1AtomicPlan(db, (planBuilder) => {
          planBuilder.add(
            db
              .prepare(
                `UPDATE sunat_daily_summaries
                 SET status = 'REJECTED', cdr_code = ?, cdr_message = ?
                 WHERE id = ? AND tenant_id = ?`,
              )
              .bind(
                queryResult.cdrCode ?? '99',
                queryResult.cdrMessage ?? 'Rechazado',
                proc.id,
                input.tenantId,
              ),
          );
          planBuilder.add(
            db
              .prepare(
                `UPDATE sales
                 SET sunat_status = 'REJECTED'
                 WHERE daily_summary_id = ? AND tenant_id = ?`,
              )
              .bind(proc.id, input.tenantId),
          );
        });
        lastRejected = proc;
        lastRejectedTicket = proc.sunat_reception_ticket;
      } else {
        // PROCESSING o UNREACHABLE: sigue en proceso en SUNAT
        if (!pendingProcessing) {
          pendingProcessing = proc;
          pendingTicket = proc.sunat_reception_ticket;
        }
      }
    } else {
      // F-05a — huérfano sin ticket (crash entre INSERT optimista y UPDATE)
      // Recuperación: reconstruir XML desde sales vinculadas y resubmit idempotente
      const linked = await db
        .prepare(
          `SELECT document_type, series, number, client_document_type, client_document_number,
                  void_status, total_taxable_cents, total_igv_cents, total_amount_cents, credit_note_motive_code
           FROM sales
           WHERE daily_summary_id = ? AND tenant_id = ?`,
        )
        .bind(proc.id, input.tenantId)
        .all<RcXmlRow>();
      const linkedRows = linked.results ?? [];
      if (linkedRows.length === 0) {
        // Sin ventas vinculadas: huérfano vacío, marcar como pendiente para no bloquear
        if (!pendingProcessing) {
          pendingProcessing = proc;
          pendingTicket = proc.sunat_reception_ticket;
        }
        continue;
      }
      const tenantForOrphan = tenantEarly;
      // Reconstruir XML con mismo sunatTicket/correlative
      let xmlOrphan: string;
      try {
        xmlOrphan = await buildRcEnvelopeXml({
          tenantId: input.tenantId,
          summaryDate: input.summaryDate,
          ticketCount: proc.ticket_count,
          nrusOmitted: 0,
          sunatTicket: proc.sunat_ticket ?? rcSummaryId(input.summaryDate, proc.correlative),
          tenant: tenantForOrphan,
          rows: linkedRows,
          signer: input.signer,
        });
      } catch {
        if (!pendingProcessing) {
          pendingProcessing = proc;
          pendingTicket = proc.sunat_reception_ticket;
        }
        continue;
      }
      let cdrOrphan: RcSubmitResult;
      try {
        cdrOrphan = await cdrPort.submit({
          tenantId: input.tenantId,
          summaryId: proc.id,
          xml: xmlOrphan,
          ...(proc.sunat_ticket ? { ublId: proc.sunat_ticket } : {}),
        });
      } catch {
        if (!pendingProcessing) {
          pendingProcessing = proc;
          pendingTicket = proc.sunat_reception_ticket;
        }
        continue;
      }
      let newRcStatus: 'ACCEPTED' | 'PROCESSING' | 'REJECTED';
      let newSaleStatus: 'ACCEPTED' | 'PROCESSING' | 'REJECTED';
      const receptionTicketOrphan = cdrOrphan.ticket ?? null;
      if (cdrOrphan.status === 'PROCESSING') {
        newRcStatus = 'PROCESSING';
        newSaleStatus = 'PROCESSING';
      } else if (cdrOrphan.accepted || cdrOrphan.status === 'ACCEPTED') {
        newRcStatus = 'ACCEPTED';
        newSaleStatus = 'ACCEPTED';
      } else {
        newRcStatus = 'REJECTED';
        newSaleStatus = 'REJECTED';
      }
      await runD1AtomicPlan(db, (planBuilder) => {
        planBuilder.add(
          db
            .prepare(
              `UPDATE sunat_daily_summaries
               SET status = ?, sunat_reception_ticket = ?, cdr_code = ?, cdr_message = ?, submitted_at = datetime('now')
               WHERE id = ? AND tenant_id = ?`,
            )
            .bind(
              newRcStatus,
              receptionTicketOrphan,
              cdrOrphan.cdrCode ?? (newRcStatus === 'ACCEPTED' ? '0' : null),
              cdrOrphan.cdrMessage ?? (newRcStatus === 'PROCESSING' ? 'En proceso' : null),
              proc.id,
              input.tenantId,
            ),
        );
        if (newRcStatus === 'ACCEPTED') {
          planBuilder.add(
            db
              .prepare(
                `UPDATE sales
                 SET sunat_status = ?, void_status = CASE WHEN void_status = 'VOID_PENDING_RC' THEN 'VOIDED' ELSE void_status END
                 WHERE daily_summary_id = ? AND tenant_id = ?`,
              )
              .bind(newSaleStatus, proc.id, input.tenantId),
          );
        } else {
          planBuilder.add(
            db
              .prepare(
                `UPDATE sales SET sunat_status = ? WHERE daily_summary_id = ? AND tenant_id = ?`,
              )
              .bind(newSaleStatus, proc.id, input.tenantId),
          );
        }
      });
      if (input.archive) {
        if (newRcStatus === 'ACCEPTED') {
          await archiveRcEnvelope({
            db,
            archive: input.archive,
            tenantId: input.tenantId,
            summaryId: proc.id,
            xml: xmlOrphan,
            cdr: cdrOrphan,
          });
        } else {
          await archiveRcXmlOnly({
            db,
            archive: input.archive,
            tenantId: input.tenantId,
            summaryId: proc.id,
            xml: xmlOrphan,
          });
        }
      }
      if (newRcStatus === 'ACCEPTED') {
        hasAcceptedInLoop = true;
        lastAccepted = proc;
        lastAcceptedTicket = receptionTicketOrphan;
      } else if (newRcStatus === 'REJECTED') {
        lastRejected = proc;
        lastRejectedTicket = receptionTicketOrphan;
      } else {
        if (!pendingProcessing) {
          pendingProcessing = proc;
          pendingTicket = receptionTicketOrphan;
        }
      }
    }
  }

  // Si queda algún PROCESSING pendiente sin resolver, retornamos ese estado
  // (comportamiento original: no crear nuevo RC mientras hay uno en PROCESSING)
  // Pero con múltiples, si hay al menos uno pendiente, retornamos el primero pendiente
  // solo si no hay boletas pendientes adicionales que justifiquen un COMPLEMENTARY
  // La decisión final de crear nuevo RC se toma después de verificar pending boletas;
  // aquí solo retornamos early si hay pendiente y no hay aceptados recientes con resto.

  // Si hubo un REJECTED y no hay pendientes adicionales, retornamos REJECTED
  // (mantiene compatibilidad con test de rechazo)
  if (lastRejected && !hasAcceptedInLoop && !pendingProcessing) {
    // Verificar si hay boletas pendientes: si no hay, retornar REJECTED como antes
    const remainingCheck = await db
      .prepare(
        `SELECT COUNT(*) AS n
         FROM sales
         WHERE tenant_id = ?
           AND deleted_at IS NULL
           AND (
             document_type IN ('03','12')
             OR (
               document_type IN ('07','08')
               AND EXISTS (
                 SELECT 1 FROM sales orig
                 WHERE orig.tenant_id = sales.tenant_id
                   AND orig.id = sales.referenced_sale_id
                   AND orig.document_type IN ('03','12')
               )
             )
           )
           AND sunat_status IN ('PENDING','PROCESSING','ACCEPTED','DEADLINE_EXCEEDED')
           AND daily_summary_id IS NULL
           AND date(issued_at_lima) = ?`,
      )
      .bind(input.tenantId, input.summaryDate)
      .first<{ n: number }>();
    if (!remainingCheck || remainingCheck.n === 0) {
      return {
        status: 'SUCCESS',
        dailySummaryId: lastRejected.id,
        sunatStatus: 'REJECTED',
        ticketCount: lastRejected.ticket_count,
        rcType: lastRejected.rc_type,
        rcUblId: lastRejected.sunat_ticket ?? undefined,
        sunatReceptionTicket:
          lastRejectedTicket ?? lastRejected.sunat_reception_ticket ?? undefined,
      };
    }
  }

  if (pendingProcessing && !hasAcceptedInLoop) {
    // Hay al menos un PROCESSING que sigue en PROCESSING y no se resolvió a ACCEPTED
    // Comportamiento legacy: retornar PROCESSING sin crear nuevo RC
    // Verificamos si ya no hay boletas pendientes adicionales; si las hay, igual retornamos PROCESSING
    // (el caller podrá decidir crear complementario en siguiente intento)
    return {
      status: 'SUCCESS',
      dailySummaryId: pendingProcessing.id,
      sunatStatus: 'PROCESSING',
      ticketCount: pendingProcessing.ticket_count,
      rcType: pendingProcessing.rc_type,
      rcUblId: pendingProcessing.sunat_ticket ?? undefined,
      sunatReceptionTicket: pendingTicket ?? pendingProcessing.sunat_reception_ticket ?? undefined,
    };
  }

  // Si hubo aceptados y no hay pendientes, retornamos el último aceptado (original: check remaining==0)
  if (hasAcceptedInLoop && lastAccepted) {
    const remainingBoletasAfterAccept = await db
      .prepare(
        `SELECT COUNT(*) AS n
         FROM sales
         WHERE tenant_id = ?
           AND deleted_at IS NULL
           AND (
             document_type IN ('03','12')
             OR (
               document_type IN ('07','08')
               AND EXISTS (
                 SELECT 1 FROM sales orig
                 WHERE orig.tenant_id = sales.tenant_id
                   AND orig.id = sales.referenced_sale_id
                   AND orig.document_type IN ('03','12')
               )
             )
           )
           AND sunat_status IN ('PENDING','PROCESSING','ACCEPTED','DEADLINE_EXCEEDED')
           AND daily_summary_id IS NULL
           AND date(issued_at_lima) = ?`,
      )
      .bind(input.tenantId, input.summaryDate)
      .first<{ n: number }>();
    if (!remainingBoletasAfterAccept || remainingBoletasAfterAccept.n === 0) {
      return {
        status: 'SUCCESS',
        dailySummaryId: lastAccepted.id,
        sunatStatus: 'ACCEPTED',
        ticketCount: lastAccepted.ticket_count,
        rcType: lastAccepted.rc_type,
        rcUblId: lastAccepted.sunat_ticket ?? undefined,
        sunatReceptionTicket:
          lastAcceptedTicket ?? lastAccepted.sunat_reception_ticket ?? undefined,
      };
    }
    // Si quedan boletas, continuamos para crear COMPLEMENTARY
  }

  // 2. Consultar resúmenes existentes del día para este emisor
  const existingSummaries = await db
    .prepare(
      `SELECT id, status, rc_type, correlative, sunat_ticket FROM sunat_daily_summaries
       WHERE tenant_id = ? AND summary_date = ?
       ORDER BY correlative ASC`,
    )
    .bind(input.tenantId, input.summaryDate)
    .all<{
      id: string;
      status: string;
      rc_type: 'PRIMARY' | 'COMPLEMENTARY';
      correlative: number;
      sunat_ticket: string | null;
    }>();

  const summaryRows = existingSummaries.results ?? [];

  const tenant = tenantEarly;

  // H1 (auditoría 0031): el RC lleva boletas/tickets (03/12) Y las notas
  // (07/08) cuyo documento afectado es boleta/ticket — regla SUNAT §5.2.
  // Las notas sobre facturas viajan UNIT_XML y jamás entran aquí.
  const boletas = await db
    .prepare(
      `SELECT id, branch_id, document_type, series, number, client_document_type,
              client_document_number, total_amount_cents, total_taxable_cents,
              total_igv_cents, void_status, issued_at_lima, sunat_status,
              credit_note_motive_code
       FROM sales
       WHERE tenant_id = ?
         AND deleted_at IS NULL
         AND (
           document_type IN ('03','12')
           OR (
             document_type IN ('07','08')
             AND EXISTS (
               SELECT 1 FROM sales orig
               WHERE orig.tenant_id = sales.tenant_id
                 AND orig.id = sales.referenced_sale_id
                 AND orig.document_type IN ('03','12')
             )
           )
         )
         AND sunat_status IN ('PENDING','PROCESSING','ACCEPTED','DEADLINE_EXCEEDED')
         AND daily_summary_id IS NULL
         AND date(issued_at_lima) = ?`,
    )
    .bind(input.tenantId, input.summaryDate)
    .all<{
      id: string;
      branch_id: string;
      document_type: string;
      series: string;
      number: number;
      client_document_type: string;
      client_document_number: string;
      total_amount_cents: number;
      total_taxable_cents: number;
      total_igv_cents: number;
      void_status: string;
      issued_at_lima: string;
      sunat_status: string;
      credit_note_motive_code: string | null;
    }>();

  const rows = (boletas.results ?? []).filter((r) => r.sunat_status !== 'ACCEPTED');
  if (rows.length === 0) {
    if (summaryRows.length > 0) {
      const lastSummary = summaryRows[summaryRows.length - 1]!;
      return {
        status: 'ALREADY_EXISTS',
        dailySummaryId: lastSummary.id,
        sunatStatus: lastSummary.status,
      };
    }
    return { status: 'NOOP_EMPTY' };
  }

  // Fail-closed §5.2 (ADR-FISCAL-008): un emisor TENANT_CERT sin material de
  // firma jamás emite RC — ni placeholder ni SummaryDocuments unsigned llegan
  // al puerto CDR. Con boletas pendientes el resultado es MISSING_SIGNER;
  // sin boletas no había nada que emitir (NOOP_EMPTY ya retornó arriba).
  if (isTenantCertWithoutSigner(tenant, input.signer)) {
    return { status: 'MISSING_SIGNER' };
  }

  const forRc: BoletaForRc[] = rows.map((r) => ({
    saleId: r.id,
    branchId: r.branch_id,
    documentType: r.document_type,
    totalAmountCents: r.total_amount_cents,
    voidStatus: r.void_status,
    issuedAtMs: Date.parse(r.issued_at_lima),
  }));

  const plan = planDailySummary(input.tenantId, input.summaryDate, forRc);

  const regime = (tenant?.tax_regime ?? 'UNKNOWN') as 'UNKNOWN' | 'NRUS' | 'RER' | 'RMT' | 'RG';
  const nrusLines = rows
    .filter((r) =>
      canOmitUnitaryNrus({
        taxRegime: regime,
        totalAmountCents: r.total_amount_cents,
        documentType: r.document_type,
      }),
    )
    .map((r) => ({ saleId: r.id, totalAmountCents: r.total_amount_cents }));
  const nrusPlan = planNrusDailyConsolidation(nrusLines);

  const mustSubmitBy = new Date(
    Date.parse(`${input.summaryDate}T23:59:59.999-05:00`) + 6 * 24 * 3600 * 1000,
  ).toISOString();

  /**
   * F-05b — Correlativo serializable:
   * Antes: correlative = max(...)+1 computado fuera de la tx (no serializable).
   * Dos buildDailySummary concurrentes para mismo (tenant,date) calculaban mismo
   * correlative y chocaban en UNIQUE → 500.
   * Ahora: SELECT COALESCE(MAX(correlative),0)+1 DENTRO de cada intento de tx
   * (leído justo antes del INSERT optimista) + retry en UNIQUE. Si INSERT falla
   * con SQLITE_CONSTRAINT_UNIQUE correlative, reintentar una vez con
   * correlative+1 (recalculando MAX). Esto serializa la reserva sin bloqueos.
   */
  let summaryId: string | null = null;
  let correlative: number | null = null;
  let rcType: 'PRIMARY' | 'COMPLEMENTARY' | null = null;
  let sunatTicket: string | null = null;
  let xml: string | null = null;
  let attempt = 0;
  const maxAttempts = 3;
  let lastCorrelativeErr: unknown = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    // Recalcular MAX dentro del intento (cerca de la tx)
    const maxRes = await db
      .prepare(
        `SELECT COALESCE(MAX(correlative), 0) AS maxCorr FROM sunat_daily_summaries WHERE tenant_id = ? AND summary_date = ?`,
      )
      .bind(input.tenantId, input.summaryDate)
      .first<{ maxCorr: number }>();
    const nextCorr = (maxRes?.maxCorr ?? 0) + 1;
    correlative = nextCorr;
    const primaryCheck = await db
      .prepare(
        `SELECT id FROM sunat_daily_summaries WHERE tenant_id = ? AND summary_date = ? AND rc_type = 'PRIMARY' LIMIT 1`,
      )
      .bind(input.tenantId, input.summaryDate)
      .first<{ id: string }>();
    rcType = primaryCheck ? 'COMPLEMENTARY' : 'PRIMARY';
    sunatTicket = rcSummaryId(input.summaryDate, correlative);
    summaryId = crypto.randomUUID();

    xml = await buildRcEnvelopeXml({
      tenantId: input.tenantId,
      summaryDate: input.summaryDate,
      ticketCount: plan.ticketCount,
      nrusOmitted: nrusPlan.omittedSaleIds.length,
      sunatTicket,
      tenant,
      rows,
      signer: input.signer,
    });

    // F-05a — INSERT optimista en PROCESSING con ticket NULL ANTES de submit
    try {
      await runD1AtomicPlan(db, (planBuilder) => {
        planBuilder.add(
          db
            .prepare(
              `INSERT INTO sunat_daily_summaries
                 (id, tenant_id, branch_id, summary_date, status, must_submit_by, rc_type, ticket_count,
                  sunat_ticket, sunat_reception_ticket, correlative, cdr_code, cdr_message, submitted_at)
               VALUES (?, ?, NULL, ?, 'PROCESSING', ?, ?, ?, ?, NULL, ?, NULL, NULL, datetime('now'))`,
            )
            .bind(
              summaryId,
              input.tenantId,
              input.summaryDate,
              mustSubmitBy,
              rcType,
              plan.ticketCount,
              sunatTicket,
              correlative,
            ),
        );
        for (const saleId of plan.saleIds) {
          planBuilder.add(
            db
              .prepare(
                `UPDATE sales SET daily_summary_id = ?, sunat_status = ?
                 WHERE id = ? AND tenant_id = ?`,
              )
              .bind(summaryId, 'PROCESSING', saleId, input.tenantId),
          );
        }
      });
      break; // éxito, salir del retry
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        /UNIQUE constraint failed.*correlative/i.test(msg) ||
        /UNIQUE constraint failed.*sunat_daily_summaries/i.test(msg)
      ) {
        lastCorrelativeErr = e;
        if (attempt >= maxAttempts) throw e;
        // retry con nuevo correlative
        continue;
      }
      throw e;
    }
  }

  if (!summaryId || correlative === null || !rcType || !sunatTicket || !xml) {
    if (lastCorrelativeErr instanceof Error) throw lastCorrelativeErr;
    throw new Error('RC_CORRELATIVE_RETRY_EXHAUSTED');
  }

  // Submit fuera de la tx (idempotente por summaryId+ublId)
  let cdr: RcSubmitResult;
  try {
    cdr = await cdrPort.submit({
      tenantId: input.tenantId,
      summaryId,
      xml,
      ublId: sunatTicket,
    });
  } catch {
    // Fallo de red/transporte: dejamos el RC en PROCESSING sin ticket para que
    // el siguiente buildDailySummary lo recupere vía huérfano (F-05a)
    return {
      status: 'SUCCESS',
      dailySummaryId: summaryId,
      sunatStatus: 'PROCESSING',
      ticketCount: plan.ticketCount,
      nrusOmittedCount: nrusPlan.omittedSaleIds.length,
      rcType,
      rcUblId: sunatTicket,
      sunatReceptionTicket: undefined,
    };
  }

  let rcStatus: 'ACCEPTED' | 'PROCESSING' | 'REJECTED';
  let saleStatus: 'ACCEPTED' | 'PROCESSING' | 'REJECTED';
  const receptionTicket = cdr.ticket ?? null;

  if (cdr.status === 'PROCESSING') {
    rcStatus = 'PROCESSING';
    saleStatus = 'PROCESSING';
  } else if (cdr.accepted || cdr.status === 'ACCEPTED') {
    rcStatus = 'ACCEPTED';
    saleStatus = 'ACCEPTED';
  } else {
    rcStatus = 'REJECTED';
    saleStatus = 'REJECTED';
  }

  // F-05a — segunda fase: UPDATE con ticket tras submit exitoso
  await runD1AtomicPlan(db, (planBuilder) => {
    planBuilder.add(
      db
        .prepare(
          `UPDATE sunat_daily_summaries
           SET status = ?, sunat_reception_ticket = ?, cdr_code = ?, cdr_message = ?, submitted_at = datetime('now')
           WHERE id = ? AND tenant_id = ?`,
        )
        .bind(
          rcStatus,
          receptionTicket,
          cdr.cdrCode ?? (rcStatus === 'ACCEPTED' ? '0' : null),
          cdr.cdrMessage ?? (rcStatus === 'PROCESSING' ? 'En proceso' : null),
          summaryId,
          input.tenantId,
        ),
    );
    for (const saleId of plan.saleIds) {
      const isVoidPending = plan.voidSaleIds.includes(saleId);
      if (rcStatus === 'ACCEPTED') {
        const voidNext = isVoidPending ? markVoidedAfterRc('VOID_PENDING_RC') : null;
        if (voidNext) {
          planBuilder.add(
            db
              .prepare(
                `UPDATE sales SET sunat_status = ?, void_status = ?
                 WHERE daily_summary_id = ? AND tenant_id = ? AND id = ?`,
              )
              .bind(saleStatus, voidNext, summaryId, input.tenantId, saleId),
          );
        } else {
          planBuilder.add(
            db
              .prepare(
                `UPDATE sales SET sunat_status = ?
                 WHERE daily_summary_id = ? AND tenant_id = ? AND id = ?`,
              )
              .bind(saleStatus, summaryId, input.tenantId, saleId),
          );
        }
      } else {
        planBuilder.add(
          db
            .prepare(
              `UPDATE sales SET sunat_status = ?
               WHERE daily_summary_id = ? AND tenant_id = ? AND id = ?`,
            )
            .bind(saleStatus, summaryId, input.tenantId, saleId),
        );
      }
    }
  });

  // H3 (auditoría 0031): conservación SUNAT — sobre firmado + CDR a R2,
  // DESPUÉS del commit de la tx (best-effort; nunca revierte el SUCCESS).
  if (input.archive) {
    if (rcStatus === 'ACCEPTED') {
      await archiveRcEnvelope({
        db,
        archive: input.archive,
        tenantId: input.tenantId,
        summaryId,
        xml,
        cdr,
      });
    } else {
      await archiveRcXmlOnly({
        db,
        archive: input.archive,
        tenantId: input.tenantId,
        summaryId,
        xml,
      });
    }
  }

  return {
    status: 'SUCCESS',
    dailySummaryId: summaryId,
    sunatStatus: rcStatus,
    ticketCount: plan.ticketCount,
    nrusOmittedCount: nrusPlan.omittedSaleIds.length,
    rcType,
    rcUblId: sunatTicket,
    sunatReceptionTicket: receptionTicket ?? undefined,
  };
}

/** Arqueo Z no dispara RC (banner Z≠RC). */
export function triggerRcFromCashClose(): never {
  throw new Error('CASH_CLOSE_MUST_NOT_TRIGGER_RC');
}

export interface DailySummarySweepResult {
  readonly summaryDate: string;
  readonly tenantsWithPending: number;
  readonly results: readonly {
    readonly tenantId: string;
    readonly status: BuildDailySummaryResult['status'];
    readonly ticketCount?: number;
  }[];
}

/**
 * F5b-1: sweep multi-tenant del RC diario — lista tenants con boletas del día
 * aún sin RC (PENDING/PROCESSING/ACCEPTED/DEADLINE_EXCEEDED, daily_summary_id
 * NULL) y construye su RC. El cron llama esto con summaryDate = día Lima previo.
 * F-05c: el sweep ahora resuelve TODOS los PROCESSING del día (sin LIMIT 1) vía
 * buildDailySummary que itera todos los PROCESSING del tenant; si hay 2
 * PROCESSING del mismo día, ambos quedan resueltos en un solo sweep.
 */
export async function runDailySummarySweep(
  db: D1DatabaseLike,
  input: {
    readonly summaryDate: string;
    readonly nowMs: number;
    readonly limit?: number;
    /** C6: puerto RC real; sin él el sweep usa el mock (staging only). */
    readonly cdr?: RcCdrPort;
    /**
     * Fail-closed §5.2: signer para emisores TENANT_CERT. Sin él, esos
     * emisores reportan MISSING_SIGNER (nunca RC unsigned).
     */
    readonly signer?: FiscalXmlSigner;
  },
): Promise<DailySummarySweepResult> {
  const limit = input.limit ?? 500;
  // H1: mismo criterio de elegibilidad que buildDailySummary — boletas/tickets
  // y notas (07/08) sobre boleta, además de resúmenes en PROCESSING pendientes de consulta.
  const processingTenants = await db
    .prepare(
      `SELECT DISTINCT tenant_id
       FROM sunat_daily_summaries
       WHERE summary_date = ? AND status = 'PROCESSING'
       ORDER BY tenant_id
       LIMIT ?`,
    )
    .bind(input.summaryDate, limit)
    .all<{ tenant_id: string }>();

  const pending = await db
    .prepare(
      `SELECT DISTINCT tenant_id
       FROM sales
       WHERE deleted_at IS NULL
         AND (
           document_type IN ('03','12')
           OR (
             document_type IN ('07','08')
             AND EXISTS (
               SELECT 1 FROM sales orig
               WHERE orig.tenant_id = sales.tenant_id
                 AND orig.id = sales.referenced_sale_id
                 AND orig.document_type IN ('03','12')
             )
           )
         )
         AND sunat_status IN ('PENDING','PROCESSING','ACCEPTED','DEADLINE_EXCEEDED')
         AND daily_summary_id IS NULL
         AND date(issued_at_lima) = ?
       ORDER BY tenant_id
       LIMIT ?`,
    )
    .bind(input.summaryDate, limit)
    .all<{ tenant_id: string }>();

  const tenantSet = new Set<string>();
  for (const row of processingTenants.results ?? []) {
    tenantSet.add(row.tenant_id);
  }
  for (const row of pending.results ?? []) {
    tenantSet.add(row.tenant_id);
  }
  const tenants = Array.from(tenantSet);

  const results: DailySummarySweepResult['results'][number][] = [];
  for (const tenantId of tenants) {
    // F-05c: buildDailySummary ahora resuelve todos los PROCESSING del tenant
    // en una sola llamada (loop sin LIMIT 1), por lo que un sweep basta para
    // huérfanos múltiples del mismo día.
    const r = await buildDailySummary(db, {
      tenantId,
      summaryDate: input.summaryDate,
      nowMs: input.nowMs,
      ...(input.cdr ? { cdr: input.cdr } : {}),
      ...(input.signer ? { signer: input.signer } : {}),
    });
    results.push({
      tenantId,
      status: r.status,
      ...(r.ticketCount !== undefined ? { ticketCount: r.ticketCount } : {}),
    });
  }
  return { summaryDate: input.summaryDate, tenantsWithPending: tenants.length, results };
}
