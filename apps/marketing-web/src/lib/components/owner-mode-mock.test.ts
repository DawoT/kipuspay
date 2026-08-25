import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatCents } from '../brand/money.js';

describe('OwnerModeMock component', () => {
  it('el archivo Svelte existe y renderiza el contenedor y conmutador de vista', () => {
    const svelteContent = readFileSync(new URL('./OwnerModeMock.svelte', import.meta.url), 'utf8');
    expect(svelteContent).toContain('data-testid="owner-mode-mock"');
    expect(svelteContent).toContain('Simulación en vivo');
    expect(svelteContent).toContain('Fotografía del dispositivo');
    expect(svelteContent).toContain('/media/mockup-modo-dueno.jpg');
  });

  it('todos los montos están definidos en céntimos enteros (V-21 / CAL-01)', () => {
    const svelteContent = readFileSync(new URL('./OwnerModeMock.svelte', import.meta.url), 'utf8');
    expect(svelteContent).toContain('formatCents(currentStore.revenueCents)');
    expect(svelteContent).toContain('formatCents(currentStore.digitalCents)');
    expect(svelteContent).toContain('formatCents(currentStore.cashCents)');
    expect(svelteContent).toContain('formatCents(currentStore.cardCents)');

    // Formateo de prueba de los céntimos usados en el mockup
    expect(formatCents(485050)).toBe('4850.50');
    expect(formatCents(214000)).toBe('2140.00');
    expect(formatCents(163050)).toBe('1630.50');
    expect(formatCents(108000)).toBe('1080.00');
  });

  it('cumple con accesibilidad y targets táctiles mínimos de 44px', () => {
    const svelteContent = readFileSync(new URL('./OwnerModeMock.svelte', import.meta.url), 'utf8');
    expect(svelteContent).toContain('min-height: 44px');
    expect(svelteContent).toContain('role="tablist"');
    expect(svelteContent).toContain('role="tab"');
  });
});
