/**
 * Planes públicos — GTM §4.1. Cupo Arranque como copy comercial (metering = Sprint 27 / GTM-04).
 */

export type PlanId = 'arranque' | 'crece' | 'cadena' | 'enterprise';

export interface PricingPlan {
  readonly id: PlanId;
  readonly name: string;
  readonly monthlyLabel: string;
  readonly annualLabel: string;
  readonly audience: string;
  readonly limits: readonly string[];
  readonly upgradeGates: readonly string[];
}

export const PRICING_PLANS: readonly PricingPlan[] = [
  {
    id: 'arranque',
    name: 'Arranque',
    monthlyLabel: 'S/ 49 / mes',
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
    annualLabel: 'S/ 1,290 / año (2 meses gratis)',
    audience: 'Negocio de 1-3 locales en expansion',
    limits: [
      'Hasta 3 sucursales, cajas ilimitadas',
      'Comprobantes con holgura de plan (sin sobregiro en pitch)',
      'Modo Dueño movil y reportes avanzados',
      'Soporte estandar',
    ],
    upgradeGates: ['Cuarta sucursal', 'API de integraciones', 'Fidelizacion'],
  },
  {
    id: 'cadena',
    name: 'Cadena',
    monthlyLabel: 'S/ 349 / mes + S/ 39 por sucursal adicional',
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
    annualLabel: '—',
    audience: 'Cadenas de 30+ locales, franquicias',
    limits: [
      'SLA contractual',
      'Soporte prioritario (tras aprobacion de SLA)',
      'Onboarding asistido',
      'Integraciones a medida',
    ],
    upgradeGates: [],
  },
] as const;

export const PRICING_DISCLAIMERS = {
  cupo: 'El cupo de Arranque se publica como referencia comercial; el metering facturable se habilita con Sprint 27 (GTM-04). El cobro nunca se apaga por volumen.',
  gracia:
    'Si falla un pago, sigues cobrando en periodo de gracia: no apagamos la caja por un tema administrativo.',
} as const;
