/**
 * Canal dual del billService SUNAT (FL-2 / ADR-FISCAL-007).
 * staging → e-beta por defecto; production → SOLO la URL oficial de
 * producción CPE (allowlist exacta). Fail-closed: configuración inválida
 * es error tipado ANTES de encolar o enviar; jamás un placeholder
 * .invalid/example operando como si fuera canal real.
 *
 * URL oficial verificada contra la página pública de servicios web de SUNAT
 * (orientacion.sunat.gob.pe) y el WSDL vivo del endpoint.
 */
import { SUNAT_BETA_BILL_SERVICE_URL } from './sunat-bill-soap.js';

export { SUNAT_BETA_BILL_SERVICE_URL };

export const SUNAT_PRODUCTION_BILL_SERVICE_URL =
  'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService';

export type SunatBillChannel = 'staging' | 'production';

export type SunatChannelErrorCode =
  | 'SUNAT_CHANNEL_INVALID'
  | 'SUNAT_PRODUCTION_ENDPOINT_FORBIDDEN'
  | 'SUNAT_PRODUCTION_PLUGINS_OFF'
  | 'SUNAT_PRODUCTION_SOL_MISSING';

export class SunatChannelError extends Error {
  readonly code: SunatChannelErrorCode;

  constructor(code: SunatChannelErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'SunatChannelError';
    this.code = code;
  }
}

/** Default staging; solo 'staging'|'production' (trim+lowercase). Basura → error tipado. */
export function parseSunatBillChannel(raw: string | undefined): SunatBillChannel {
  const value = raw?.trim().toLowerCase();
  if (!value || value === 'staging') return 'staging';
  if (value === 'production') return 'production';
  throw new SunatChannelError(
    'SUNAT_CHANNEL_INVALID',
    `SUNAT_BILL_CHANNEL invalida: "${raw ?? ''}" (usar staging|production)`,
  );
}

export interface SunatBillEndpointInput {
  readonly channel?: string | undefined;
  readonly endpointUrl?: string | undefined;
}

export interface SunatBillEndpointResolved {
  readonly channel: SunatBillChannel;
  readonly endpointUrl: string;
}

/**
 * Resuelve el endpoint del billService según canal:
 * - staging: override opt-in o e-beta público.
 * - production: la URL oficial EXACTA (con o sin override); cualquier otra
 *   URL (beta, .invalid, example, http, typo) → SUNAT_PRODUCTION_ENDPOINT_FORBIDDEN.
 */
export function resolveSunatBillEndpoint(input: SunatBillEndpointInput): SunatBillEndpointResolved {
  const channel = parseSunatBillChannel(input.channel);
  const override = input.endpointUrl?.trim();
  if (channel === 'staging') {
    return { channel, endpointUrl: override || SUNAT_BETA_BILL_SERVICE_URL };
  }
  const endpointUrl = override || SUNAT_PRODUCTION_BILL_SERVICE_URL;
  if (endpointUrl !== SUNAT_PRODUCTION_BILL_SERVICE_URL) {
    throw new SunatChannelError(
      'SUNAT_PRODUCTION_ENDPOINT_FORBIDDEN',
      `billService de produccion debe ser exactamente ${SUNAT_PRODUCTION_BILL_SERVICE_URL}; recibido "${override}"`,
    );
  }
  return { channel, endpointUrl };
}
