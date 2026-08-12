import { describe, expect, it } from 'vitest';
import {
  CHECKLIST_DISMISSED_KEY,
  computeSetupProgress,
  SETUP_STEPS,
  SETUP_STEP_IDS,
  type SetupServerState,
} from './checklist.js';

const ALL_DONE: SetupServerState = { logo: true, invoicing: true, team: true, catalog: true };

describe('Setup Checklist "segundo día" (regla 37a)', () => {
  it('5 pasos canónicos: logo, impresora, equipo, facturación, catálogo', () => {
    expect(SETUP_STEP_IDS).toEqual(['logo', 'printer', 'team', 'invoicing', 'catalog']);
    expect(Object.keys(SETUP_STEPS)).toHaveLength(5);
  });

  it('progreso parcial: server + impresora local', () => {
    const progress = computeSetupProgress(
      { logo: true, invoicing: false, team: true, catalog: false },
      false,
    );
    expect(progress.completedCount).toBe(2);
    expect(progress.total).toBe(5);
    expect(progress.percent).toBe(40);
    expect(progress.isComplete).toBe(false);
    expect(progress.nextStepId).toBe('printer');
  });

  it('la impresora se marca con estado LOCAL (printerReady)', () => {
    const without = computeSetupProgress({ ...ALL_DONE, logo: false }, true);
    const withPrinter = computeSetupProgress(ALL_DONE, true);
    expect(withPrinter.isComplete).toBe(true);
    expect(withPrinter.percent).toBe(100);
    expect(without.nextStepId).toBe('logo');
  });

  it('nunca bloquea: la caja no depende de la completitud', () => {
    const progress = computeSetupProgress(
      { logo: false, invoicing: false, team: false, catalog: false },
      false,
    );
    expect(progress.completedCount).toBe(0);
    expect(progress.percent).toBe(0);
    expect(progress.nextStepId).toBe('logo');
  });

  it('cada paso tiene copy sin jerga y acción navegable', () => {
    for (const id of SETUP_STEP_IDS) {
      const step = SETUP_STEPS[id];
      expect(step.title.length).toBeGreaterThan(5);
      expect(step.action.length).toBeGreaterThan(3);
      expect(`${step.title} ${step.hint}`).not.toMatch(/WebUSB|WSS|D1|PSE|SKU|batch|API|KV|cron/i);
    }
  });

  it('clave de persistencia local del nudge', () => {
    expect(CHECKLIST_DISMISSED_KEY).toBe('kipus:setup-checklist:dismissed');
  });
});
