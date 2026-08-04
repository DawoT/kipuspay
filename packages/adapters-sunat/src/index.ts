import type { CdrEnvelope } from '@kipuspay/domain-fiscal-pe';

export interface SunatSendTicket {
  readonly cdr: CdrEnvelope;
  readonly httpStatus: number;
}

export type SunatOutcome =
  | { readonly kind: 'accepted'; readonly cdr: CdrEnvelope }
  | { readonly kind: 'rejected'; readonly cdr: CdrEnvelope }
  | { readonly kind: 'unreachable' };

export function classifySunatResponse(ticket: SunatSendTicket): SunatOutcome {
  if (ticket.httpStatus !== 200) {
    return { kind: 'unreachable' };
  }
  if (ticket.cdr.accepted) {
    return { kind: 'accepted', cdr: ticket.cdr };
  }
  return { kind: 'rejected', cdr: ticket.cdr };
}

export {
  applyCdrToSaleStatus,
  createMockPseTransport,
  type FiscalSubmitRequest,
  type FiscalTransport,
  type FiscalTransportMode,
} from './fiscal-transport.js';
