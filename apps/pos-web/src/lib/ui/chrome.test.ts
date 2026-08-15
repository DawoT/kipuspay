import { describe, expect, it } from 'vitest';
import {
  chromeShowsSidebar,
  chromeShowsSkipLink,
  chromeShowsTopBar,
  resolveChromeMode,
} from './chrome';

describe('resolveChromeMode', () => {
  it('deja /login sin chrome de ERP', () => {
    expect(resolveChromeMode({ pathname: '/login', role: 'cashier' })).toBe('auth');
  });

  it('deja vitrina, kiosko, KDS y salón como pantalla de piso', () => {
    expect(resolveChromeMode({ pathname: '/vitrina', role: 'admin' })).toBe('display');
    expect(resolveChromeMode({ pathname: '/kiosk', role: 'cashier' })).toBe('display');
    expect(resolveChromeMode({ pathname: '/kds', role: 'admin' })).toBe('display');
    expect(resolveChromeMode({ pathname: '/salon', role: 'admin' })).toBe('display');
    expect(resolveChromeMode({ pathname: '/salon/split', role: 'cashier' })).toBe('display');
  });

  it('aísla Modo Dueño del sidebar admin', () => {
    expect(resolveChromeMode({ pathname: '/owner', role: 'owner' })).toBe('owner');
    expect(resolveChromeMode({ pathname: '/owner/finanzas', role: 'owner' })).toBe('owner');
  });

  it('usa chrome de cajero en cobro cuando el rol no es admin', () => {
    expect(resolveChromeMode({ pathname: '/', role: 'cashier' })).toBe('cashier');
    expect(resolveChromeMode({ pathname: '/', role: '' })).toBe('cashier');
    expect(resolveChromeMode({ pathname: '/caja/historial', role: 'supervisor' })).toBe('cashier');
  });

  it('mantiene sidebar admin si un admin abre la caja', () => {
    expect(resolveChromeMode({ pathname: '/', role: 'admin' })).toBe('admin');
    expect(resolveChromeMode({ pathname: '/admin/catalogo', role: 'cashier' })).toBe('admin');
  });
});

describe('chrome chrome flags', () => {
  it('solo admin ve sidebar', () => {
    expect(chromeShowsSidebar('admin')).toBe(true);
    expect(chromeShowsSidebar('cashier')).toBe(false);
    expect(chromeShowsSidebar('owner')).toBe(false);
    expect(chromeShowsSidebar('auth')).toBe(false);
    expect(chromeShowsSidebar('display')).toBe(false);
  });

  it('cajero y admin ven top-bar; login y dueño no', () => {
    expect(chromeShowsTopBar('cashier')).toBe(true);
    expect(chromeShowsTopBar('admin')).toBe(true);
    expect(chromeShowsTopBar('owner')).toBe(false);
    expect(chromeShowsTopBar('auth')).toBe(false);
  });

  it('skip-link solo en nav pesada', () => {
    expect(chromeShowsSkipLink('admin')).toBe(true);
    expect(chromeShowsSkipLink('cashier')).toBe(true);
    expect(chromeShowsSkipLink('auth')).toBe(false);
  });
});
