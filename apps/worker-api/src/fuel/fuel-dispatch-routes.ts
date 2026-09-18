import {
  buildIslandShiftReport,
  calculateFuelDispatch,
  type IslandDispatchFact,
  type FuelDispatchCommand,
} from '@kipuspay/domain-fuel';
import { processOfflineSaleAtomic } from '@kipuspay/adapters-d1';
import type { OfflineSalePayload } from '@kipuspay/domain-sales';
import type { WorkerEnv } from '../auth/control-plane.js';
import { CapabilityError, CapabilityResolver } from '../capabilities/capability-resolver.js';

export interface FuelDispatchActor {
  readonly tenantId: string;
  readonly userId: string;
  readonly role: string;
}

export interface FuelDispatchHttpResult {
  readonly status: 200 | 201 | 400 | 403 | 404 | 409 | 422 | 503;
  readonly body: Record<string, unknown>;
}

export interface FuelCatalogItem {
  readonly code: string;
  readonly name: string;
  readonly priceCentsPerGallon: number;
  readonly igvRateBps: number;
  readonly detractionRateBps: number;
}

interface FuelCatalogRow {
  readonly code: string;
  readonly name?: string;
  readonly price_cents_per_gallon: number;
  readonly igv_rate_bps: number;
  readonly detraction_rate_bps: number;
  readonly stock_microunits: number;
}

function catalogItem(row: FuelCatalogRow & { readonly name?: string }): FuelCatalogItem | null {
  if (
    typeof row.code !== 'string' ||
    typeof row.name !== 'string' ||
    !Number.isSafeInteger(row.price_cents_per_gallon) ||
    row.price_cents_per_gallon <= 0 ||
    !Number.isSafeInteger(row.igv_rate_bps) ||
    row.igv_rate_bps < 0 ||
    !Number.isSafeInteger(row.detraction_rate_bps) ||
    row.detraction_rate_bps < 0
  ) {
    return null;
  }
  return {
    code: row.code,
    name: row.name,
    priceCentsPerGallon: row.price_cents_per_gallon,
    igvRateBps: row.igv_rate_bps,
    detractionRateBps: row.detraction_rate_bps,
  };
}

