export interface TicketBrandFooter {
  readonly enabled: boolean;
  readonly label: string;
  readonly shortUrl: string;
  /** Payload QR de marca (texto); distinto del QR fiscal CPE. */
  readonly qrPayload: string;
}

export interface TicketItem {
  readonly name: string;
  readonly qty: number;
  readonly totalCents: number;
}

export interface TicketData {
  readonly enterprise: string;
  readonly ruc: string;
  readonly documentType: string;
  readonly series: string;
  readonly number: number;
  readonly totalCents: number;
  readonly items: readonly TicketItem[];
  /** Hash UBL / digest (CPE); vacío en NV. */
  readonly digestValue?: string | undefined;
  /** Payload QR fiscal (texto); vacío en NV. */
  readonly qrPayload?: string | undefined;
  readonly lineWidth: number;
  /** Backlog v10 P2: propina del cobro (línea informativa, sin IGV). */
  readonly tipCents?: number | undefined;
  /** Pie de marca KipusPay (GTM §7.2 / ADR-0009); nunca antes de leyendas fiscales. */
  readonly brandFooter?: TicketBrandFooter | undefined;
}
