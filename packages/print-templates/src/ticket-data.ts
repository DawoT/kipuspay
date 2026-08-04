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
  /** Payload QR (texto); vacío en NV. */
  readonly qrPayload?: string | undefined;
  readonly lineWidth: number;
}
