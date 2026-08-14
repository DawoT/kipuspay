/**
 * Planes públicos — documento maestro Parte I §2.1/§6 (versión final).
 * Cupo Arranque + sobregiro facturable; la caja nunca se apaga.
 * Claims en preparación (PUBLIC_CLAIMS / GTM freeze) no se venden como live.
 */

export type PlanId = 'arranque' | 'crece' | 'cadena' | 'enterprise';

export type ClaimAvailability = 'available' | 'preparing';

export interface PricingFeature {
  readonly text: string;
  readonly availability?: ClaimAvailability;
}

export interface PricingPlan {
  readonly id: PlanId;
  readonly name: string;
  readonly monthlyLabel: string;
  readonly annualLabel: string;
  /** Precio mensual en cents para schema.org (Enterprise: null = sin precio público). */
  readonly monthlyCents: number | null;
  readonly audience: string;
  /** Lo que incluye el plan (matriz funcional del documento maestro). */
  readonly features: readonly PricingFeature[];
  readonly limits: readonly string[];
  readonly upgradeGates: readonly string[];
  readonly badge?: string;
}

export function pricingFeatureText(feature: PricingFeature): string {
  return feature.text;
}

export function pricingFeatureAvailability(feature: PricingFeature): ClaimAvailability {
  return feature.availability ?? 'available';
}

export const PRICING_PLANS: readonly PricingPlan[] = [
  {
    id: 'arranque',
    name: 'Arranque',
    monthlyLabel: 'S/ 49 / mes',
    annualLabel: 'S/ 490 / año (2 meses gratis)',
    monthlyCents: 4900,
    audience: 'Negocio de 1 local, 1-2 cajeros',
    features: [
      { text: 'Cobro en caja con efectivo, tarjeta y billeteras digitales' },
      { text: 'Notas de venta de control interno' },
      {
        text: 'Boletas y facturas electrónicas con envío a SUNAT',
        availability: 'preparing',
      },
      { text: 'Impresión de tickets 58 y 80 mm' },
      { text: 'Modo vitrina para tu cliente' },
      { text: 'Arqueo diario de caja' },
      { text: 'Alta rápida de catálogo con escáner de cámara y venta rápida genérica' },
      { text: 'Soporte por chat en español' },
    ],
    limits: [
      '1 sucursal, 1 caja',
      '1,000 comprobantes/mes incluidos; S/ 0.05 por adicional (nunca se corta el cobro)',
    ],
    upgradeGates: ['Segunda caja', 'Segundo local', 'Modo Dueño'],
  },
  {
    id: 'crece',
    name: 'Crece',
    monthlyLabel: 'S/ 129 / mes',
    annualLabel: 'S/ 1,290 / año (2 meses gratis)',
    monthlyCents: 12900,
    audience: 'Negocio de 1-3 locales en expansión',
    features: [
      { text: 'Modo Dueño móvil y reportes avanzados' },
      {
        text: 'Alertas push operacionales y caja móvil PWA para Android',
        availability: 'preparing',
      },
      {
        text: 'Arqueo Z ciego con auditoría y PIN de descuentos',
        availability: 'preparing',
      },
      { text: 'Cambio de turno con PIN temporal sin cerrar caja' },
      {
        text: 'Lotes con control de vencimientos (FEFO) y recetas de insumos',
        availability: 'preparing',
      },
      { text: 'Promociones, variantes y unidades, apartados y series' },
      { text: 'Venta por peso con balanza y comisiones de vendedor' },
    ],
    limits: ['Hasta 3 sucursales, cajas ilimitadas', 'Comprobantes con holgura de plan'],
    upgradeGates: ['Cuarta sucursal', 'API de integraciones', 'Fidelizacion'],
    badge: 'Más elegido',
  },
  {
    id: 'cadena',
    name: 'Cadena',
    monthlyLabel: 'S/ 349 / mes + S/ 39 por sucursal adicional',
    annualLabel: 'Igual con 2 meses gratis',
    monthlyCents: 34900,
    audience: 'Cadenas de 4+ locales',
    features: [
      {
        text: 'Comandas de cocina (KDS) y división de cuentas',
        availability: 'preparing',
      },
      { text: 'Transferencias entre locales y recepción de compras contra factura' },
      { text: 'Importadores masivos (Bsale, Alegra, CSV) y exportación contable' },
      { text: 'Cobro local Yape/Plin, API y webhooks' },
      { text: 'Puntos de fidelización y crédito de tienda con vales y cuotas' },
      { text: 'Devoluciones con nota de crédito y diario contable' },
      { text: 'Cotizaciones, devoluciones a proveedor y ubicaciones por rack' },
      {
        text: 'Pedidos con retiro por WhatsApp y membresías recurrentes',
        availability: 'preparing',
      },
      { text: 'Analítica predictiva de ventas y quiebres (estimación, no garantía)' },
      {
        text: 'Continuidad del negocio ante desastres (DR)',
        availability: 'preparing',
      },
    ],
    limits: ['Sucursales ilimitadas', 'Account manager dedicado'],
    upgradeGates: ['SLA contractual', 'Onboarding asistido', 'Integraciones a medida'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyLabel: 'Cotizacion personalizada',
    annualLabel: '—',
    monthlyCents: null,
    audience: 'Cadenas de 30+ locales, franquicias',
    features: [
      { text: 'SLA contractual prioritario: respuesta en 1 hora cuando la caja no cobra' },
      {
        text: 'Asistente Gerente de Operaciones: resumen diario y consultas de tu negocio',
        availability: 'preparing',
      },
      { text: 'Account manager dedicado y onboarding asistido' },
      { text: 'Integraciones a medida (ERP contable, e-commerce)' },
    ],
    limits: ['SLA contractual', 'Soporte prioritario con contrato de servicio'],
    upgradeGates: [],
  },
] as const;

export const PRICING_DISCLAIMERS = {
  cupo: 'Arranque incluye 1,000 comprobantes/mes; el excedente se factura a S/ 0.05 fuera del cobro y la caja nunca se detiene por volumen. Cada comprobante emitido cuenta, incluidas las notas de crédito y débito y las devoluciones; la nota de crédito no reembolsa el cupo del documento original.',
  gracia:
    'Si falla un pago, sigues cobrando en periodo de gracia: no apagamos la caja por un tema administrativo.',
} as const;

/** Un solo flujo de compra: autoservicio → /empezar; Enterprise → contacto. */
export const PLAN_CTA = {
  selfServe: { label: 'Empieza gratis', href: '/empezar' },
  enterprise: { label: 'Contactar a ventas', href: 'mailto:contacto@kipuspay.com' },
} as const;

export function planCta(planId: PlanId): { label: string; href: string } {
  return planId === 'enterprise' ? PLAN_CTA.enterprise : PLAN_CTA.selfServe;
}