interface FuelDispatchBody {
  readonly dispatchId?: unknown;
  readonly idempotencyKey?: unknown;
  readonly fuelCode?: unknown;
  readonly volumeMicrounits?: unknown;
  readonly businessInvoice?: unknown;
  readonly documentType?: unknown;
  readonly islandId?: unknown;
  readonly nozzleId?: unknown;
  readonly paymentMethod?: unknown;
  readonly branchId?: unknown;
  readonly cashRegisterSessionId?: unknown;
  readonly series?: unknown;
  readonly clientDocumentType?: unknown;
  readonly clientDocumentNumber?: unknown;
  readonly clientName?: unknown;
  readonly plate?: unknown;
  readonly fleetId?: unknown;
  readonly meterReadingMicrounits?: unknown;
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const OPERATIONAL_ROLES = new Set(['cashier', 'supervisor', 'admin', 'owner']);

function invalid(body: Record<string, unknown>): FuelDispatchHttpResult {
  return { status: 400, body };
}

// eslint-disable-next-line complexity -- strict command shape validation
function readBody(body: FuelDispatchBody):
  | {
      ok: true;
      dispatchId: string;
      idempotencyKey: string;
      fuelCode: string;
      volumeMicrounits: number;
      businessInvoice: boolean;
      documentType: string;
      islandId: string;
      nozzleId: string;
      paymentMethod: string;
      branchId: string;
      cashRegisterSessionId: string;
      series: string;
      clientDocumentType: string;
      clientDocumentNumber: string;
      clientName: string;
      plate: string;
      fleetId: string;
      meterReadingMicrounits: number | null;
    }
  | { ok: false; result: FuelDispatchHttpResult } {
  const dispatchId = text(body.dispatchId);
  const idempotencyKey = text(body.idempotencyKey);
  const fuelCode = text(body.fuelCode);
  const documentType = text(body.documentType);
  const islandId = text(body.islandId);
  const nozzleId = text(body.nozzleId);
  const paymentMethod = text(body.paymentMethod);
  const branchId = text(body.branchId);
  const cashRegisterSessionId = text(body.cashRegisterSessionId);
  const series = text(body.series);
  const clientDocumentType = text(body.clientDocumentType);
  const clientDocumentNumber = text(body.clientDocumentNumber);
  const clientName = text(body.clientName) || '[ANONYMIZED]';
  const plate = text(body.plate);
  const fleetId = text(body.fleetId);
  const meterReadingMicrounits = body.meterReadingMicrounits;
  const volumeMicrounits = body.volumeMicrounits;
  if (
    !dispatchId ||
    !idempotencyKey ||
    !fuelCode ||
    !documentType ||
    !islandId ||
    !nozzleId ||
    !paymentMethod ||
    typeof volumeMicrounits !== 'number' ||
    !Number.isSafeInteger(volumeMicrounits) ||
    volumeMicrounits <= 0 ||
    typeof body.businessInvoice !== 'boolean' ||
    (meterReadingMicrounits !== undefined &&
      (typeof meterReadingMicrounits !== 'number' ||
        !Number.isSafeInteger(meterReadingMicrounits) ||
        meterReadingMicrounits < 0))
  ) {
    return { ok: false, result: invalid({ code: 'INVALID_FUEL_DISPATCH' }) };
  }
  return {
    ok: true,
    dispatchId,
    idempotencyKey,
    fuelCode,
    volumeMicrounits,
    businessInvoice: body.businessInvoice,
    documentType,
    islandId,
    nozzleId,
    paymentMethod,
    branchId,
    cashRegisterSessionId,
    series,
    clientDocumentType,
    clientDocumentNumber,
    clientName,
    plate,
    fleetId,
    meterReadingMicrounits: meterReadingMicrounits === undefined ? null : meterReadingMicrounits,
  };
}

// eslint-disable-next-line complexity -- ACID dispatch validation and idempotency branches
export async function runCreateFuelDispatchHttp(
  env: WorkerEnv,
  actor: FuelDispatchActor,
  body: FuelDispatchBody,
): Promise<FuelDispatchHttpResult> {
  const parsed = readBody(body);
  if (!parsed.ok) return parsed.result;
  if (!env.DB || !actor.tenantId || !actor.userId) {
    return { status: 503, body: { code: 'DB_UNAVAILABLE' } };
  }
  if (!OPERATIONAL_ROLES.has(actor.role.toLowerCase())) {
    return { status: 403, body: { code: 'FORBIDDEN' } };
  }
  try {
    const capability = await new CapabilityResolver(env).require(actor.tenantId, 'fuel.dispatch');
    // Fuel dispatch is a checkout mutation, not a parallel sales engine.
    // Keep the common POS checkout capability authoritative for the ACID sale.
    await new CapabilityResolver(env).require(actor.tenantId, 'pos.checkout');
    // El despacho usa la línea manual del pipeline común; no puede abrir un
    // motor de ventas paralelo ni saltarse su capability de precio explícito.
    await new CapabilityResolver(env).require(actor.tenantId, 'sales.quick_line');
    const existing = await env.DB.prepare(
      `SELECT dispatch_id, sale_id, total_cents, detraction_cents, volume_microunits
         FROM fuel_dispatches WHERE tenant_id = ? AND idempotency_key = ? LIMIT 1`,
    )
      .bind(actor.tenantId, parsed.idempotencyKey)
      .first<{
        dispatch_id: string;
        sale_id: string;
        total_cents: number;
        detraction_cents: number;
        volume_microunits: number;
      }>();
    if (existing) {
      return {
        status: 200,
        body: {
          replayed: true,
          dispatchId: existing.dispatch_id,
          saleId: existing.sale_id,
          totalCents: existing.total_cents,
          detractionCents: existing.detraction_cents,
          volumeMicrounits: existing.volume_microunits,
        },
      };
    }
    let catalog = await env.DB.prepare(
      `SELECT code, price_cents_per_gallon, igv_rate_bps, detraction_rate_bps, stock_microunits
         FROM fuel_catalog WHERE tenant_id = ? AND code = ? AND active = 1 LIMIT 1`,
    )
      .bind(actor.tenantId, parsed.fuelCode)
      .first<FuelCatalogRow>();
    if (!catalog) {
      const config = capability.config;
      const price = config.priceCentsPerGallon;
      const igvRate = config.igvRateBps;
      const detractionRate = config.detractionRateBps;
      const stockMicrounits = config.stockMicrounits;
      if (
        typeof price !== 'number' ||
        typeof igvRate !== 'number' ||
        typeof detractionRate !== 'number' ||
        typeof stockMicrounits !== 'number' ||
        !Number.isSafeInteger(stockMicrounits) ||
        stockMicrounits < 0
      ) {
        return { status: 422, body: { code: 'FUEL_STOCK_NOT_CONFIGURED' } };
      }
      catalog = {
        code: parsed.fuelCode,
        price_cents_per_gallon: price,
        igv_rate_bps: igvRate,
        detraction_rate_bps: detractionRate,
        stock_microunits: stockMicrounits,
      };
    }
    const selectedCatalog = catalog;
    if (!selectedCatalog) return { status: 404, body: { code: 'FUEL_CATALOG_NOT_FOUND' } };
    const command: FuelDispatchCommand = {
      fuelCode: selectedCatalog.code,
      volumeMicrounits: parsed.volumeMicrounits,
      priceCentsPerGallon: selectedCatalog.price_cents_per_gallon,
      igvRateBps: selectedCatalog.igv_rate_bps,
      detractionRateBps: selectedCatalog.detraction_rate_bps,
      businessInvoice: parsed.businessInvoice,
      documentType: parsed.documentType,
    };
    const result = calculateFuelDispatch(command);
    const createdAt = new Date().toISOString();
    if (!parsed.branchId && !parsed.cashRegisterSessionId) {
      // A confirmed pump dispatch is a sale: without both references there is
      // no ACID cash/invoice context in which to persist or deduct stock.
      return { status: 422, body: { code: 'FUEL_SALE_CONTEXT_REQUIRED' } };
    }
    if (parsed.branchId || parsed.cashRegisterSessionId) {
      if (!parsed.branchId || !parsed.cashRegisterSessionId) {
        return { status: 422, body: { code: 'FUEL_SALE_CONTEXT_REQUIRED' } };
      }
      const series =
        parsed.series ||
        (
          await env.DB.prepare(
            `SELECT series FROM branch_document_series
           WHERE tenant_id = ? AND branch_id = ? AND document_type_code = ?
           ORDER BY id LIMIT 1`,
          )
            .bind(actor.tenantId, parsed.branchId, parsed.documentType)
            .first<{ series: string }>()
        )?.series ||
        '';
      if (!series) return { status: 422, body: { code: 'FUEL_SALE_SERIES_NOT_FOUND' } };
      const payment = await env.DB.prepare(
        `SELECT id FROM payment_methods
           WHERE tenant_id = ? AND is_active = 1 AND (id = ? OR code = ?)
           ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END LIMIT 1`,
      )
        .bind(actor.tenantId, parsed.paymentMethod, parsed.paymentMethod, parsed.paymentMethod)
        .first<{ id: string }>();
      if (!payment) return { status: 422, body: { code: 'PAYMENT_METHOD_NOT_FOUND' } };
      if (parsed.businessInvoice && (!parsed.clientDocumentType || !parsed.clientDocumentNumber)) {
        return { status: 422, body: { code: 'FUEL_INVOICE_CUSTOMER_REQUIRED' } };
      }
      const salePayload: OfflineSalePayload = {
        offlineSaleId: parsed.dispatchId,
        branchId: parsed.branchId,
        cashRegisterSessionId: parsed.cashRegisterSessionId,
        documentType:
          parsed.documentType === '01' || parsed.documentType === '03' ? parsed.documentType : 'NV',
        series,
        clientDocumentType: parsed.clientDocumentType || '0',
        clientDocumentNumber: parsed.clientDocumentNumber || '00000000',
        clientName: parsed.clientName,
        items: [
          {
            productId: '',
            isUncatalogued: true,
            manualPriceCents: result.priceCentsPerGallon,
            quantity: result.volumeMicrounits / 1_000_000,
          },
        ],
        payments: [{ paymentMethodId: payment.id, amountCents: result.totalCents }],
      };
      const sale = await processOfflineSaleAtomic(
        env.DB,
        actor.tenantId,
        actor.userId,
        salePayload,
        {
          skipStockDeduction: true,
          afterSaleStatements: (plan, saleId) => {
            // La configuración de capability puede servir de snapshot inicial,
            // pero el stock operativo debe existir en el catálogo D1 para que la
            // venta y el descuento queden en la misma transacción ACID.
            plan.add(
              env
                .DB!.prepare(
                  `INSERT OR IGNORE INTO fuel_catalog
               (tenant_id, code, name, price_cents_per_gallon, igv_rate_bps,
                detraction_rate_bps, stock_microunits, active)
               VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
                )
                .bind(
                  actor.tenantId,
                  selectedCatalog.code,
                  selectedCatalog.name ?? selectedCatalog.code,
                  selectedCatalog.price_cents_per_gallon,
                  selectedCatalog.igv_rate_bps,
                  selectedCatalog.detraction_rate_bps,
                  selectedCatalog.stock_microunits,
                ),
            );
            plan.add(
              env
                .DB!.prepare(
                  `UPDATE fuel_catalog
               SET stock_microunits = stock_microunits - ?
               WHERE tenant_id = ? AND code = ?
                 AND NOT EXISTS (
                   SELECT 1 FROM fuel_dispatches
                   WHERE tenant_id = ? AND idempotency_key = ?
                 )`,
                )
                .bind(
                  result.volumeMicrounits,
                  actor.tenantId,
                  result.fuelCode,
                  actor.tenantId,
                  parsed.idempotencyKey,
                ),
            );
            plan.add(
              env
                .DB!.prepare(
                  `INSERT OR IGNORE INTO fuel_dispatches
               (dispatch_id, tenant_id, idempotency_key, fuel_code, island_id, nozzle_id,
                plate, fleet_id, meter_reading_microunits, volume_microunits, price_cents_per_gallon, subtotal_cents, igv_cents,
                total_cents, detraction_cents, document_type, business_invoice,
                payment_method, sale_id, actor_user_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                )
                .bind(
                  parsed.dispatchId,
                  actor.tenantId,
                  parsed.idempotencyKey,
                  result.fuelCode,
                  parsed.islandId,
                  parsed.nozzleId,
                  parsed.plate || null,
                  parsed.fleetId || null,
                  parsed.meterReadingMicrounits,
                  result.volumeMicrounits,
                  result.priceCentsPerGallon,
                  result.subtotalCents,
                  result.igvCents,
                  result.totalCents,
                  result.detractionCents,
                  parsed.documentType,
                  parsed.businessInvoice ? 1 : 0,
                  parsed.paymentMethod,
                  saleId,
                  actor.userId,
                  createdAt,
                ),
            );
          },
        },
      );
      return {
        status: 201,
        body: {
          dispatchId: parsed.dispatchId,
          saleId: 'saleId' in sale ? sale.saleId : undefined,
          replayed: false,
          fuelCode: result.fuelCode,
          volumeMicrounits: result.volumeMicrounits,
          priceCentsPerGallon: result.priceCentsPerGallon,
          subtotalCents: result.subtotalCents,
          igvCents: result.igvCents,
          totalCents: result.totalCents,
          detractionCents: result.detractionCents,
          netPayableCents: result.netPayableCents,
        },
      };
    }
    return { status: 422, body: { code: 'FUEL_SALE_CONTEXT_REQUIRED' } };
  } catch (error) {
    if (error instanceof CapabilityError) {
      return { status: error.status === 404 ? 404 : 503, body: { code: error.code } };
    }
    if (error instanceof Error && error.message === 'FUEL_STOCK_INSUFFICIENT') {
      return { status: 422, body: { code: 'FUEL_STOCK_INSUFFICIENT' } };
    }
    return { status: 503, body: { code: 'FUEL_DISPATCH_UNAVAILABLE' } };
  }
}

export async function runFuelIslandShiftReportHttp(
  env: WorkerEnv,
  actor: FuelDispatchActor,
  islandId = '',
  cashRegisterSessionId = '',
): Promise<FuelDispatchHttpResult> {
  if (!env.DB || !actor.tenantId || !actor.userId) {
    return { status: 503, body: { code: 'DB_UNAVAILABLE' } };
  }
  if (!OPERATIONAL_ROLES.has(actor.role.toLowerCase())) {
    return { status: 403, body: { code: 'FORBIDDEN' } };
  }
  try {
    await new CapabilityResolver(env).require(actor.tenantId, 'fuel.island_shift');
    // Shift reporting is consumed by the ordinary blind-Z/handoff workflow;
    // do not expose a parallel cash-close surface for a fuel tenant.
    await new CapabilityResolver(env).require(actor.tenantId, 'cash.blind_z');
    await new CapabilityResolver(env).require(actor.tenantId, 'ops.shift_handoff');
    const rows = await env.DB.prepare(
      `SELECT fd.island_id, fd.nozzle_id, fd.volume_microunits, fd.total_cents,
                fd.payment_method, s.cash_register_session_id
         FROM fuel_dispatches fd
         JOIN sales s ON s.tenant_id = fd.tenant_id AND s.id = fd.sale_id
         WHERE fd.tenant_id = ? AND (? = '' OR fd.island_id = ?)
           AND (? = '' OR s.cash_register_session_id = ?)
         ORDER BY fd.island_id, fd.created_at, fd.dispatch_id`,
    )
      .bind(actor.tenantId, islandId, islandId, cashRegisterSessionId, cashRegisterSessionId)
      .all<{
        island_id: string;
        nozzle_id: string;
        volume_microunits: number;
        total_cents: number;
        payment_method: string;
        cash_register_session_id: string;
      }>();
    const facts: IslandDispatchFact[] = (rows.results ?? []).map((row) => ({
      islandId: row.island_id,
      nozzleId: row.nozzle_id,
      volumeMicrounits: row.volume_microunits,
      totalCents: row.total_cents,
      paymentMethod: row.payment_method,
    }));
    return {
      status: 200,
      body: {
        reports: buildIslandShiftReport(facts),
        cashRegisterSessionIds: [
          ...new Set(
            (rows.results ?? [])
              .map((row) => row.cash_register_session_id)
              .filter((id): id is string => typeof id === 'string' && id.length > 0),
          ),
        ],
      },
    };
  } catch (error) {
    if (error instanceof CapabilityError) {
      return { status: error.status === 404 ? 404 : 503, body: { code: error.code } };
    }
    return { status: 503, body: { code: 'FUEL_REPORT_UNAVAILABLE' } };
  }
}

export async function runFuelCatalogHttp(
  env: WorkerEnv,
  actor: FuelDispatchActor,
): Promise<FuelDispatchHttpResult> {
  if (!env.DB || !actor.tenantId || !actor.userId) {
    return { status: 503, body: { code: 'DB_UNAVAILABLE' } };
  }
  if (!OPERATIONAL_ROLES.has(actor.role.toLowerCase())) {
    return { status: 403, body: { code: 'FORBIDDEN' } };
  }
  try {
    const capability = await new CapabilityResolver(env).require(actor.tenantId, 'fuel.dispatch');
    const rows = await env.DB.prepare(
      `SELECT code, name, price_cents_per_gallon, igv_rate_bps, detraction_rate_bps, stock_microunits
         FROM fuel_catalog WHERE tenant_id = ? AND active = 1 ORDER BY code`,
    )
      .bind(actor.tenantId)
      .all<FuelCatalogRow & { readonly name: string }>();
    const items = (rows.results ?? [])
      .map(catalogItem)
      .filter((item): item is FuelCatalogItem => item !== null);
    if (items.length > 0) return { status: 200, body: { items } };
    const configured = capability.config.catalog;
    if (!Array.isArray(configured))
      return { status: 404, body: { code: 'FUEL_CATALOG_NOT_FOUND' } };
    const snapshot = configured
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const value = item as Record<string, unknown>;
        return catalogItem({
          code: value.code as string,
          name: value.name as string,
          price_cents_per_gallon: value.priceCentsPerGallon as number,
          igv_rate_bps: value.igvRateBps as number,
          detraction_rate_bps: value.detractionRateBps as number,
          stock_microunits: typeof value.stockMicrounits === 'number' ? value.stockMicrounits : 0,
        });
      })
      .filter((item): item is FuelCatalogItem => item !== null);
    return snapshot.length > 0
      ? { status: 200, body: { items: snapshot } }
      : { status: 404, body: { code: 'FUEL_CATALOG_NOT_FOUND' } };
  } catch (error) {
    if (error instanceof CapabilityError) {
      return { status: error.status === 404 ? 404 : 503, body: { code: error.code } };
    }
    return { status: 503, body: { code: 'FUEL_CATALOG_UNAVAILABLE' } };
  }
}
