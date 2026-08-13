/**
 * Cobro offline-first: valida guards → encola → feedback inmediato (cero spinner red).
 */
import {
  assertEmissionAllowed,
  formalizationBannerMessage,
  suggestDocumentType,
  type FormalizationMode,
  type TaxRegime,
} from '@kipuspay/domain-fiscal-pe';
import type { OfflineSalePayload } from '@kipuspay/domain-sales';
import type { OfflineQueueStore } from '../offline-sync/offline-queue.js';
import { cartTotalCents, type CartLine } from './cart.js';

export interface ChargeContext {
  readonly formalizationMode: FormalizationMode;
  readonly taxRegime: TaxRegime;
  readonly branchId: string;
  readonly cashRegisterSessionId: string;
  readonly series: string;
  readonly clientDocumentType: string;
  readonly clientDocumentNumber: string;
  readonly clientName: string;
  readonly paymentMethodId: string;
  readonly documentTypeOverride?: 'NV' | 'NV_RETURN' | '01' | '03' | undefined;
  /** §5.4 edge 2B: MANUAL cuando offline + wallet sin red. */
  readonly captureStatus?: 'API' | 'MANUAL' | undefined;
  /** Sprint 37: atribución vendedor (opcional). */
  readonly sellerId?: string | undefined;
  /** Backlog v10 P2: propina del cobro (sin IGV; server valida el tope). */
  readonly tipCents?: number | undefined;
}

export interface ChargeResult {
  readonly ok: true;
  readonly offlineSaleId: string;
  readonly documentType: string;
  readonly totalCents: number;
  readonly feedbackMs: number;
  readonly banner: string;
}

/** Umbral SUNAT: boleta ≥ S/ 700 exige identidad del cliente (catálogo 07). */
export const BOLETA_ID_THRESHOLD_CENTS = 70_000;

/**
 * S7-H1: ¿el cobro exige identidad del cliente? True para boleta/CPE de
 * consumidor ≥ S/ 700 con documento o nombre faltantes. La UI muestra el aviso
 * y el guard del servidor bloquea (BOLETA_ID_REQUIRED) — nunca inventar dummy.
 */
export function requiresCustomerIdentity(
  totalCents: number,
  clientDocumentNumber: string,
  clientName: string,
): boolean {
  return (
    totalCents >= BOLETA_ID_THRESHOLD_CENTS && (!clientDocumentNumber.trim() || !clientName.trim())
  );
}

export interface ChargeBlocked {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
  readonly feedbackMs: number;
}

export type ChargeOutcome = ChargeResult | ChargeBlocked;

function guardMessage(code: string): string {
  if (code === 'BOLETA_ID_REQUIRED') {
    return 'Boleta ≥ S/ 700 requiere DNI/CE y nombre del cliente.';
  }
  if (code === 'CPE_BLOCKED_INTERNAL_CONTROL') {
    return 'En control interno solo puedes emitir NV.';
  }
  if (code === 'FACTURA_REQUIRES_RUC') {
    return 'Factura requiere RUC de 11 dígitos.';
  }
  return code;
}

/**
 * P2: línea de pago con propina opcional (monto = venta + propina; el servidor
 * valida el tope). Puro.
 */
function buildPaymentLine(
  ctx: ChargeContext,
  totalCents: number,
): { paymentMethodId: string; amountCents: number; captureStatus?: string; tipCents?: number } {
  const tip = ctx.tipCents ?? 0;
  return {
    paymentMethodId: ctx.paymentMethodId,
    amountCents: totalCents + tip,
    ...(ctx.captureStatus ? { captureStatus: ctx.captureStatus } : {}),
    ...(tip > 0 ? { tipCents: tip } : {}),
  };
}

export async function chargeCartOffline(
  lines: readonly CartLine[],
  ctx: ChargeContext,
  queue: OfflineQueueStore,
  _nowMs: number = Date.now(),
  idFactory: () => string = () => crypto.randomUUID(),
): Promise<ChargeOutcome> {
  void _nowMs;
  const started = performance.now();
  const totalCents = cartTotalCents(lines);
  if (lines.length === 0 || totalCents <= 0) {
    return {
      ok: false,
      code: 'EMPTY_CART',
      message: 'Agrega productos antes de cobrar.',
      feedbackMs: performance.now() - started,
    };
  }

  const documentType =
    ctx.documentTypeOverride ??
    suggestDocumentType({
      formalizationMode: ctx.formalizationMode,
      taxRegime: ctx.taxRegime,
      clientDocumentType: ctx.clientDocumentType,
      clientDocumentNumber: ctx.clientDocumentNumber,
    });

  try {
    assertEmissionAllowed({
      formalizationMode: ctx.formalizationMode,
      taxRegime: ctx.taxRegime,
      documentType,
      totalAmountCents: totalCents,
      clientDocumentType: ctx.clientDocumentType,
      clientDocumentNumber: ctx.clientDocumentNumber,
      clientName: ctx.clientName,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'EMISSION_BLOCKED';
    return {
      ok: false,
      code,
      message: guardMessage(code),
      feedbackMs: performance.now() - started,
    };
  }

  const offlineSaleId = idFactory();
  const payload: OfflineSalePayload = {
    offlineSaleId,
    branchId: ctx.branchId,
    cashRegisterSessionId: ctx.cashRegisterSessionId,
    documentType,
    series: ctx.series,
    clientDocumentType: ctx.clientDocumentType || '1',
    clientDocumentNumber: ctx.clientDocumentNumber || '00000000',
    clientName: ctx.clientName || 'Cliente',
    items: lines.map((l) => ({
      productId: l.productId,
      ...(l.isUncatalogued ? { isUncatalogued: true, manualPriceCents: l.manualPriceCents } : {}),
      ...(l.saleItemId ? { saleItemId: l.saleItemId } : {}),
      ...(l.weightMeasurement ? { weightMeasurement: l.weightMeasurement } : {}),
      ...(l.uomId && l.enteredQuantityMicrounits !== undefined
        ? { uomId: l.uomId, enteredQuantityMicrounits: l.enteredQuantityMicrounits }
        : l.weightMeasurement
          ? {}
          : { quantity: l.quantity }),
      ...(l.promotionIds?.length ? { promotionIds: l.promotionIds } : {}),
      ...(l.serialId && l.serialLeaseToken
        ? { serialId: l.serialId, serialLeaseToken: l.serialLeaseToken }
        : {}),
    })),
    payments: [buildPaymentLine(ctx, totalCents)],
    ...(ctx.sellerId?.trim() ? { sellerId: ctx.sellerId.trim() } : {}),
  };

  await queue.enqueue(payload);
  const feedbackMs = performance.now() - started;
  return {
    ok: true,
    offlineSaleId,
    documentType,
    totalCents,
    feedbackMs,
    banner: formalizationBannerMessage(ctx.formalizationMode),
  };
}

export function p95(samples: readonly number[]): number {
  if (samples.length === 0) return Infinity;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[idx] ?? Infinity;
}
