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
}

export interface ChargeResult {
  readonly ok: true;
  readonly offlineSaleId: string;
  readonly documentType: string;
  readonly totalCents: number;
  readonly feedbackMs: number;
  readonly banner: string;
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
    items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
    payments: [{ paymentMethodId: ctx.paymentMethodId, amountCents: totalCents }],
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
