import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const POS_SRC = fileURLToPath(new URL('../..', import.meta.url));

interface Finding {
  readonly id: string;
  readonly file: string;
  readonly line: number;
  readonly detail: string;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.svelte-kit') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (full.endsWith('.svelte') || full.endsWith('.css')) acc.push(full);
  }
  return acc;
}

function lineAt(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

function scanCardPadOverride(file: string, text: string): Finding[] {
  const out: Finding[] = [];
  const re = /\.ledger-card(?:-flush)?\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const isFlush = m[0].startsWith('.ledger-card-flush');
    const pad = m[1].match(/padding\s*:\s*([^;]+);/);
    if (!pad) continue;
    const value = pad[1].trim();
    if (isFlush) {
      if (value !== '0' && value !== '0px') {
        out.push({
          id: 'CARD_PAD_OVERRIDE',
          file,
          line: lineAt(text, m.index),
          detail: `.ledger-card-flush padding debe ser 0, got ${value}`,
        });
      }
      continue;
    }
    if (value !== 'var(--inset-card)') {
      out.push({
        id: 'CARD_PAD_OVERRIDE',
        file,
        line: lineAt(text, m.index),
        detail: `.ledger-card padding override: ${value}`,
      });
    }
  }
  return out;
}

function scanBreakpoints(file: string, text: string): Finding[] {
  const out: Finding[] = [];
  const re = /@media\s*\(\s*max-width:\s*(768|480)px\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({
      id: m[1] === '768' ? 'BP_768' : 'BP_480',
      file,
      line: lineAt(text, m.index),
      detail: `@media (max-width: ${m[1]}px)`,
    });
  }
  return out;
}

function parseTag(full: string): {
  name: string;
  isClose: boolean;
  selfClose: boolean;
  classes: string[];
} {
  const name = (full.match(/<\/?([A-Za-z][\w:-]*)/) ?? [])[1] ?? '';
  const isClose = full.startsWith('</');
  const selfClose =
    /\/>$/.test(full) || /^(br|hr|img|input|meta|link|source|area|base|col|embed|wbr)$/i.test(name);
  const classAttr = full.match(/\bclass\s*=\s*["']([^"']*)["']/);
  const classes = classAttr ? classAttr[1].split(/\s+/).filter(Boolean) : [];
  return { name, isClose, selfClose, classes };
}

function scanNestedSectionPad(file: string, text: string): Finding[] {
  if (!file.endsWith('.svelte')) return [];
  const markup = text.split(/<style\b/)[0] ?? text;
  const out: Finding[] = [];
  const insideInset: boolean[] = [];
  const re = /<\/?[A-Za-z][\w:-]*[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markup)) !== null) {
    const full = m[0];
    if (full.startsWith('<!--')) continue;
    const tag = parseTag(full);
    if (tag.isClose) {
      if (insideInset.length) insideInset.pop();
      continue;
    }
    const hasLedger = tag.classes.includes('ledger-card');
    const hasSection = tag.classes.includes('section-pad');
    const parentInset = insideInset.length > 0 && insideInset[insideInset.length - 1];

    if (hasSection && parentInset) {
      out.push({
        id: 'NESTED_SECTION_PAD',
        file,
        line: lineAt(markup, m.index),
        detail: 'section-pad anidado dentro de ledger-card/section-pad',
      });
    }

    if (!tag.selfClose) {
      insideInset.push(parentInset || hasLedger || hasSection);
    }
  }
  return out;
}

function scanCardPad125(file: string, text: string): Finding[] {
  const out: Finding[] = [];
  const re = /\.([a-z0-9_-]*card[a-z0-9_-]*)\s*\{([^}]*)\}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (/padding\s*:\s*1\.25rem\b/.test(m[2])) {
      out.push({
        id: 'CARD_PAD_1_25',
        file,
        line: lineAt(text, m.index),
        detail: `.${m[1]} padding: 1.25rem`,
      });
    }
  }
  return out;
}

function scanBlurOnCard(file: string, text: string): Finding[] {
  const out: Finding[] = [];
  const re = /\.ledger-card\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (/backdrop-filter\s*:/.test(m[1])) {
      out.push({
        id: 'BLUR_ON_CARD',
        file,
        line: lineAt(text, m.index),
        detail: 'backdrop-filter en .ledger-card',
      });
    }
  }
  return out;
}

