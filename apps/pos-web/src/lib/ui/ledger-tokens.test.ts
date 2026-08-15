import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const POS_SRC = fileURLToPath(new URL('../..', import.meta.url));
const POS_CSS = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');

const SLATE_HEX =
  /#f8fafc|#94a3b8|#0f172a|#fde68a|#f59e0b|#10b981|#f43f5e|#f87171|#64748b|#e2e8f0|#e4572e|#ff8a7a|#fbbf24|#f1f5f9|rgba\(\s*15\s*,\s*23\s*,\s*42/i;

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.svelte-kit') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (/\.(svelte|css|html)$/.test(name)) acc.push(full);
  }
  return acc;
}

describe('POS Ledger Minimalism tokens (Arquitectura §0.2)', () => {
  it('expone aliases semánticos tinta/sello/alerta/papel', () => {
    expect(POS_CSS).toMatch(/--ink:\s*#14161c/);
    expect(POS_CSS).toMatch(/--sello:\s*#0f6b4c/);
    expect(POS_CSS).toMatch(/--alerta:\s*#b5461d/);
    expect(POS_CSS).toMatch(/--paper:\s*#f3efe6/);
  });

  it('incluye skip-link y costura de sync', () => {
    expect(POS_CSS).toMatch(/\.skip-link/);
    expect(POS_CSS).toMatch(/input[\s\S]*?min-height:\s*44px/);
  });

  it('no usa fallbacks slate de plantilla en el CSS global', () => {
    expect(POS_CSS.toLowerCase()).not.toMatch(/#f8fafc/);
    expect(POS_CSS.toLowerCase()).not.toMatch(/#94a3b8/);
    expect(POS_CSS.toLowerCase()).not.toMatch(/#0f172a/);
  });

  it('unifica --text-dim del tema claro', () => {
    const lightBlocks = [
      ...POS_CSS.matchAll(/\[data-theme='light'\][\s\S]*?--text-dim:\s*(#[0-9a-fA-F]{6})/g),
    ];
    const prefers = [
      ...POS_CSS.matchAll(/prefers-color-scheme:\s*light[\s\S]*?--text-dim:\s*(#[0-9a-fA-F]{6})/g),
    ];
    expect(lightBlocks.length).toBeGreaterThan(0);
    expect(prefers.length).toBeGreaterThan(0);
    expect(lightBlocks[0][1].toLowerCase()).toBe(prefers[0][1].toLowerCase());
  });

  it('owner-dark completa superficies oscuras (no hereda glass-card blanco)', () => {
    const owner = POS_CSS.match(/\[data-theme='owner-dark'\]\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(owner).toMatch(/--bg-glass-card:\s*rgba\(35,\s*39,\s*48/);
    expect(owner).not.toMatch(/--bg-glass-card:\s*#ffffff/);
    expect(owner).toMatch(/--text-dim:\s*#8a94a3/);
    expect(owner).toMatch(/--bg-ledger-card:\s*var\(--bg-glass-card\)/);
    expect(owner).toMatch(/--bg-surface:\s*#232730/);
    expect(owner).toMatch(/--border-subtle:/);
  });

  it('alias --bg-ledger-card en dark y light', () => {
    expect(POS_CSS).toMatch(/--bg-ledger-card:\s*var\(--bg-glass-card\)/);
    const dark = POS_CSS.match(
      /:root\[data-theme='dark'\][\s\S]*?--bg-ledger-card:\s*var\(--bg-glass-card\)/,
    );
    const light = POS_CSS.match(
      /:root\[data-theme='light'\][\s\S]*?--bg-ledger-card:\s*var\(--bg-glass-card\)/,
    );
    // dark tokens live on :root / body[data-theme=dark] shared block
    expect(POS_CSS).toMatch(
      /body\[data-theme='dark'\][\s\S]*?--bg-ledger-card:\s*var\(--bg-glass-card\)/,
    );
    expect(light).not.toBeNull();
    void dark;
  });

  it('cero fallbacks slate en componentes POS', () => {
    const hits: string[] = [];
    for (const file of walk(POS_SRC)) {
      const text = readFileSync(file, 'utf8');
      if (SLATE_HEX.test(text)) hits.push(file.slice(POS_SRC.length));
    }
    expect(hits, hits.join('\n')).toEqual([]);
  });
});
