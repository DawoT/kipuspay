import { describe, expect, it, vi } from 'vitest';
import { buildRig } from './quipu.js';
import { createSim } from './quipu-sim.js';
import { drawBackdrop, drawSim } from './quipu-draw.js';

function mockCtx() {
  const calls: string[] = [];
  const ctx = {
    calls,
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    scale: () => calls.push('scale'),
    clearRect: () => calls.push('clear'),
    fillRect: () => calls.push('fillRect'),
    beginPath: () => calls.push('begin'),
    moveTo: () => calls.push('move'),
    lineTo: () => calls.push('line'),
    stroke: () => calls.push('stroke'),
    translate: () => calls.push('translate'),
    rotate: () => calls.push('rotate'),
    createRadialGradient: () => ({
      addColorStop: () => undefined,
    }),
    createLinearGradient: () => ({
      addColorStop: () => undefined,
    }),
    set fillStyle(_v: string) {
      calls.push('fillStyle');
    },
    set strokeStyle(_v: string) {
      calls.push('strokeStyle');
    },
    set lineWidth(_v: number) {
      calls.push('lineWidth');
    },
    set lineCap(_v: string) {
      calls.push('lineCap');
    },
    set lineJoin(_v: string) {
      calls.push('lineJoin');
    },
    set globalAlpha(_v: number) {
      calls.push('alpha');
    },
  };
  return ctx as unknown as CanvasRenderingContext2D & { calls: string[] };
}

const RIG = buildRig(
  [
    { slug: 'restaurantes', value: 342 },
    { slug: 'farmacias', value: 213 },
  ],
  { originX: 100, originY: 40, spacing: 80, length: 400, drift: 12 },
);

describe('quipu-draw', () => {
  it('drawBackdrop pinta tinta cuando no es transparente', () => {
    const ctx = mockCtx();
    drawBackdrop(ctx, {
      width: 800,
      height: 600,
      viewW: 1440,
      viewH: 900,
    });
    expect(ctx.calls).toContain('clear');
    expect(ctx.calls).toContain('fillRect');
  });

  it('drawBackdrop solo limpia cuando transparent (video debajo)', () => {
    const ctx = mockCtx();
    drawBackdrop(ctx, {
      width: 800,
      height: 600,
      viewW: 1440,
      viewH: 900,
      transparent: true,
    });
    expect(ctx.calls).toEqual(['clear']);
  });

  it('drawSim traza el cordel principal y al menos un cordel', () => {
    const ctx = mockCtx();
    const sim = createSim(RIG);
    drawSim(ctx, sim, RIG, {
      width: 800,
      height: 600,
      viewW: 1440,
      viewH: 900,
      activeCord: 'restaurantes',
    });
    expect(ctx.calls.filter((c) => c === 'stroke').length).toBeGreaterThan(2);
    expect(ctx.calls).toContain('save');
    expect(ctx.calls).toContain('restore');
  });

  it('drawSim penumbra el cordel que no esta activo', () => {
    const spy = vi.fn();
    const ctx = mockCtx();
    Object.defineProperty(ctx, 'globalAlpha', {
      set(v: number) {
        spy(v);
      },
    });
    drawSim(ctx, createSim(RIG), RIG, {
      width: 800,
      height: 600,
      viewW: 1440,
      viewH: 900,
      activeCord: 'restaurantes',
    });
    expect(spy.mock.calls.some(([a]) => a === 0.26)).toBe(true);
  });
});
