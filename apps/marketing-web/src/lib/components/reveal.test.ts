import { afterEach, describe, expect, it, vi } from 'vitest';
import { reveal } from './reveal.js';

function fakeNode() {
  const classes = new Set<string>();
  return {
    classList: {
      add: (c: string) => classes.add(c),
      has: (c: string) => classes.has(c),
    },
  };
}

class FakeIO {
  static last: FakeIO | null = null;
  observed = 0;
  disconnected = 0;
  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeIO.last = this;
  }
  observe() {
    this.observed += 1;
  }
  disconnect() {
    this.disconnected += 1;
  }
  fire(entries: ReadonlyArray<{ isIntersecting: boolean }>) {
    this.callback(entries as IntersectionObserverEntry[], this as unknown as IntersectionObserver);
  }
}

describe('reveal action', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeIO.last = null;
  });

  it('SSR: sin window devuelve destroy vacío sin revelar', () => {
    const node = fakeNode();
    const { destroy } = reveal(node as unknown as HTMLElement);
    expect(node.classList.has('in')).toBe(false);
    expect(typeof destroy).toBe('function');
  });

  it('prefers-reduced-motion: visible al instante', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    const node = fakeNode();
    reveal(node as unknown as HTMLElement);
    expect(node.classList.has('in')).toBe(true);
  });

  it('scroll: marca in al intersectar y se desconecta', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal('IntersectionObserver', FakeIO);

    const node = fakeNode();
    const { destroy } = reveal(node as unknown as HTMLElement);

    const io = FakeIO.last;
    expect(io?.observed).toBe(1);
    io?.fire([{ isIntersecting: true }]);
    expect(node.classList.has('in')).toBe(true);
    expect(io?.disconnected).toBe(1);

    destroy();
    expect(io?.disconnected).toBe(2);
  });
});
