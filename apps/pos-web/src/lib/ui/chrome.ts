/** Chrome por rol y ruta (GTM §6.1 densidad adaptativa). Rol, no vertical. */

export type ChromeMode = 'auth' | 'display' | 'cashier' | 'admin' | 'owner';

export function resolveChromeMode(input: {
  readonly pathname: string;
  readonly role: string;
}): ChromeMode {
  const path = input.pathname;
  const role = input.role.trim().toLowerCase();
  if (path === '/login' || path.startsWith('/login/')) return 'auth';
  if (isDisplaySurface(path)) return 'display';
  if (path === '/owner' || path.startsWith('/owner/')) return 'owner';
  if (isCashierSurface(path) && role !== 'admin' && role !== 'owner') return 'cashier';
  return 'admin';
}

export function chromeShowsSidebar(mode: ChromeMode): boolean {
  return mode === 'admin';
}

export function chromeShowsTopBar(mode: ChromeMode): boolean {
  return mode === 'admin' || mode === 'cashier';
}

export function chromeShowsSkipLink(mode: ChromeMode): boolean {
  return mode === 'admin' || mode === 'cashier';
}

function isDisplaySurface(path: string): boolean {
  return (
    path === '/vitrina' ||
    path.startsWith('/vitrina/') ||
    path === '/kiosk' ||
    path.startsWith('/kiosk/') ||
    path === '/kds' ||
    path.startsWith('/kds/') ||
    path === '/salon' ||
    path.startsWith('/salon/')
  );
}

function isCashierSurface(path: string): boolean {
  return (
    path === '/' ||
    path.startsWith('/caja') ||
    path === '/mobile' ||
    path.startsWith('/mobile/') ||
    path.startsWith('/orders')
  );
}
