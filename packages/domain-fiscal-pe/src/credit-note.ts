/**
 * NC/ND guards — Arquitectura §8 / Sprint 5 E-A / E-B.
 */

export type OriginSunatStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'QUARANTINED'
  | 'DEADLINE_EXCEEDED'
  | 'NOT_APPLICABLE';

export interface CreditNoteOrigin {
  readonly saleId: string;
  readonly documentType: string;
  readonly sunatStatus: OriginSunatStatus;
  readonly totalAmountCents: number;
  readonly residualCents: number;
}

export interface CreditNoteRequest {
  readonly motiveCode: string; // Cat. 09
  readonly amountCents: number;
  readonly fullCancellation: boolean;
  readonly items: readonly {
    readonly productId: string;
    readonly quantity: number;
    readonly isUncatalogued: boolean;
  }[];
}

const NO_CDR_STATUSES: ReadonlySet<OriginSunatStatus> = new Set([
  'REJECTED',
  'QUARANTINED',
  'DEADLINE_EXCEEDED',
]);

export function assertCreditNoteAllowed(
  origin: CreditNoteOrigin,
  request: CreditNoteRequest,
): { requiresNoCdrAudit: boolean } {
  if (origin.documentType === 'NV' || origin.documentType === 'NV_RETURN') {
    throw new Error('NV_USES_NV_RETURN_NOT_NC');
  }
  if (origin.sunatStatus === 'PENDING' || origin.sunatStatus === 'PROCESSING') {
    throw new Error('FISCAL_CDR_REQUIRED');
  }

  const noCdr = NO_CDR_STATUSES.has(origin.sunatStatus);
  if (!noCdr && origin.sunatStatus !== 'ACCEPTED') {
    throw new Error('FISCAL_CDR_REQUIRED');
  }
  if (noCdr && !request.fullCancellation) {
    throw new Error('EA_REQUIRES_FULL_CANCELLATION');
  }
  if (request.amountCents <= 0) throw new Error('INVALID_NC_AMOUNT');
  if (request.amountCents > origin.residualCents) throw new Error('NC_EXCEEDS_RESIDUAL');

  return { requiresNoCdrAudit: noCdr };
}

/** E-B: ítems uncatalogued no restauran stock. */
export function stockRestoreQuantity(item: {
  readonly quantity: number;
  readonly isUncatalogued: boolean;
}): number {
  return item.isUncatalogued ? 0 : item.quantity;
}
