import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const LAYOUT = readFileSync(new URL('../../routes/owner/+layout.svelte', import.meta.url), 'utf8');

describe('owner shell density (GTM §6.3 + Arquitectura §0.2.4)', () => {
  it('solo capa 28rem dentro del media query móvil', () => {
    const mediaIdx = LAYOUT.indexOf('@media (max-width: 719px)');
    expect(mediaIdx).toBeGreaterThan(-1);
    expect(LAYOUT.slice(0, mediaIdx)).not.toMatch(/max-width:\s*28rem/);
    expect(LAYOUT.slice(mediaIdx)).toMatch(/max-width:\s*28rem/);
  });

  it('en escritorio el cuerpo llega al page-shell', () => {
    expect(LAYOUT).toMatch(/\.owner-body[\s\S]*?max-width:\s*1280px/);
  });

  it('no duplica el rótulo Modo Dueño en el chrome', () => {
    expect(LAYOUT).not.toMatch(/<p class="mode">Modo Dueño<\/p>/);
  });
});
