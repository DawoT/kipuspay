/**
 * Etiquetas de estado fiscal para Dueño. Solo ACCEPTED implica CDR.
 * Nunca traduce PENDING/PROCESSING a "aceptada".
 */
const LABELS: Readonly<Record<string, string>> = {
  PENDING: 'Pendiente',
  PROCESSING: 'En envío',
  ACCEPTED: 'Aceptado',
  REJECTED: 'Rechazado',
  QUARANTINED: 'En cuarentena',
  DEADLINE_EXCEEDED: 'Plazo vencido',
  NOT_APPLICABLE: 'No aplica',
};

export function sunatStatusImpliesCdrAccepted(status: string): boolean {
  return status === 'ACCEPTED';
}

export function sunatStatusLabel(status: string): string {
  if (status === 'ACCEPTED') return 'Aceptado';
  return LABELS[status] ?? status;
}
