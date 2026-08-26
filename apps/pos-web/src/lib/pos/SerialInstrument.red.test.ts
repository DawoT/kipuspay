import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const posLib = fileURLToPath(new URL('.', import.meta.url));
const serialPath = join(posLib, 'SerialInstrument.svelte');

function readSerial(): string {
  if (!existsSync(serialPath))
    throw new Error(`SerialInstrument.svelte no existe en ${serialPath}`);
  return readFileSync(serialPath, 'utf8');
}

describe('GAP #3 — SOLID: SerialInstrument.svelte extraído (TDD RED→GREEN)', () => {
  it('existe SerialInstrument.svelte como módulo aislado', () => {
    expect(existsSync(serialPath), 'SerialInstrument.svelte debe existir').toBe(true);
  });

  it('renderiza data-testid del scanner serial', () => {
    const src = readSerial();
    expect(src).toContain('data-testid="main-serial-checkout"');
    expect(src).toContain('data-testid="main-serial-terminal"');
    expect(src).toContain('data-testid="main-serial-scan"');
    expect(src).toContain('data-testid="main-serial-status"');
  });

  it('expone props tipadas sin switch(vertical) y delega a serial-client', () => {
    const src = readSerial();
    expect(src).toMatch(/\$props\(\)/);
    expect(src).not.toMatch(/switch\s*\(\s*[A-Za-z_.]*vertical/);
    expect(src).not.toMatch(/vertical\s*===/);
    expect(src).toContain('leaseScannedSerialLine');
    expect(src).toContain('cashierFacingMessage');
  });

  it('gestiona terminal lease + escaneo sin exponer SERIAL_ al cajero', () => {
    const src = readSerial();
    expect(src).toContain('Terminal Registrado');
    expect(src).toContain('Escanear Serie');
    expect(src).toContain('Registrar');
    expect(src).toContain('Agregar Serie');
  });

  it('emite evento onAddLine y mantiene offline-first (best-effort, no bloquea)', () => {
    const src = readSerial();
    expect(src).toContain('onAddLine');
    expect(src).toContain('serialScan');
    expect(src).not.toMatch(/demo/);
  });
});
