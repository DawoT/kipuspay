import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');
const home = readFileSync(new URL('../../routes/+page.svelte', import.meta.url), 'utf8');
const compare = readFileSync(
  new URL('../../routes/comparar/+page.svelte', import.meta.url),
  'utf8',
);

describe('responsive marketing UI', () => {
  it('apila las comparativas en mobile sin scroll horizontal nativo', () => {
    expect(css).toContain('@media (max-width: 719px)');
    expect(css).toMatch(/\.comparison-table-wrap\s*\{[^}]*overflow-x:\s*visible/s);
    expect(css).toMatch(/\.comparison-table\s*\{[^}]*min-width:\s*0/s);
    expect(home).toContain('class="ledger-table-wrap comparison-table-wrap"');
    expect(compare).toContain('class="ledger-table comparison-table"');
    expect(home).toContain('data-label="Sistema tradicional"');
    expect(compare).toContain('data-label={`Experiencia con ${selected.name}`}');
  });

  it('los botones ghost tienen estados hover y focus de alto contraste', () => {
    expect(css).toMatch(/\.btn-ghost:hover,[\s\S]*\.btn-ghost:focus-visible/);
    expect(css).toMatch(
      /\.section-paper \.btn-ghost:hover,[\s\S]*\.section-paper \.btn-ghost:focus-visible/,
    );
    expect(css).toContain('background: var(--amber);');
    expect(css).toContain('background: var(--ink);');
  });
});
