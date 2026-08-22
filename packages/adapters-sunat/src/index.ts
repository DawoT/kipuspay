export {
  classifySunatResponse,
  type SunatOutcome,
  type SunatSendTicket,
} from './classify-sunat.js';

export {
  classifyFiscalError,
  shouldOpenBreaker,
  shouldQuarantine,
  type FiscalErrorClass,
  type FiscalHttpSignal,
} from './fiscal-error.js';

export {
  applyCdrToSaleStatus,
  assertTransportContract,
  createHttpPseTransport,
  createMisconfiguredFiscalTransport,
  createMockPseTransport,
  createOseTransport,
  createPseThirdPartyTransport,
  type FetchLike,
  type FiscalEndpoint,
  type FiscalSubmitRequest,
  type FiscalSubmitResult,
  type FiscalTransport,
  type FiscalTransportMode,
} from './fiscal-transport.js';

export { createHttpRcCdrPort, type HttpRcCdrPortOptions } from './http-rc-cdr-port.js';

export {
  createSunatBillTransport,
  createSunatRcCdrPort,
  SUNAT_BETA_BILL_SERVICE_URL,
  type SunatBillTransportOptions,
} from './sunat-bill-transport.js';
