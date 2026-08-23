/**
 * Game Day 001 — núcleo transaccional bajo caos (§13.5, Proceso §6 fila Motor ACID).
 *
 * E1 concurrencia offline: N ventas simultáneas mismo tenant+caja vía el puerto
 * `processOfflineSaleAtomic`; el harness no depende de adapters-d1 (mismo estilo
 * que sprint4-acid / dr-failover): recibe evidencia recolectada y dictamina.
 * Contratos duros que el juez verifica (ninguno negociable):
 *  - cero silencio: cada intento es aceptado o rechazo EXPLÍCITO con error;
 *  - correlativos únicos y contiguos (sin saltos injustificados) por serie;
 *  - totales *_cents exactos por venta exitosa;
 *  - cero escrituras parciales: sales/sale_items/sale_payments/stock/serie/guards
 *    consistentes al cerrar la ráfaga.
 *
 * E2 aborto a mitad de operación: wrapper del puerto D1 lanza tras el k-ésimo
 * statement del plan multi-tabla; el juez exige error explícito y rollback
 * completo (0 filas de esa venta en cualquier tabla, estado previo intacto).
 */

export type ChaosVerdict = 'PASS' | 'FAIL';

export type OfflineSaleOutcome = 'SUCCESS' | 'ALREADY_SYNCED' | 'REJECTED';

export interface OfflineSaleAttemptEvidence {
  readonly offlineSaleId: string;
  readonly outcome: OfflineSaleOutcome;
  /** Rejection/excepción explícita; obligatoria cuando outcome === 'REJECTED'. */
  readonly explicitError: string | null;
  /** sales.number asignado (solo SUCCESS). */
  readonly correlativeNumber: number | null;
  /** authoritativeTotalAmount en cents (solo SUCCESS). */
  readonly totalAmountCents: number | null;
}

export interface OfflineSaleConcurrencyPostState {
  readonly saleRows: number;
  readonly saleItemRows: number;
  readonly salePaymentRows: number;
  readonly stockAfter: number;
  readonly seriesCurrentNumberAfter: number;
  /** atomic_guards residuales del tenant (debe ser 0: guard se auto-borra). */
  readonly residualAtomicGuards: number;
}

export interface OfflineSaleConcurrencyInput {
  readonly attempts: readonly OfflineSaleAttemptEvidence[];
  readonly post: OfflineSaleConcurrencyPostState;
  readonly stockBefore: number;
  readonly seriesCurrentNumberBefore: number;
  readonly qtyPerSale: number;
  readonly itemsPerSale: number;
  readonly expectedTotalCentsPerSale: number;
}

export interface OfflineSaleChaosJudgement {
  readonly verdict: ChaosVerdict;
  readonly successes: number;
  readonly rejections: number;
  readonly failures: readonly string[];
}

function judgeCorrelatives(
  successes: number,
  numbers: readonly number[],
  before: number,
): string[] {
  const failures: string[] = [];
  const unique = new Set(numbers);
  if (unique.size !== numbers.length) failures.push('correlativos_duplicados');
  const expected: number[] = [];
  for (let i = 1; i <= successes; i += 1) expected.push(before + i);
  const sorted = [...numbers].sort((a, b) => a - b);
  if (sorted.some((n, i) => n !== expected[i])) failures.push('correlativos_con_saltos');
  return failures;
}

function attemptFailures(
  attempt: OfflineSaleAttemptEvidence,
  expectedTotalCents: number,
): string[] {
  const failures: string[] = [];
  if (attempt.outcome === 'REJECTED' && !attempt.explicitError?.trim()) {
    failures.push(`silencio:${attempt.offlineSaleId}`);
  }
  if (
    attempt.outcome === 'SUCCESS' &&
    (attempt.correlativeNumber === null || attempt.totalAmountCents === null)
  ) {
    failures.push(`success_sin_evidencia:${attempt.offlineSaleId}`);
  }
  if (attempt.outcome === 'SUCCESS' && attempt.totalAmountCents !== expectedTotalCents) {
    failures.push(`total_inexacto:${attempt.offlineSaleId}`);
  }
  return failures;
}

