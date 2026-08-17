/** Copy de caja en español de negocio (GTM §6.5, V-27). Cero enums al cajero. */

export type ScaleUiState =
  'CONNECTING' | 'STABLE' | 'UNSTABLE' | 'STALE' | 'MANUAL_REQUIRED' | 'DISCONNECTED';

export function scaleStateLabel(state: ScaleUiState): string {
  switch (state) {
    case 'CONNECTING':
      return 'Conectando';
    case 'STABLE':
      return 'Lista';
    case 'UNSTABLE':
      return 'Inestable';
    case 'STALE':
      return 'Sin lectura';
    case 'MANUAL_REQUIRED':
      return 'Peso manual';
    case 'DISCONNECTED':
      return 'Desconectada';
    default: {
      const exhausted: never = state;
      return exhausted;
    }
  }
}

export function cashierFacingMessage(raw: string): string {
  if (raw.includes('SERIAL_LEASED_BY_OTHER_TERMINAL')) {
    return 'Esa serie ya está reservada en otro terminal. Libérala ahí o escanea otra.';
  }
  if (raw.includes('SERIAL_')) {
    return 'No se pudo reservar esa serie. Verifica el código e inténtalo de nuevo.';
  }
  return raw;
}

export function chargeButtonLabel(payableCentsLabel: string): string {
  return `Cobrar (S/ ${payableCentsLabel})`;
}