function scanGlassNoPad(file: string, text: string): Finding[] {
  if (!file.endsWith('.svelte')) return [];
  const out: Finding[] = [];
  const markup = text.split(/<style\b/)[0] ?? text;
  const style = text.includes('<style') ? text.slice(text.indexOf('<style')) : '';
  const re = /\bclass\s*=\s*["']([^"']*glass-panel[^"']*)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markup)) !== null) {
    const classes = m[1]
      .split(/\s+/)
      .filter((c) => c && c !== 'glass-panel' && c !== 'glass-panel-interactive');
    if (classes.length === 0) {
      out.push({
        id: 'GLASS_NO_PAD',
        file,
        line: lineAt(markup, m.index),
        detail: 'glass-panel sin modificador con padding',
      });
      continue;
    }
    const hasPad = classes.some((cls) => {
      const idx = style.indexOf(`.${cls}`);
      if (idx < 0) return false;
      const open = style.indexOf('{', idx);
      if (open < 0) return false;
      const close = style.indexOf('}', open);
      if (close < 0) return false;
      return /padding\s*:/.test(style.slice(open, close));
    });
    if (!hasPad) {
      out.push({
        id: 'GLASS_NO_PAD',
        file,
        line: lineAt(markup, m.index),
        detail: `glass-panel + [${classes.join(' ')}] sin padding`,
      });
    }
  }
  return out;
}

function scanAmberWarning(file: string, text: string): Finding[] {
  const out: Finding[] = [];
  const re = /var\(\s*--amber-warning\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({
      id: 'UNDEF_AMBER_WARNING',
      file,
      line: lineAt(text, m.index),
      detail: 'var(--amber-warning)',
    });
  }
  return out;
}

function scanCardPad15(file: string, text: string): Finding[] {
  const out: Finding[] = [];
  const re = /\.([a-z0-9_-]*card[a-z0-9_-]*)\s*\{([^}]*)\}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (/padding\s*:\s*1\.5rem\b/.test(m[2])) {
      out.push({
        id: 'CARD_PAD_LITERAL',
        file,
        line: lineAt(text, m.index),
        detail: `.${m[1]} padding: 1.5rem`,
      });
    }
  }
  return out;
}

function scanBadgeClone(): Finding[] {
  const css = readFileSync(join(POS_SRC, 'app.css'), 'utf8');
  const indigo =
    css
      .match(/\.badge-indigo\s*\{([^}]*)\}/)?.[1]
      ?.replace(/\s+/g, ' ')
      .trim() ?? '';
  const warning =
    css
      .match(/\.badge-warning\s*\{([^}]*)\}/)?.[1]
      ?.replace(/\s+/g, ' ')
      .trim() ?? '';
  if (indigo && warning && indigo === warning) {
    return [
      {
        id: 'BADGE_CLONE',
        file: 'app.css',
        line: lineAt(css, css.indexOf('.badge-warning')),
        detail: '.badge-warning idéntico a .badge-indigo',
      },
    ];
  }
  return [];
}

