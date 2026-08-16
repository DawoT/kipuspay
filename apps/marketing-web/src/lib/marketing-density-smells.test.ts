import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const APP_CSS = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
const COMPARE = readFileSync(new URL('../routes/comparar/+page.svelte', import.meta.url), 'utf8');
const HOME = readFileSync(new URL('../routes/+page.svelte', import.meta.url), 'utf8');

describe('marketing density smells P0', () => {
  it('INSET_TOKENS_MISSING: density kit en :root', () => {
    expect(APP_CSS).toMatch(/--inset-section-x:/);
    expect(APP_CSS).toMatch(/--inset-card:/);
    expect(APP_CSS).toMatch(/--bp-compact:\s*719px/);
    expect(APP_CSS).toMatch(/--bp-chrome:\s*899px/);
    expect(APP_CSS).toMatch(/--sticky-cta-clearance:/);
  });

  it('STICKY_NO_CLEARANCE: past-hero despeja #contenido', () => {
    expect(APP_CSS).toMatch(
      /\.site-header\.past-hero\s*~\s*#contenido\s*\{[^}]*padding-bottom:\s*var\(--sticky-cta-clearance\)/,
    );
  });

  it('HOVER_LIFT: post-card sin translateY', () => {
    const hover = APP_CSS.match(/\.post-card:hover[\s\S]*?\{([^}]*)\}/)?.[1] ?? '';
    expect(hover).not.toMatch(/translateY\s*\(/);
  });

  it('compare-intro fuera del hero fold', () => {
    const hero = COMPARE.match(/<section class="hero hero-compact">[\s\S]*?<\/section>/)?.[0] ?? '';
    expect(hero).not.toMatch(/compare-intro/);
    expect(COMPARE).toMatch(/class="compare-intro lead"/);
  });

  it('BP_TOKENS_UNUSED: media queries usan 719/899', () => {
    expect(APP_CSS).toMatch(/@media[^{]*(?:719|899)px/);
    expect(APP_CSS).not.toMatch(/@media[^{]*(?:640|720|800|900|1024)px/);
  });

  it('SPLIT_CARD_HOME: offline sin split-card/kipus-card', () => {
    const offline = HOME.match(/data-testid="offline-section"[\s\S]*?<\/section>/)?.[0] ?? '';
    expect(offline).toMatch(/offline-row/);
    expect(offline).not.toMatch(/split-card|kipus-card/);
  });
});
