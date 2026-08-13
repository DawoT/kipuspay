import { afterEach, describe, expect, it, vi } from 'vitest';
import { playSaleSuccessFeedback, supportsSaleFeedback } from './feedback.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('feedback sensorial de venta (GTM §6.5, F4)', () => {
  it('detecta soporte sin reventar en node (sin AudioContext)', () => {
    expect(supportsSaleFeedback()).toBe(false);
  });

  it('reproduce beep + vibración cuando hay soporte', () => {
    const vibrate = vi.fn();
    const oscillator = { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), frequency: { setValueAtTime: vi.fn() }, type: '' };
    const gain = { connect: vi.fn(), gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, disconnect: vi.fn() };
    const audioCtx = {
      currentTime: 0,
      createOscillator: () => oscillator,
      createGain: () => gain,
      destination: {},
    };
    vi.stubGlobal('AudioContext', vi.fn(function () { return audioCtx; }));
    vi.stubGlobal('navigator', { vibrate });
    expect(supportsSaleFeedback()).toBe(true);
    playSaleSuccessFeedback();
    expect(oscillator.start).toHaveBeenCalled();
    expect(vibrate).toHaveBeenCalledWith([40, 60, 40]);
  });

  it('no revienta sin navigator.vibrate (solo beep)', () => {
    const oscillator = { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), frequency: { setValueAtTime: vi.fn() }, type: '' };
    const gain = { connect: vi.fn(), gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, disconnect: vi.fn() };
    vi.stubGlobal('AudioContext', vi.fn(function () {
      return {
        currentTime: 0,
        createOscillator: () => oscillator,
        createGain: () => gain,
        destination: {},
      };
    }));
    vi.stubGlobal('navigator', {});
    expect(() => playSaleSuccessFeedback()).not.toThrow();
  });
});
