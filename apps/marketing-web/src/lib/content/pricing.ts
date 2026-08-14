/**
 * Planes públicos — GTM §4.1. Cupo Arranque + sobregiro facturable (GTM-04 / Sprint 27).
 */

export type PlanId = 'arranque' | 'crece' | 'cadena' | 'enterprise';

export interface PricingPlan {
  readonly id: PlanId;
  readonly name: string;
  readonly monthlyLabel: string;
  readonly annualLabel: string;
  /** Precio mensual en cents para schema.org (Enterprise: null = sin precio público). */
  readonly monthlyCents: number | null;
  readonly audience: string;
  readonly limits: readonly string[];
  readonly upgradeGates: readonly string[];
  readonly badge?: string;
}

export const PRICING_PLANS: readonly PricingPlan[] = [
  {
    id: 'arranque',
    name: 'Arranque',
    monthlyLabel: 'S/ 49 / mes',
    monthlyCents: 4900,
    annualLabel: 'S/ 490 / año (2 meses gratis)',
    audience: 'Negocio de 1 local, 1-2 cajeros',
    limits: [
      '1 sucursal, 1 caja',
      '1,000 comprobantes/mes incluidos; S/ 0.05 por adicional (nunca se corta el cobro)',
      'Soporte por chat',
      'Sin Modo Dueño movil ni reportes avanzados',
    ],
    upgradeGates: ['Segunda caja', 'Segundo local', 'Modo Dueño'],
  },
  {
    id: 'crece',
    name: 'Crece',
    monthlyLabel: 'S/ 129 / mes',
    monthlyCents: 12900,
    annualLabel: 'S/ 1,290 / año (2 meses gratis)',
    audience: 'Negocio de 1-3 locales en expansion',
    limits: [
      'Hasta 3 sucursales, cajas ilimitadas',
      'Comprobantes con holgura de plan (sin sobregiro en pitch)',
      'Modo Dueño movil y reportes avanzados',
      'Soporte estandar',
    ],
    upgradeGates: ['Cuarta sucursal', 'API de integraciones', 'Fidelizacion'],
    badge: 'Más elegido',
  },
  {
    id: 'cadena',
    name: 'Cadena',
    monthlyLabel: 'S/ 349 / mes + S/ 39 por sucursal adicional',
    monthlyCents: 34900,
    annualLabel: 'Igual con 2 meses gratis',
    audience: 'Cadenas de 4+ locales',
    limits: [
      'Sucursales ilimitadas',
      'Account manager dedicado',
      'Multi-sucursal y Modo Dueño',
      'API y fidelizacion: roadmap con fecha de gate (no disponibles hoy)',
    ],
    upgradeGates: ['SLA contractual', 'Onboarding asistido', 'Integraciones a medida'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyLabel: 'Cotizacion personalizada',
    monthlyCents: null,
    annualLabel: '—',
    audience: 'Cadenas de 30+ locales, franquicias',
    limits: [
      'SLA contractual',
      'Soporte prioritario con contrato de servicio',
      'Onboarding asistido',
      'Integraciones a medida',
    ],
    upgradeGates: [],
  },
] as const;

export const PRICING_DISCLAIMERS = {
  cupo: 'Arranque incluye 1,000 comprobantes/mes; el excedente se factura a S/ 0.05 fuera del cobro y la caja nunca se detiene por volumen. Cada comprobante emitido cuenta, incluidas las notas de crédito y débito y las devoluciones; la nota de crédito no reembolsa el cupo del documento original.',
  gracia:
    'Si falla un pago, sigues cobrando en periodo de gracia: no apagamos la caja por un tema administrativo.',
} as const;
