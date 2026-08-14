/**
 * Matriz comparativa de planes — documento maestro Parte I §6 (M5A).
 * Cada fila tiene un plan MÍNIMO; la inclusión es acumulativa hacia arriba.
 * `availability: preparing` = en el catálogo contractual, no live (GTM freeze).
 */

import type { ClaimAvailability, PlanId } from './pricing.js';

export interface PlanMatrixRow {
  readonly area: string;
  readonly summary: string;
  readonly minPlan: PlanId;
  readonly availability?: ClaimAvailability;
}

const ORDER: readonly PlanId[] = ['arranque', 'crece', 'cadena', 'enterprise'];

export const PLAN_MATRIX: readonly PlanMatrixRow[] = [
  {
    area: 'Caja & Cobros',
    summary: 'Cobro con efectivo, tarjeta y billeteras digitales.',
    minPlan: 'arranque',
  },
  {
    area: 'Emisión Fiscal',
    summary: 'Boleta, factura, nota de crédito y débito electrónica, con envío a SUNAT.',
    minPlan: 'arranque',
    availability: 'preparing',
  },
  {
    area: 'Control Interno',
    summary: 'Nota de venta con su leyenda de control interno, sin confundir a SUNAT.',
    minPlan: 'arranque',
  },
  {
    area: 'Hardware',
    summary: 'Tickets 58 y 80 mm, balanza por peso y modo vitrina para tu cliente.',
    minPlan: 'arranque',
  },
  {
    area: 'Alta de Catálogo',
    summary: 'Escáner rápido con cámara (producto nuevo en segundos) y venta rápida genérica.',
    minPlan: 'arranque',
  },
  {
    area: 'Gestión Móvil',
    summary: 'Modo Dueño móvil y reportes desde el celular.',
    minPlan: 'crece',
  },
  {
    area: 'Control de Caja',
    summary: 'Arqueo Z ciego con auditoría, PIN de descuentos y cambio de turno con PIN temporal.',
    minPlan: 'crece',
    availability: 'preparing',
  },
  {
    area: 'Inventario Retail',
    summary: 'Variantes, series y racks por sucursal.',
    minPlan: 'crece',
  },
  {
    area: 'Ventas Avanzadas',
    summary: 'Promociones y tramos, apartados con abonos, comisiones de vendedor y venta por peso.',
    minPlan: 'crece',
  },
  {
    area: 'Restaurantes',
    summary: 'Comandas de cocina (KDS) y división de cuentas, sincronizadas con la caja.',
    minPlan: 'cadena',
    availability: 'preparing',
  },
  {
    area: 'Multi-Local',
    summary: 'Transferencias entre locales y recepción de compras contra factura.',
    minPlan: 'cadena',
  },
  {
    area: 'Integraciones',
    summary: 'Importadores masivos (Bsale, Alegra, CSV), exportación contable y API con webhooks.',
    minPlan: 'cadena',
  },
  {
    area: 'Fidelización',
    summary: 'Puntos, crédito de tienda con vales y cuotas.',
    minPlan: 'cadena',
  },
  {
    area: 'Servicios',
    summary: 'Pedidos con retiro por WhatsApp y membresías con ventas recurrentes.',
    minPlan: 'cadena',
    availability: 'preparing',
  },
  {
    area: 'Analítica & Continuidad',
    summary: 'Analítica predictiva de ventas y quiebres (estimación, no garantía).',
    minPlan: 'cadena',
  },
  {
    area: 'Inteligencia AI',
    summary: 'SLA contractual prioritario (1 hora) cuando la caja no cobra.',
    minPlan: 'enterprise',
  },
] as const;

export function planMatrixAvailability(row: PlanMatrixRow): ClaimAvailability {
  return row.availability ?? 'available';
}

/** True si el plan `plan` incluye la fila cuyo mínimo es `minPlan` (acumulativo). */
export function planMatrixIncluded(minPlan: PlanId, plan: PlanId): boolean {
  return ORDER.indexOf(plan) >= ORDER.indexOf(minPlan);
}

export function planOrder(): readonly PlanId[] {
  return ORDER;
}
