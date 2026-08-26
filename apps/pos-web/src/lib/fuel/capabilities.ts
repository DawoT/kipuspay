/**
 * Bundle de capabilities para la vertical Grifos — estación con surtidores.
 * No es un fork por vertical: cada módulo se activa por flag (ADR-ARCH-002, V-07/V-23).
 * Fuente canónica de VerticalSlug: apps/marketing-web/src/lib/content/types.ts
 *
 * Grifos NO necesita:
 *  - inventory.batches / FEFO (lotes farmacéuticos)
 *  - orders.kds / split (cocina restaurante)
 *  - inventory.scale / balanza (S40)
 *
 * Sí necesita (bundle premium):
 */

export const GRIFOS_BUNDLE = {
  vertical: 'grifos' as const,
  aliasEn: 'fuel' as const,
  description: 'Grifos y estaciones: control de surtidores, precios del día y flota con detracción',
  capabilities: [
    'pos.checkout', // caja pista offline-first
    'cash.blind_z', // arqueo ciego por isleta/turno
    'ops.shift_handoff', // turnos 24h sin cerrar caja
    'fiscal.withholdings', // detracción Diésel B5 10% en factura B2B (SPOT)
    'catalog.price_labels', // tablero precios del día (snapshot servidor)
    'payments.qr_wallets', // Yape/Plin en pista
    'payments.card_acquirer', // Culqi/Niubiz
    'ledger.accounts_receivable', // saldo flota / CxC empresa
  ] as const,
  // Flags que gatean el bundle (default off, zero flicker)
  flags: {
    posCheckout: 'PUBLIC_FEATURE_POS_CHECKOUT',
    cashBlindZ: 'PUBLIC_FEATURE_CASH_BLIND_Z',
    shiftHandoff: 'PUBLIC_FEATURE_SHIFT_HANDOFF',
    withholdings: 'PUBLIC_FEATURE_FISCAL_WITHHOLDINGS',
    fuelStation: 'PUBLIC_FEATURE_FUEL_STATION',
    priceLabels: 'PUBLIC_FEATURE_CATALOG_PRICE_LABELS',
    qrWallets: 'PUBLIC_FEATURE_PAYMENTS_QR_WALLETS',
    cardAcquirer: 'PUBLIC_FEATURE_PAYMENTS_CARD_ACQUIRER',
  } as const,
  // Dos mejoras premium tangibles (diseño del cajero apurado)
  premiumImprovements: [
    {
      id: 'fuel-dispatch-gallons-detraction',
      title: 'Despacho por galones con detracción automática',
      status: 'IMPLEMENTED' as const,
      description:
        'El cajero elige combustible, teclea galones (o monto) y ve al instante subtotal, IGV y —si es Diésel B5 con factura a empresa— el monto de detracción 10% separado para el depósito. Offline <100ms, servidor reconcilia.',
      gatedBy: ['fiscal.withholdings', 'fuel_station'],
      entry: 'apps/pos-web/src/lib/fuel/dispatch.ts',
    },
    {
      id: 'island-shift-report',
      title: 'Reporte de turno por isleta / manguera',
      status: 'DESIGNED' as const,
      description:
        'Vista por isla (1/2/3) con totales por turno, medios de pago y arqueo desglosado. Usa cash.blind_z + ops.shift_handoff: el Z del día desglosa diferencia por tramo de turno y por isla, sin culpar al cajero equivocado. Interfaz 44px, AA, sin jerga.',
      gatedBy: ['cash.blind_z', 'ops.shift_handoff'],
      entry: 'apps/pos-web/src/lib/fuel/island-report.ts (stub)',
    },
  ] as const,
} as const;

export type GrifosBundle = typeof GRIFOS_BUNDLE;

/**
 * Helper: ¿el bundle grifos está activo? Puro; inyecta flags resueltos.
 * Sin condicionales por vertical: solo lee booleans de feature flags / tenant_capabilities.
 */
export function isGrifosBundleReady(flags: {
  readonly withholdings: boolean;
  readonly fuelStation: boolean;
  readonly shiftHandoff: boolean;
  readonly cashBlindZ: boolean;
}): boolean {
  // Para grifos mínimo: despacho + detracción. Turnos/Arqueo son opcionales pero recomendados.
  return flags.fuelStation || flags.withholdings;
}
