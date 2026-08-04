/**
 * Alertas Modo Dueño — T-24h / T-6h / DEADLINE_EXCEEDED + sugerencia NC E-A.
 */

import type { DeadlineAlertKind } from './deadlines.js';

export interface OwnerAlertPayload {
  readonly alertKind: DeadlineAlertKind;
  readonly saleId: string;
  readonly documentType: string;
  readonly mustSubmitByIso: string;
  readonly suggestCreditNoteEa: boolean;
  readonly message: string;
}

export function buildOwnerAlert(input: {
  readonly alertKind: DeadlineAlertKind;
  readonly saleId: string;
  readonly documentType: string;
  readonly mustSubmitByIso: string;
}): OwnerAlertPayload {
  const suggest = input.alertKind === 'DEADLINE_EXCEEDED';
  const message =
    input.alertKind === 'DEADLINE_EXCEEDED'
      ? `CPE ${input.saleId} venció plazo. Sugerencia: NC anulación sin CDR (E-A).`
      : input.alertKind === 'T6H'
        ? `CPE ${input.saleId}: quedan ≤6h para envío SUNAT.`
        : `CPE ${input.saleId}: quedan ≤24h para envío SUNAT.`;
  return {
    alertKind: input.alertKind,
    saleId: input.saleId,
    documentType: input.documentType,
    mustSubmitByIso: input.mustSubmitByIso,
    suggestCreditNoteEa: suggest,
    message,
  };
}

/** CA: 0 vencimiento silencioso — toda acción deadline produce alerta. */
export function requiresOwnerAlert(alertKind: DeadlineAlertKind): true {
  void alertKind;
  return true;
}
