import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const posLib = fileURLToPath(new URL('.', import.meta.url));
const customerPath = join(posLib, 'CustomerIdentity.svelte');

function readCustomer(): string {
  if (!existsSync(customerPath))
    throw new Error(`CustomerIdentity.svelte no existe en ${customerPath}`);
  return readFileSync(customerPath, 'utf8');
}

describe('GAP #3 — SOLID: CustomerIdentity.svelte extraído (TDD RED→GREEN)', () => {
  it('existe CustomerIdentity.svelte como módulo aislado', () => {
    expect(existsSync(customerPath), 'CustomerIdentity.svelte debe existir').toBe(true);
  });

  it('renderiza data-testid de identidad del cliente', () => {
    const src = readCustomer();
    expect(src).toContain('data-testid="customer-doc-type"');
    expect(src).toContain('data-testid="customer-doc-number"');
    expect(src).toContain('data-testid="customer-name"');
  });

  it('expone props bindables tipadas sin switch(vertical) y sin inventar dummy truthy', () => {
    const src = readCustomer();
    expect(src).toMatch(/\$props\(\)/);
    // bindable para que el orquestador lea sin duplicar estado
    expect(src).toContain('$bindable');
    expect(src).not.toMatch(/switch\s*\(\s*[A-Za-z_.]*vertical/);
    expect(src).not.toMatch(/vertical\s*===/);
    // S7-H1: nunca inventar dummy truthy para doc/nombre
    expect(src).not.toMatch(/dummy|test-customer|demo/);
  });

  it('mantiene copy humano y accesibilidad (label for, placeholder sin jerga)', () => {
    const src = readCustomer();
    expect(src).toContain('Cliente');
    expect(src).toContain('N.º documento');
    expect(src).toContain('Nombre / razón social');
    expect(src).toContain('DNI');
    expect(src).toContain('RUC');
  });
});
