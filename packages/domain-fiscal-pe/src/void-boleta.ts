/**
 * Baja de boleta (edge E-C) — solo fiscal; no stock ni caja.
 */

export type VoidStatus = 'NONE' | 'VOID_PENDING_RC' | 'VOIDED';

export interface VoidBoletaContext {
  readonly documentType: string;
  readonly voidStatus: VoidStatus;
  /** Estado del RC del día de emisión (null = aún no hay RC). */
  readonly dailySummaryStatus: string | null;
}

export interface VoidBoletaResult {
  readonly nextVoidStatus: 'VOID_PENDING_RC';
  readonly stockUnchanged: true;
  readonly cashUnchanged: true;
}

/**
 * E-C: si RC del día ya SENT/PROCESSING/ACCEPTED → VOID_AFTER_RC_SENT (422).
 * PENDING local (RC materializado pero no enviado) aún permite baja previa al envío.
 */
export function assertVoidBoletaAllowed(ctx: VoidBoletaContext): VoidBoletaResult {
  if (ctx.documentType !== '03' && ctx.documentType !== '12') {
    throw new Error('VOID_ONLY_BOLETA');
  }
  if (ctx.voidStatus !== 'NONE') {
    throw new Error('VOID_ALREADY_REQUESTED');
  }
  const st = ctx.dailySummaryStatus;
  if (st === 'ACCEPTED' || st === 'PROCESSING' || st === 'DEADLINE_EXCEEDED') {
    throw new Error('VOID_AFTER_RC_SENT');
  }
  return {
    nextVoidStatus: 'VOID_PENDING_RC',
    stockUnchanged: true,
    cashUnchanged: true,
  };
}

/** Tras RC aceptado, marcas VOIDED (informativa en CDR). */
export function markVoidedAfterRc(voidStatus: VoidStatus): VoidStatus {
  if (voidStatus === 'VOID_PENDING_RC') return 'VOIDED';
  return voidStatus;
}