function scanOwnerBottomSafe(): Finding[] {
  const layout = readFileSync(join(POS_SRC, 'routes/owner/+layout.svelte'), 'utf8');
  if (!/padding-bottom:\s*calc\(\s*5\.5rem\s*\+\s*env\(\s*safe-area-inset-bottom/.test(layout)) {
    return [
      {
        id: 'OWNER_BOTTOM_UNDERSAFE',
        file: 'routes/owner/+layout.svelte',
        line: 1,
        detail: 'owner-body compacto debe sumar safe-area-inset-bottom',
      },
    ];
  }
  return [];
}

function scanOwnerOrphanRoutes(): Finding[] {
  const navPath = join(POS_SRC, 'lib/ui/owner-nav.ts');
  const nav = readFileSync(navPath, 'utf8');
  const ownerRoutesDir = join(POS_SRC, 'routes/owner');
  const pages: string[] = [];
  for (const name of readdirSync(ownerRoutesDir)) {
    const full = join(ownerRoutesDir, name);
    if (!statSync(full).isDirectory()) continue;
    if (existsSync(join(full, '+page.svelte'))) {
      pages.push(`/owner/${name}`);
    }
  }
  const covered = new Set<string>();
  for (const m of nav.matchAll(/href:\s*'(\/owner[^']*)'/g)) {
    covered.add(m[1]);
  }
  // Hoy lives at /owner
  covered.add('/owner');
  const out: Finding[] = [];
  for (const href of pages) {
    if (!covered.has(href)) {
      out.push({
        id: 'OWNER_ORPHAN_ROUTES',
        file: 'lib/ui/owner-nav.ts',
        line: 1,
        detail: `${href} no está en tabs ni overflow`,
      });
    }
  }
  return out;
}

function scanGlassResidual(file: string, text: string): Finding[] {
  if (!file.endsWith('.svelte')) return [];
  if (file.includes('.test.') || file.includes('/dev/')) return [];
  const markup = text.split(/<style\b/)[0] ?? text;
  const out: Finding[] = [];
  const re = /\bclass\s*=\s*["'][^"']*\bglass-panel\b[^"']*["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markup)) !== null) {
    out.push({
      id: 'GLASS_PANEL_RESIDUAL',
      file,
      line: lineAt(markup, m.index),
      detail: 'glass-panel en markup — usar ledger-card',
    });
  }
  return out;
}

function scanBpZoo(file: string, text: string): Finding[] {
  if (file.includes('.test.') || file.includes('/dev/')) return [];
  const out: Finding[] = [];
  const re = /@media[^{]*(?:600|700|900)px/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({
      id: 'BP_ZOO',
      file,
      line: lineAt(text, m.index),
      detail: `${m[0].trim()} — usar 719 (--bp-compact) o 899 (--bp-chrome)`,
    });
  }
  return out;
}

function scanShellInShellCaja(): Finding[] {
  const out: Finding[] = [];
  for (const rel of ['routes/caja/+page.svelte', 'routes/caja/handoff/+page.svelte'] as const) {
    const text = readFileSync(join(POS_SRC, rel), 'utf8');
    const markup = text.split(/<style\b/)[0] ?? text;
    if (!/\bpage-shell\b/.test(markup)) {
      out.push({
        id: 'SHELL_IN_SHELL_CAJA',
        file: rel,
        line: 1,
        detail: 'debe usar page-shell',
      });
    }
    if (/\b(caja-page-container|handoff-page-container)\b/.test(markup)) {
      out.push({
        id: 'SHELL_IN_SHELL_CAJA',
        file: rel,
        line: 1,
        detail: 'contenedor *-page-container legacy (shell-in-shell)',
      });
    }
    if (/\bglass-panel\b/.test(markup)) {
      out.push({
        id: 'SHELL_IN_SHELL_CAJA',
        file: rel,
        line: 1,
        detail: 'glass-panel en caja/handoff — usar ledger-card',
      });
    }
  }
  return out;
}

function scanHandoffNavGated(): Finding[] {
  const nav = readFileSync(join(POS_SRC, 'lib/ui/CashierBottomNav.svelte'), 'utf8');
  const out: Finding[] = [];
  if (!/isShiftHandoffEnabled/.test(nav)) {
    out.push({
      id: 'HANDOFF_NAV_GATED',
      file: 'lib/ui/CashierBottomNav.svelte',
      line: 1,
      detail: 'debe gatear handoff con isShiftHandoffEnabled',
    });
  }
  if (!/\/caja\/handoff/.test(nav) || !/pos-nav-handoff/.test(nav)) {
    out.push({
      id: 'HANDOFF_NAV_GATED',
      file: 'lib/ui/CashierBottomNav.svelte',
      line: 1,
      detail: 'link /caja/handoff (pos-nav-handoff) ausente',
    });
  }
  if (!/\{#if\s+handoffOn\}/.test(nav) && !/\{#if\s+.*[Hh]andoff/.test(nav)) {
    out.push({
      id: 'HANDOFF_NAV_GATED',
      file: 'lib/ui/CashierBottomNav.svelte',
      line: 1,
      detail: 'tab handoff debe estar detrás de {#if handoffOn}',
    });
  }
  return out;
}

function collectP0(): Finding[] {
  const findings: Finding[] = [];
  for (const abs of walk(POS_SRC)) {
    const file = relative(POS_SRC, abs);
    const text = readFileSync(abs, 'utf8');
    findings.push(
      ...scanCardPadOverride(file, text),
      ...scanBreakpoints(file, text),
      ...scanNestedSectionPad(file, text),
      ...scanCardPad125(file, text),
      ...scanCardPad15(file, text),
      ...scanBlurOnCard(file, text),
      ...scanGlassNoPad(file, text),
      ...scanGlassResidual(file, text),
      ...scanBpZoo(file, text),
      ...scanAmberWarning(file, text),
    );
  }

  const layout = readFileSync(join(POS_SRC, 'routes/+layout.svelte'), 'utf8');
  if (!/CashierBottomNav|data-testid="pos-bottom-nav"/.test(layout)) {
    findings.push({
      id: 'CASHIER_NAV',
      file: 'routes/+layout.svelte',
      line: 1,
      detail: 'CashierBottomNav debe montarse en +layout',
    });
  }

  findings.push(
    ...scanBadgeClone(),
    ...scanOwnerBottomSafe(),
    ...scanOwnerOrphanRoutes(),
    ...scanShellInShellCaja(),
    ...scanHandoffNavGated(),
  );

  return findings;
}

describe('POS density smells P0 ratchet', () => {
  it('cero smells P0 density / owner / badge / cashier-nav', () => {
    const hits = collectP0();
    expect(hits, hits.map((h) => `[${h.id}] ${h.file}:${h.line} ${h.detail}`).join('\n')).toEqual(
      [],
    );
  });
});
