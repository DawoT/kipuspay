/**
 * FiscalTransport — puerto PSE KipusPay (ADR-FISCAL-002 / Sprint 5).
 * Default mock staging: CDR aceptado sin red real. Claim PSE congelado hasta SRE.
 */

import type { CdrEnvelope } from '@kipuspay/domain-fiscal-pe';
import { classifySunatResponse, type SunatOutcome } from './index.js';

export type FiscalTransportMode = 'KIPUSPAY_PSE_DIRECT' | 'MOCK_STAGING';

export interface FiscalSubmitRequest {
  readonly tenantId: string;
  readonly saleId: string;
  readonly xml: string;
  readonly xmlHash: string;
  readonly documentType: '01' | '03' | '07' | '08';
}

export interface FiscalTransport {
  readonly mode: FiscalTransportMode;
  submit(request: FiscalSubmitRequest): Promise<SunatOutcome>;
  queryCdr(ticketId: string): Promise<CdrEnvelope>;
}

/** Mock PSE staging: siempre CDR 0 aceptado si XML no vacío. */
export function createMockPseTransport(): FiscalTransport {
  return {
    mode: 'MOCK_STAGING',
    submit(request) {
      if (!request.xml.trim()) {
        return Promise.resolve({ kind: 'unreachable' });
      }
      const cdr: CdrEnvelope = {
        cdrCode: '0',
        cdrDescription: 'Mock PSE staging accepted',
        accepted: true,
      };
      return Promise.resolve(classifySunatResponse({ httpStatus: 200, cdr }));
    },
    queryCdr(ticketId: string) {
      void ticketId;
      return Promise.resolve({
        cdrCode: '0',
        cdrDescription: 'Mock PSE staging accepted',
        accepted: true,
      });
    },
  };
}

export function applyCdrToSaleStatus(
  outcome: SunatOutcome,
): Promise<'ACCEPTED' | 'REJECTED' | 'QUARANTINED'> {
  if (outcome.kind === 'accepted') return Promise.resolve('ACCEPTED');
  if (outcome.kind === 'rejected') return Promise.resolve('REJECTED');
  return Promise.resolve('QUARANTINED');
}
