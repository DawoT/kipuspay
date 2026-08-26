import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const posLib = fileURLToPath(new URL('.', import.meta.url));
const scalePath = join(posLib, 'ScaleInstrument.svelte');

function readScale(): string {
  if (!existsSync(scalePath)) throw new Error(`ScaleInstrument.svelte no existe en ${scalePath}`);
  return readFileSync(scalePath, 'utf8');
}

describe('GAP #3 — SOLID: ScaleInstrument.svelte extraído (TDD RED→GREEN)', () => {
  it('existe ScaleInstrument.svelte como módulo aislado', () => {
    expect(existsSync(scalePath), 'ScaleInstrument.svelte debe existir').toBe(true);
  });

  it('renderiza data-testid del instrumento balanza', () => {
    const src = readScale();
    expect(src).toContain('data-testid="scale-checkout"');
    expect(src).toContain('data-testid="scale-state"');
  });

  it('expone props tipadas sin switch(vertical) y delega a scale-client sin duplicar lógica', () => {
    const src = readScale();
    expect(src).toMatch(/\$props\(\)/);
    expect(src).not.toMatch(/switch\s*\(\s*[A-Za-z_.]*vertical/);
    expect(src).not.toMatch(/vertical\s*===/);
    // usa APIs vendorizadas + evaluación heartbeat existente, no lógica duplicada
    expect(src).toContain('scaleStateLabel');
    expect(src).toContain('evaluateScaleHeartbeat');
  });

  it('maneja WebHID + fallback manual sin exponer jerga al cajero', () => {
    const src = readScale();
    expect(src).toContain('createWebHidScale');
    expect(src).toContain('MANUAL_REQUIRED');
    expect(src).not.toMatch(/demo/);
    // copy visible sin jerga técnica
    expect(src).toContain('PESO NETO');
    expect(src).toContain('Conectar balanza');
  });

  it('emite evento de pesada y respeta contratos de peso (cents integer, no float)', () => {
    const src = readScale();
    expect(src).toContain('onAddLine');
    expect(src).toContain('weightMicrounits');
    expect(src).not.toMatch(/\.toFixed\s*\(/);
  });
});