/** Juez E1 — ráfaga concurrente completa contra evidencia D1 real. */
export function judgeOfflineSaleConcurrency(
  input: OfflineSaleConcurrencyInput,
): OfflineSaleChaosJudgement {
  const failures: string[] = [];
  const successes = input.attempts.filter((a) => a.outcome === 'SUCCESS');
  const numbers = successes.map((a) => a.correlativeNumber).filter((n): n is number => n !== null);

  for (const attempt of input.attempts) {
    failures.push(...attemptFailures(attempt, input.expectedTotalCentsPerSale));
  }

  failures.push(...judgeCorrelatives(successes.length, numbers, input.seriesCurrentNumberBefore));

  const { post } = input;
  if (post.saleRows !== successes.length) failures.push('ventas_parciales_o_fantasma');
  if (post.saleItemRows !== successes.length * input.itemsPerSale) failures.push('items_parciales');
  if (post.salePaymentRows !== successes.length) failures.push('pagos_parciales');
  const expectedStock = input.stockBefore - successes.length * input.qtyPerSale;
  if (post.stockAfter !== expectedStock) failures.push('stock_inconsistente');
  if (post.stockAfter < 0) failures.push('stock_negativo');
  if (post.seriesCurrentNumberAfter !== input.seriesCurrentNumberBefore + successes.length) {
    failures.push('serie_desincronizada');
  }
  if (post.residualAtomicGuards !== 0) failures.push('guards_residuales');

  return {
    verdict: failures.length === 0 ? 'PASS' : 'FAIL',
    successes: successes.length,
    rejections: input.attempts.length - successes.length,
    failures,
  };
}

export interface MidBatchAbortPostCounts {
  readonly sales: number;
  readonly saleItems: number;
  readonly salePayments: number;
  readonly auditEvents: number;
  readonly atomicGuards: number;
}

export interface OfflineSaleMidBatchAbortInput {
  /** Error explícito observado del wrapper (obligatorio no-vacío). */
  readonly threwExplicitError: string | null;
  /** Statements que el puerto recibió en el plan multi-tabla. */
  readonly statementsInPlan: number;
  /** k: el wrapper lanza tras observar el k-ésimo statement (1 ≤ k < plan). */
  readonly abortAfterStatement: number;
  readonly postCounts: MidBatchAbortPostCounts;
  readonly baseline: {
    readonly stockBefore: number;
    readonly seriesCurrentNumberBefore: number;
    readonly auditEventsBefore: number;
  };
  readonly stockAfter: number;
  readonly seriesCurrentNumberAfter: number;
}

/** Juez E2 — aborto a mitad del batch multi-tabla revierte TODO. */
export function judgeOfflineSaleMidBatchAbort(input: OfflineSaleMidBatchAbortInput): ChaosVerdict {
  const failures: string[] = [];
  if (!input.threwExplicitError?.trim()) failures.push('sin_error_explicito');
  if (!(input.abortAfterStatement >= 1 && input.abortAfterStatement < input.statementsInPlan)) {
    failures.push('inyeccion_no_estaba_a_mitad_de_operacion');
  }
  if (input.postCounts.sales !== 0) failures.push('venta_residual_en_sales');
  if (input.postCounts.saleItems !== 0) failures.push('venta_residual_en_sale_items');
  if (input.postCounts.salePayments !== 0) failures.push('venta_residual_en_sale_payments');
  if (input.postCounts.auditEvents !== input.baseline.auditEventsBefore) {
    failures.push('audit_events_mutados');
  }
  if (input.postCounts.atomicGuards !== 0) failures.push('guards_residuales');
  if (input.stockAfter !== input.baseline.stockBefore) failures.push('stock_mutado');
  if (input.seriesCurrentNumberAfter !== input.baseline.seriesCurrentNumberBefore) {
    failures.push('correlativo_consumido_por_operacion_abortada');
  }
  return failures.length === 0 ? 'PASS' : 'FAIL';
}
