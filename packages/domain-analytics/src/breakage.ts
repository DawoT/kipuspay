/**
 * Detección de quiebre (ADR-0030, Arquitectura §5.3 regla 31).
 * Compara el pronóstico de demanda diaria con el stock disponible y el lead time
 * para emitir una SUGERENCIA de reposición. Nunca ejecuta acciones automáticas de
 * precio/stock: la salida es un consejo que el Dueño decide aplicar.
 */

export interface BreakageInput {
  /** Pronóstico de demanda diaria (cantidad por día). */
  readonly predictedDailyQty: number;
  /** Stock disponible actual (cantidad). */
  readonly stockAvailable: number;
  /** Días que tarda la reposición en llegar. */
  readonly leadTimeDays: number;
  /** Días de stock de seguridad recomendados (política del tenant). */
  readonly safetyStockDays: number;
}

export type BreakageStatus = 'OK' | 'REORDER_SUGGESTED' | 'STOCKOUT_RISK';

export interface BreakageResult {
  readonly status: BreakageStatus;
  /** Días estimados de cobertura con el stock actual. */
  readonly daysCovered: number;
  /** Cantidad sugerida de reposición; 0 si no aplica. */
  readonly suggestedReorderQty: number;
  /** Días objetivo (lead time + stock de seguridad). */
  readonly targetDays: number;
}

function positive(value: number): number {
  return value < 0 ? 0 : value;
}

/**
 * Evalúa el riesgo de quiebre. Si la demanda diaria es <= 0 no hay consumo y la
 * respuesta es OK sin sugerencia. El stock disponible incluye el de seguridad, por
 * lo que la sugerencia repone hasta cubrir leadTime + safetyStock días.
 */
export function detectBreakage(input: BreakageInput): BreakageResult {
  const targetDays = positive(input.leadTimeDays) + positive(input.safetyStockDays);
  if (input.predictedDailyQty <= 0) {
    return {
      status: 'OK',
      daysCovered: Number.POSITIVE_INFINITY,
      suggestedReorderQty: 0,
      targetDays,
    };
  }
  const daysCovered = positive(input.stockAvailable) / input.predictedDailyQty;

  if (daysCovered < targetDays) {
    if (input.stockAvailable <= 0) {
      return { status: 'STOCKOUT_RISK', daysCovered, suggestedReorderQty: 0, targetDays };
    }
    const needed = targetDays * input.predictedDailyQty;
    const suggested = Math.ceil(needed - input.stockAvailable);
    return {
      status: 'REORDER_SUGGESTED',
      daysCovered,
      suggestedReorderQty: positive(suggested),
      targetDays,
    };
  }

  return { status: 'OK', daysCovered, suggestedReorderQty: 0, targetDays };
}
