/**
 * Reserva tentativa de correlativo offline — server autoritativo (SEC-05/SYN-02).
 */
export interface CorrelativeReserve {
  readonly offlineSaleId: string;
  readonly series: string;
  readonly tentativeNumber: number;
  readonly reservedAtMs: number;
}

export interface CorrelativeAck {
  readonly offlineSaleId: string;
  readonly status: 'SUCCESS' | 'ALREADY_SYNCED' | 'FAILED';
  readonly authoritativeNumber?: number | undefined;
}

export class OfflineCorrelativeStore {
  private readonly bySale = new Map<string, CorrelativeReserve>();
  private nextTentative: number;

  constructor(startAt: number = 1) {
    this.nextTentative = startAt;
  }

  reserve(offlineSaleId: string, series: string, nowMs: number = Date.now()): CorrelativeReserve {
    const existing = this.bySale.get(offlineSaleId);
    if (existing) return existing;
    const row: CorrelativeReserve = {
      offlineSaleId,
      series,
      tentativeNumber: this.nextTentative,
      reservedAtMs: nowMs,
    };
    this.nextTentative += 1;
    this.bySale.set(offlineSaleId, row);
    return row;
  }

  get(offlineSaleId: string): CorrelativeReserve | undefined {
    return this.bySale.get(offlineSaleId);
  }

  /**
   * Confirma número autoritativo del server; si diverge de la reserva, fail-closed
   * (borra reserva local — la venta ya está en server; UI debe mostrar número server).
   */
  reconcile(ack: CorrelativeAck): {
    readonly ok: boolean;
    readonly code?: string;
    readonly authoritativeNumber?: number;
  } {
    const local = this.bySale.get(ack.offlineSaleId);
    if (ack.status === 'FAILED') {
      return { ok: false, code: 'SYNC_FAILED' };
    }
    if (ack.authoritativeNumber === undefined) {
      this.bySale.delete(ack.offlineSaleId);
      return { ok: true };
    }
    if (local && local.tentativeNumber !== ack.authoritativeNumber) {
      this.bySale.delete(ack.offlineSaleId);
      return {
        ok: true,
        code: 'SERVER_NUMBER_WINS',
        authoritativeNumber: ack.authoritativeNumber,
      };
    }
    this.bySale.delete(ack.offlineSaleId);
    return { ok: true, authoritativeNumber: ack.authoritativeNumber };
  }
}
