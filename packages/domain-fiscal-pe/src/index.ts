export type FormalizationMode = 'pse' | 'contingencia';

export interface CdrEnvelope {
  readonly cdrCode: string;
  readonly cdrDescription: string;
  readonly accepted: boolean;
}

export interface InvoiceDescriptor {
  readonly issuerRuc: string;
  readonly series: string;
  readonly correlative: number;
}

export function cdrIsAccepted(cdr: CdrEnvelope): boolean {
  return cdr.accepted && cdr.cdrCode === '0';
}

export function formalizeDescriptor(descriptor: InvoiceDescriptor): string {
  return `${descriptor.series}-${String(descriptor.correlative).padStart(8, '0')}`;
}
