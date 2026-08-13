import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../routes/admin/backups/+page.svelte', import.meta.url),
  'utf8',
);

describe('Admin backups workbench source contract', () => {
  it('states synchronized scope and pending offline sales without an inclusion claim', () => {
    expect(source).toContain('datos sincronizados del servidor');
    expect(source).toContain('ventas offline pendientes');
    expect(source).toMatch(/no están\s+incluidas/);
  });

  it('has accessible live status, alerts, labels and reduced-motion/mobile safeguards', () => {
    expect(source).toMatch(/aria-live="polite"/);
    expect(source).toMatch(/role="alert"/);
    expect(source).toMatch(/<label/);
    expect(source).toMatch(/min-height:\s*44px/);
    expect(source).toMatch(/@media \(max-width:\s*375px\)/);
    expect(source).toMatch(/prefers-reduced-motion/);
  });

  it('offers owner dry-run but no restore-apply control', () => {
    expect(source).toContain("role === 'owner'");
    expect(source).toContain('Ejecutar simulación');
    expect(source).not.toMatch(/Aplicar restauración|restore-apply/);
  });

  it('hides download from Admin and requires Owner reauthentication', () => {
    expect(source).toMatch(
      /\{#if role === 'owner'\}[\s\S]*Descargar respaldo[\s\S]*Ejecutar simulación[\s\S]*\{\/if\}/,
    );
    expect(source).toMatch(/disabled=\{[^}]*!stepUpToken[^}]*\}[\s\S]*Descargar respaldo/);
  });
});
