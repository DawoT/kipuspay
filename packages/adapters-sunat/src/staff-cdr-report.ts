import type { SunatOutcome } from './classify-sunat.js';
import {
  createSunatBillTransport,
  type SunatBillTransportOptions,
} from './sunat-bill-transport.js';
import type { FiscalSubmitRequest } from './fiscal-transport.js';

export interface StaffCdrReport {
  readonly kind: SunatOutcome['kind'];
  readonly cdrCode?: string;
  readonly cdrDescription?: string;
  readonly accepted?: boolean;
}

/** CDR público para staff: nunca incluye SOL, PEM ni pass. */
export function formatStaffSunatOutcome(outcome: SunatOutcome): StaffCdrReport {
  if (outcome.kind === 'unreachable') return { kind: 'unreachable' };
  return {
    kind: outcome.kind,
    cdrCode: outcome.cdr.cdrCode,
    cdrDescription: outcome.cdr.cdrDescription,
    accepted: outcome.cdr.accepted,
  };
}

export async function sendBetaCpeXml(
  xml: string,
  request: Pick<FiscalSubmitRequest, 'documentType' | 'saleId' | 'tenantId'>,
  opts: SunatBillTransportOptions,
): Promise<StaffCdrReport> {
  if (!xml.trim()) return { kind: 'unreachable' };
  const transport = createSunatBillTransport(opts);
  const outcome = await transport.submit({
    tenantId: request.tenantId,
    saleId: request.saleId,
    xml,
    xmlHash: 'staff-send-beta',
    documentType: request.documentType,
  });
  return formatStaffSunatOutcome(outcome);
}
