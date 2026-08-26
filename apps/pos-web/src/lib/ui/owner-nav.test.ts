import { describe, expect, it } from 'vitest';
import {
  ownerBottomTabs,
  ownerOverflowLinks,
  ownerSidebarGroups,
  ownerSidebarFlatHrefs,
} from './owner-nav';

describe('ownerBottomTabs', () => {
  it('nunca supera 5 destinos', () => {
    expect(ownerBottomTabs()).toHaveLength(5);
  });

  it('mantiene Hoy como primer destino', () => {
    expect(ownerBottomTabs()[0]).toMatchObject({ href: '/owner', label: 'Hoy' });
  });
});

describe('ownerOverflowLinks', () => {
  it('mueve Previsiones y operaciones fuera del bottom nav', () => {
    const overflow = ownerOverflowLinks(false);
    expect(overflow.some((item) => item.href === '/owner/previsiones')).toBe(true);
    expect(overflow.some((item) => item.href === '/owner/stock')).toBe(true);
    expect(overflow.some((item) => item.href === '/owner/compras')).toBe(true);
    expect(overflow.some((item) => item.href === '/owner/pagos')).toBe(true);
    expect(overflow.some((item) => item.href === '/owner/transferencias')).toBe(true);
    expect(ownerBottomTabs().some((item) => item.href === '/owner/previsiones')).toBe(false);
  });

  it('oculta Asistente si el insight no está activo', () => {
    expect(ownerOverflowLinks(false).some((item) => item.href === '/owner/asistente')).toBe(false);
    expect(ownerOverflowLinks(true).some((item) => item.href === '/owner/asistente')).toBe(true);
  });
});

describe('ownerSidebarGroups (navegación premium)', () => {
  it('cubre navegación Dueño completa: Hoy, Ventas, Finanzas, Locales, Stock, Alertas, Mi perfil, Configuración', () => {
    const groups = ownerSidebarGroups(false);
    const labels = groups.map((g) => g.label);
    expect(labels).toContain('Hoy');
    expect(labels).toContain('Ventas');
    expect(labels).toContain('Finanzas');
    expect(labels).toContain('Locales');
    expect(labels).toContain('Operaciones');
    expect(labels).toContain('Alertas');
    expect(labels).toContain('Cuenta');
    const flat = ownerSidebarFlatHrefs(false);
    expect(flat).toContain('/owner');
    expect(flat).toContain('/');
    expect(flat).toContain('/owner/finanzas');
    expect(flat).toContain('/owner/locales');
    expect(flat).toContain('/owner/stock');
    expect(flat).toContain('/owner/alertas');
    expect(flat).toContain('/owner/yo');
    expect(flat).toContain('/admin/configuracion');
  });

  it('incluye todas las rutas /owner/* sin huérfanas y respeta gate de asistente', () => {
    const without = ownerSidebarFlatHrefs(false);
    const withInsight = ownerSidebarFlatHrefs(true);
    expect(without).not.toContain('/owner/asistente');
    expect(withInsight).toContain('/owner/asistente');
    // Stock, Compras, Pagos, Transferencias, Previsiones deben estar siempre
    for (const href of [
      '/owner/stock',
      '/owner/compras',
      '/owner/pagos',
      '/owner/transferencias',
      '/owner/previsiones',
    ]) {
      expect(without).toContain(href);
    }
  });

  it('cada item del sidebar tiene icono y testid con target 44px implícito', () => {
    const groups = ownerSidebarGroups(false);
    for (const g of groups) {
      expect(g.icon).toBeTruthy();
      for (const item of g.items) {
        expect(item.icon).toBeTruthy();
        expect(item.testid).toMatch(/^owner-nav-/);
      }
    }
  });
});
