import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const POS_SRC = fileURLToPath(new URL('../..', import.meta.url));
const LAYOUT = readFileSync(new URL('../../routes/+layout.svelte', import.meta.url), 'utf8');
const APP_CSS = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.svelte-kit') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (full.endsWith('.svelte')) acc.push(full);
  }
  return acc;
}

describe('FASE F densidad POS', () => {
  it('sidebar no lista dump Dueño, 3-way ni KDS', () => {
    expect(LAYOUT).not.toMatch(/Dashboard Hoy/);
    expect(LAYOUT).not.toMatch(/Factura 3-way/);
    expect(LAYOUT).not.toMatch(/KDS Cocina/);
    expect(LAYOUT).toMatch(/label: 'Modo Dueño'/);
    expect(LAYOUT).toMatch(/label: 'Conciliar factura'/);
    expect(LAYOUT).toMatch(/href: '\/kds', label: 'Cocina'/);
  });

  it('cero glass-card en markup Svelte', () => {
    const hits: string[] = [];
    for (const file of walk(POS_SRC)) {
      const text = readFileSync(file, 'utf8');
      if (text.includes('glass-card')) hits.push(file.slice(POS_SRC.length));
    }
    expect(hits, hits.join('\n')).toEqual([]);
  });

  it('caja operativa no capa 28rem', () => {
    for (const rel of [
      'caja/cuotas/+page.svelte',
      'caja/vale/+page.svelte',
      'caja/gastos/+page.svelte',
    ]) {
      const text = readFileSync(join(POS_SRC, 'routes', rel), 'utf8');
      expect(text, rel).not.toMatch(/max-width:\s*28rem/);
      expect(text, rel).not.toMatch(/max-width:28rem/);
    }
  });

  it('eyebrow, section-tag y stat-label son sentence-case en el kit', () => {
    const eyebrow = APP_CSS.match(/\.page-eyebrow\s*\{[^}]+\}/)?.[0] ?? '';
    const tag = APP_CSS.match(/\.section-tag\s*\{[^}]+\}/)?.[0] ?? '';
    const stat = APP_CSS.match(/\.stat-label\s*\{[^}]+\}/)?.[0] ?? '';
    expect(eyebrow).not.toMatch(/text-transform:\s*uppercase/);
    expect(tag).not.toMatch(/text-transform:\s*uppercase/);
    expect(stat).not.toMatch(/text-transform:\s*uppercase/);
  });

  it('banner POS humaniza formalización y apila en mobile', () => {
    const home = readFileSync(join(POS_SRC, 'routes', '+page.svelte'), 'utf8');
    expect(home).toMatch(/formalizationModeLabel\(/);
    expect(home).toMatch(/data-testid="formalization-banner"/);
    expect(home).not.toMatch(
      /data-testid="formalization-mode"[^>]*>\s*\{session\.formalizationMode\}/,
    );
    expect(home).toMatch(/\.banner-row/);
    expect(home).toMatch(/flex-direction:\s*column/);
    expect(home).toMatch(/max-width:\s*900px/);
  });
});
