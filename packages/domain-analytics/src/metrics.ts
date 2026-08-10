/**
 * Métricas de precisión del modelo (ADR-0030, Arquitectura §5.3 regla 31).
 * El MAPE de holdout se publica en la API y en el QG: se entrena con el 80% inicial
 * y se valida con el 20% final; las series sin historial reportan null en vez de
 * inventar una métrica.
 */

/** Separa la serie en entrenamiento (trainRatio) y validación. */
export function holdoutSplit<T>(
  series: readonly T[],
  trainRatio: number,
): { readonly train: readonly T[]; readonly test: readonly T[] } {
  if (trainRatio <= 0 || trainRatio >= 1) {
    throw new RangeError('trainRatio debe estar en (0, 1)');
  }
  const split = Math.max(1, Math.floor(series.length * trainRatio));
  if (split >= series.length) {
    return { train: series, test: [] };
  }
  return { train: series.slice(0, split), test: series.slice(split) };
}

/** MAPE como porcentaje (0-100). Ignora pares donde el actual es 0; null si vacío. */
export function computeMapePercent(
  actual: readonly number[],
  predicted: readonly number[],
): number | null {
  const pairs = actual
    .map((a, i) => ({ a, p: predicted[i] ?? Number.NaN }))
    .filter(({ a, p }) => Number.isFinite(a) && a !== 0 && Number.isFinite(p));
  if (pairs.length === 0) return null;
  const sum = pairs.reduce((acc, { a, p }) => {
    return acc + Math.abs((a - p) / a);
  }, 0);
  return (sum / pairs.length) * 100;
}
