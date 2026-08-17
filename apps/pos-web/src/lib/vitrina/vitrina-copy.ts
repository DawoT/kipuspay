import type { VitrinaPhase } from './channel';

/** Fase de vitrina en español. Nunca el enum de máquina (GTM §6.4). */

export function vitrinaPhaseLabel(phase: VitrinaPhase): string {
  switch (phase) {
    case 'idle':
      return 'Esperando';
    case 'confirming':
      return 'Confirmando';
    case 'charged':
      return 'Cobrado';
    case 'order_open':
      return 'Comanda abierta';
    case 'order_fired':
      return 'En cocina';
    case 'order_ready':
      return 'Listo';
    case 'order_paid':
      return 'Pagado';
    default: {
      const exhausted: never = phase;
      return exhausted;
    }
  }
}

export function vitrinaHeading(brandLabel: string | undefined): string {
  const name = brandLabel?.trim();
  return name && name.length > 0 ? name : 'Tu compra';
}
