import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const POS_SRC = fileURLToPath(new URL('../..', import.meta.url));

type Finding = { id: string; file: string; line: number; detail: string };

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

function scanNestedSectionPad(file: string, text: string): Finding[] {
  if (!file.endsWith('.svelte')) return [];
  const markup = text.split(/<style\b/)[0] ?? text;
  const out: Finding[] = [];
  const insideInset: boolean[] = [];
  const re = /<\/?([A-Za-z][\w:-]*)((?:\s[^>]*)?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markup)) !== null) {
    const full = m[0];
    if (full.startsWith('<!--')) continue;
    const name = m[1];
    const isClose = full.startsWith('</');
    const selfClose =
      /\/>$/.test(full) ||
      /^(br|hr|img|input|meta|link|source|area|base|col|embed|wbr)$/i.test(name);

    if (isClose) {
      if (insideInset.length) insideInset.pop();
      continue;
    }

    const classAttr = full.match(/\bclass\s*=\s*["']([^"']*)["']/);
    const classes = classAttr ? classAttr[1].split(/\s+/).filter(Boolean) : [];
    const hasLedger = classes.includes('ledger-card');
    const hasSection = classes.includes('section-pad');
    const parentInset = insideInset.length > 0 && insideInset[insideInset.length - 1];

    if (hasSection && parentInset) {
      out.push({
        id: 'NESTED_SECTION_PAD',
        file,
        line: lineAt(markup, m.index),
        detail: 'section-pad anidado dentro de ledger-card/section-pad',
      });
    }

    if (!selfClose) {
      insideInset.push(parentInset || hasLedger || hasSection);
    }
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
    );
  }
  return findings;
}

describe('POS density smells P0 ratchet', () => {
  it('cero CARD_PAD_OVERRIDE / BP_768|480 / NESTED_SECTION_PAD', () => {
    const hits = collectP0();
    expect(hits, hits.map((h) => `[${h.id}] ${h.file}:${h.line} ${h.detail}`).join('\n')).toEqual(
      [],
    );
  });
});
