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

/* Sidebar premium Modo Dueño — reutiliza patrón de sidebar del POS (Grupos colapsables, drawer móvil). */
import type { ComponentProps } from 'svelte';
import type Icon from './Icon.svelte';

type IconName = ComponentProps<typeof Icon>['name'];

export interface OwnerSidebarItem extends OwnerNavItem {
  readonly icon: IconName;
}

export interface OwnerSidebarGroup {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly items: readonly OwnerSidebarItem[];
}

export function ownerSidebarGroups(insightsEnabled: boolean): readonly OwnerSidebarGroup[] {
  return [
    {
      id: 'hoy',
      label: 'Hoy',
      icon: 'home',
      items: [{ href: '/owner', label: 'Resumen del día', testid: 'owner-nav-hoy', icon: 'home' }],
    },
    {
      id: 'ventas',
      label: 'Ventas',
      icon: 'cart',
      items: [
        { href: '/', label: 'Terminal POS', testid: 'owner-nav-pos', icon: 'cart' },
        {
          href: '/caja/historial',
          label: 'Historial del día',
          testid: 'owner-nav-historial',
          icon: 'receipt',
        },
        { href: '/caja', label: 'Cierre Z', testid: 'owner-nav-cierre', icon: 'receipt' },
      ],
    },
    {
      id: 'finanzas',
      label: 'Finanzas',
      icon: 'bar-chart',
      items: [
        {
          href: '/owner/finanzas',
          label: 'Finanzas',
          testid: 'owner-nav-finanzas',
          icon: 'bar-chart',
        },
        { href: '/owner/pagos', label: 'Pagos', testid: 'owner-nav-pagos', icon: 'credit-card' },
      ],
    },
    {
      id: 'locales',
      label: 'Locales',
      icon: 'store',
      items: [
        { href: '/owner/locales', label: 'Locales', testid: 'owner-nav-locales', icon: 'store' },
      ],
    },
    {
      id: 'operaciones',
      label: 'Operaciones',
      icon: 'box',
      items: [
        { href: '/owner/stock', label: 'Stock', testid: 'owner-nav-stock', icon: 'box' },
        {
          href: '/owner/compras',
          label: 'Compras',
          testid: 'owner-nav-compras',
          icon: 'clipboard-check',
        },
        {
          href: '/owner/transferencias',
          label: 'Transferencias',
          testid: 'owner-nav-transferencias',
          icon: 'truck',
        },
      ],
    },
    {
      id: 'alertas',
      label: 'Alertas',
      icon: 'alert',
      items: [
        { href: '/owner/alertas', label: 'Alertas', testid: 'owner-nav-alertas', icon: 'alert' },
        {
          href: '/owner/previsiones',
          label: 'Previsiones',
          testid: 'owner-nav-previsiones',
          icon: 'bar-chart',
        },
        ...(insightsEnabled
          ? ([
              {
                href: '/owner/asistente',
                label: 'Asistente',
                testid: 'owner-nav-asistente',
                icon: 'zap',
              },
            ] as const)
          : []),
      ],
    },
    {
      id: 'cuenta',
      label: 'Cuenta',
      icon: 'user',
      items: [
        { href: '/owner/yo', label: 'Mi perfil', testid: 'owner-nav-yo', icon: 'user' },
        {
          href: '/admin/configuracion',
          label: 'Configuración',
          testid: 'owner-nav-config',
          icon: 'settings',
        },
      ],
    },
  ];
}

export function ownerSidebarFlatHrefs(insightsEnabled: boolean): readonly string[] {
  return ownerSidebarGroups(insightsEnabled).flatMap((g) => g.items.map((i) => i.href));
}
