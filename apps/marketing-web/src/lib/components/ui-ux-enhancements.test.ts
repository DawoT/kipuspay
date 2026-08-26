import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HOME } from '../content/home.js';

const HERO_COMPONENT = readFileSync(new URL('../brand/QuipuHero.svelte', import.meta.url), 'utf8');
const ICON_COMPONENT = readFileSync(new URL('./Icon.svelte', import.meta.url), 'utf8');
const APP_CSS = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');
const LAYOUT_SVELTE = readFileSync(new URL('../../routes/+layout.svelte', import.meta.url), 'utf8');
const HOME_PAGE = readFileSync(new URL('../../routes/+page.svelte', import.meta.url), 'utf8');
const SEGURIDAD_PAGE = readFileSync(
  new URL('../../routes/seguridad/+page.svelte', import.meta.url),
  'utf8',
);

describe('Auditoría y Corrección UI/UX — Marketing Web', () => {
  describe('1. Reproducción de Video Hero (QuipuHero.svelte)', () => {
    it('declara todos los atributos requeridos para autoplay universal', () => {
      expect(HERO_COMPONENT).toContain('autoplay');
      expect(HERO_COMPONENT).toContain('muted');
      expect(HERO_COMPONENT).toContain('loop');
      expect(HERO_COMPONENT).toContain('playsinline');
      expect(HERO_COMPONENT).toContain('webkit-playsinline');
      expect(HERO_COMPONENT).toContain('preload="auto"');
    });

    it('asigna muted y defaultMuted en $effect para políticas de Safari/Chromium', () => {
      expect(HERO_COMPONENT).toMatch(/el\.muted\s*=\s*true/);
      expect(HERO_COMPONENT).toMatch(/el\.defaultMuted\s*=\s*true/);
      expect(HERO_COMPONENT).toMatch(/el\.play\(\)\.catch\(/);
    });

    it('integra IntersectionObserver para reanudar/pausar según visibilidad en viewport', () => {
      expect(HERO_COMPONENT).toContain('new IntersectionObserver');
      expect(HERO_COMPONENT).toContain('entry.isIntersecting');
      expect(HERO_COMPONENT).toContain('el.pause()');
      expect(HERO_COMPONENT).toContain('io.disconnect()');
    });

    it('respeta prefers-reduced-motion antes de iniciar reproducción', () => {
      expect(HERO_COMPONENT).toContain('prefers-reduced-motion: reduce');
    });
  });

  describe('2. Reemplazo de Emojis por Íconos SVG Vectoriales de Alta Calidad', () => {
    it('HOME.heroBadges utiliza identificadores limpios en lugar de emojis', () => {
      const badgeIcons = HOME.heroBadges.map((b) => b.icon);
      expect(badgeIcons).toEqual(['lightning', 'smartphone', 'shield-check', 'sync']);

      // Cero emojis en las definiciones de badges
      const blob = JSON.stringify(HOME.heroBadges);
      const bannedEmojis = ['⚡', '📱', '🇵🇪', '🔄', '🛒', '✅', '📤', '🏛️', '📄'];
      for (const emoji of bannedEmojis) {
        expect(blob).not.toContain(emoji);
      }
    });

    it('+page.svelte importa y renderiza el componente Icon para hero-badges', () => {
      expect(HOME_PAGE).toContain("import Icon from '$lib/components/Icon.svelte'");
      expect(HOME_PAGE).toMatch(/<Icon\s+name=\{badge\.icon\}/);
    });

    it('seguridad/+page.svelte FLOW_STEPS utiliza identificadores SVG limpios', () => {
      expect(SEGURIDAD_PAGE).toContain("icon: 'cart'");
      expect(SEGURIDAD_PAGE).toContain("icon: 'shield-check'");
      expect(SEGURIDAD_PAGE).toContain("icon: 'cloud-upload'");
      expect(SEGURIDAD_PAGE).toContain("icon: 'institution'");
      expect(SEGURIDAD_PAGE).toContain("icon: 'document'");

      // Cero emojis en FLOW_STEPS
      const flowSection = SEGURIDAD_PAGE.match(/const FLOW_STEPS[\s\S]*?\] as const;/)?.[0] ?? '';
      const bannedEmojis = ['🛒', '✅', '📤', '🏛️', '📄', '⚡', '📱', '🇵🇪', '🔄'];
      for (const emoji of bannedEmojis) {
        expect(flowSection).not.toContain(emoji);
      }
    });

    it('seguridad/+page.svelte importa y renderiza el componente Icon en trust-flow', () => {
      expect(SEGURIDAD_PAGE).toContain("import Icon from '$lib/components/Icon.svelte'");
      expect(SEGURIDAD_PAGE).toMatch(/<Icon\s+name=\{step\.icon\}/);
    });

    it('Icon.svelte implementa las figuras geométricas con aria-hidden="true"', () => {
      expect(ICON_COMPONENT).toContain('aria-hidden="true"');
      expect(ICON_COMPONENT).toContain('viewBox="0 0 24 24"');
      expect(ICON_COMPONENT).toContain('stroke="currentColor"');
      expect(ICON_COMPONENT).toContain("name === 'lightning'");
      expect(ICON_COMPONENT).toContain("name === 'smartphone'");
      expect(ICON_COMPONENT).toContain("name === 'shield-check'");
      expect(ICON_COMPONENT).toContain("name === 'sync'");
      expect(ICON_COMPONENT).toContain("name === 'cart'");
      expect(ICON_COMPONENT).toContain("name === 'cloud-upload'");
      expect(ICON_COMPONENT).toContain("name === 'institution'");
      expect(ICON_COMPONENT).toContain("name === 'document'");
    });
  });

  describe('3. Visibilidad Continua del Header Sticky', () => {
    it('.site-header tiene z-index: 100, fondo protector oscuro, blur y sombra', () => {
      expect(APP_CSS).toMatch(/\.site-header\s*\{[\s\S]*?z-index:\s*100;/);
      expect(APP_CSS).toMatch(
        /\.site-header\s*\{[\s\S]*?background:\s*rgba\(20,\s*22,\s*28,\s*0\.94\);/,
      );
      expect(APP_CSS).toMatch(/\.site-header\s*\{[\s\S]*?backdrop-filter:\s*blur\(12px\);/);
      expect(APP_CSS).toMatch(
        /\.site-header\s*\{[\s\S]*?border-bottom:\s*1px solid rgba\(243,\s*239,\s*230,\s*0\.1\);/,
      );
      expect(APP_CSS).toMatch(
        /\.site-header\s*\{[\s\S]*?box-shadow:\s*0 4px 20px rgba\(0,\s*0,\s*0,\s*0\.35\);/,
      );
    });
  });

  describe('4. Alineación y Formato de Correos en el Footer', () => {
    it('.footer-channels tiene alineación centrada max-width: 72rem y borde superior punteado', () => {
      expect(APP_CSS).toMatch(/\.footer-channels\s*\{[\s\S]*?max-width:\s*72rem;/);
      expect(APP_CSS).toMatch(/\.footer-channels\s*\{[\s\S]*?margin:\s*1\.4rem auto 0;/);
      expect(APP_CSS).toMatch(/\.footer-channels\s*\{[\s\S]*?padding:\s*0\.8rem 0 0;/);
      expect(APP_CSS).toMatch(
        /\.footer-channels\s*\{[\s\S]*?border-top:\s*1px dashed rgba\(243,\s*239,\s*230,\s*0\.1\);/,
      );
    });

    it('.footer-channels a define enlaces con hover ámbar', () => {
      expect(APP_CSS).toMatch(/\.footer-channels a\s*\{[\s\S]*?display:\s*inline;/);
      expect(APP_CSS).toMatch(
        /\.footer-channels a:hover\s*\{[\s\S]*?color:\s*var\(--amber-bright\);/,
      );
    });

    it('+layout.svelte renderiza enlaces mailto accesibles para todos los canales oficiales', () => {
      const channels = ['contacto', 'soporte', 'facturacion', 'privacidad'];
      for (const ch of channels) {
        expect(LAYOUT_SVELTE).toContain(`mailto:{OFFICIAL_CHANNELS.${ch}}`);
      }
    });
  });
});
