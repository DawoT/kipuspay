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

/** Adquirente o usuario (RS 097-2012 anexo 2): denominación + documento. */
export interface TicketBuyer {
  readonly name?: string | undefined;
  /** Catálogo 06: '1' DNI, '4' RUC, '6' pasaporte, '7' carné de extranjería. */
  readonly docType?: string | undefined;
  readonly docNumber?: string | undefined;
}

export interface TicketData {
  readonly enterprise: string;
  /** RUC del tenant; ausente en NV/control interno donde aún no aplica RUC fiscal. */
  readonly ruc?: string | undefined;
  readonly documentType: string;
  readonly series: string;
  readonly number: number;
  readonly totalCents: number;
  readonly items: readonly TicketItem[];
  /** Hash UBL / digest (CPE); vacío en NV. */
  readonly digestValue?: string | undefined;
  /** Payload QR fiscal (texto); vacío en NV. */
  readonly qrPayload?: string | undefined;
  /** H2 (auditoría 0031): fecha de emisión ISO yyyy-mm-dd (CPE). */
  readonly issueDateIso?: string | undefined;
  /** H2: sumatoria IGV en cents (desglose obligatorio en representación CPE). */
  readonly igvCents?: number | undefined;
  /** H2: adquirente o usuario (denominación + documento). */
  readonly buyer?: TicketBuyer | undefined;
  readonly lineWidth: number;
  /** Backlog v10 P2: propina del cobro (línea informativa, sin IGV). */
  readonly tipCents?: number | undefined;
  /** Pie de marca KipusPay (GTM §7.2 / ADR-0009); nunca antes de leyendas fiscales. */
  readonly brandFooter?: TicketBrandFooter | undefined;
}
