import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../../routes/owner/asistente/+page.svelte', import.meta.url),
  'utf8',
);

describe('Sprint 49 assistant UI contract (GREEN)', () => {
  it('gates detrás de OWNER_MODE y AGENTIC_INSIGHTS', () => {
    expect(source).toContain('isOwnerModeEnabled()');
    expect(source).toContain('isAgenticInsightsEnabled()');
    expect(source).toContain('FEATURE_ANALYTICS_AGENTIC_INSIGHTS off');
  });

  it('briefing con banner de antigüedad, nunca en vivo', () => {
    expect(source).toContain('data-testid="briefing-stale"');
    expect(source).toContain('Datos del {briefing.reportDate}');
    expect(source).toContain('data-testid="briefing-missing"');
  });

  it('chat honesto: el servidor calcula, no es IA que opina', () => {
    expect(source).toContain('El servidor calcula los números; no es una IA que opina.');
    expect(source).toContain('data-testid="assistant-question"');
    expect(source).toContain('data-testid="assistant-ask"');
    expect(source).toContain('data-testid="assistant-answer"');
    expect(source).not.toMatch(/inteligencia artificial/i);
  });

  it('accesible: aria-live, alert, 44px y reduced-motion', () => {
    expect(source).toMatch(/aria-live="polite"/);
    expect(source).toMatch(/role="alert"/);
    expect(source).toMatch(/role="status"/);
    expect(source).toMatch(/min-height: 44px/);
    expect(source).toMatch(/prefers-reduced-motion/);
  });
});
