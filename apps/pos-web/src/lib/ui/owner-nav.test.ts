import { describe, expect, it } from 'vitest';
import { ownerBottomTabs, ownerOverflowLinks } from './owner-nav';

describe('ownerBottomTabs', () => {
  it('nunca supera 5 destinos', () => {
    expect(ownerBottomTabs()).toHaveLength(5);
  });

  it('mantiene Hoy como primer destino', () => {
    expect(ownerBottomTabs()[0]).toMatchObject({ href: '/owner', label: 'Hoy' });
  });
});

describe('ownerOverflowLinks', () => {
  it('mueve Previsiones fuera del bottom nav', () => {
    const overflow = ownerOverflowLinks(false);
    expect(overflow.some((item) => item.href === '/owner/previsiones')).toBe(true);
    expect(ownerBottomTabs().some((item) => item.href === '/owner/previsiones')).toBe(false);
  });

  it('oculta Asistente si el insight no está activo', () => {
    expect(ownerOverflowLinks(false).some((item) => item.href === '/owner/asistente')).toBe(false);
    expect(ownerOverflowLinks(true).some((item) => item.href === '/owner/asistente')).toBe(true);
  });
});
