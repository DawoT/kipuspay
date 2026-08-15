/** Bottom nav de Modo Dueño: máximo 5 destinos (GTM §6.3). */

export interface OwnerNavItem {
  readonly href: string;
  readonly label: string;
  readonly testid: string;
}

export function ownerBottomTabs(): readonly OwnerNavItem[] {
  return [
    { href: '/owner', label: 'Hoy', testid: 'tab-hoy' },
    { href: '/owner/alertas', label: 'Alertas', testid: 'tab-alertas' },
    { href: '/owner/finanzas', label: 'Finanzas', testid: 'tab-finanzas' },
    { href: '/owner/locales', label: 'Locales', testid: 'tab-locales' },
    { href: '/owner/yo', label: 'Yo', testid: 'tab-yo' },
  ];
}

export function ownerOverflowLinks(insightsEnabled: boolean): readonly OwnerNavItem[] {
  return [
    { href: '/owner/stock', label: 'Stock', testid: 'tab-stock' },
    { href: '/owner/compras', label: 'Compras', testid: 'tab-compras' },
    { href: '/owner/pagos', label: 'Pagos', testid: 'tab-pagos' },
    { href: '/owner/transferencias', label: 'Transferencias', testid: 'tab-transferencias' },
    { href: '/owner/previsiones', label: 'Previsiones', testid: 'tab-previsiones' },
    ...(insightsEnabled
      ? [{ href: '/owner/asistente', label: 'Asistente', testid: 'tab-asistente' }]
      : []),
  ];
}

export function ownerTabIsActive(pathname: string, href: string): boolean {
  return pathname === href;
}
