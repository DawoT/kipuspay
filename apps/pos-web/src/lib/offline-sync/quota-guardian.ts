/**
 * Guardián de cuota IndexedDB — alerta ≥80%, bloqueo al 100% (Arquitectura §7.5).
 * Puro: sin dependencia npm; el adaptador inyecta estimate.
 */

export const QUOTA_ALERT_RATIO = 0.8;
export const QUOTA_BLOCK_RATIO = 1.0;

export type QuotaLevel = 'OK' | 'ALERT' | 'BLOCKED';

export interface QuotaEstimate {
  readonly usage: number;
  readonly quota: number;
}

export interface QuotaVerdict {
  readonly level: QuotaLevel;
  readonly usageRatio: number;
  readonly canEnqueue: boolean;
  readonly message: string;
}

export function evaluateQuota(estimate: QuotaEstimate): QuotaVerdict {
  if (estimate.quota <= 0) {
    return {
      level: 'OK',
      usageRatio: 0,
      canEnqueue: true,
      message: 'Cuota desconocida; se permite encolar con precaución.',
    };
  }
  const usageRatio = estimate.usage / estimate.quota;
  if (usageRatio >= QUOTA_BLOCK_RATIO) {
    return {
      level: 'BLOCKED',
      usageRatio,
      canEnqueue: false,
      message:
        'Almacenamiento local lleno. Libera espacio o reconéctate para sincronizar antes de cobrar offline.',
    };
  }
  if (usageRatio >= QUOTA_ALERT_RATIO) {
    return {
      level: 'ALERT',
      usageRatio,
      canEnqueue: true,
      message:
        'Almacenamiento local ≥80%. Sincroniza pronto para evitar bloqueo de cobros offline.',
    };
  }
  return {
    level: 'OK',
    usageRatio,
    canEnqueue: true,
    message: '',
  };
}
