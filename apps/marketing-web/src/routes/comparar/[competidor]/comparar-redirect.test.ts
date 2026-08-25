import { describe, expect, it } from 'vitest';
import { load } from './+page.js';

describe('comparar/[competidor] redirect (AUD-03)', () => {
  it('redirige correctamente según el parámetro competidor', () => {
    expect(() => load({ params: { competidor: 'alegra' } })).toThrow();
    try {
      load({ params: { competidor: 'alegra' } });
    } catch (err: unknown) {
      const redirectErr = err as { status: number; location: string };
      expect(redirectErr.status).toBe(301);
      expect(redirectErr.location).toBe('/comparar?vs=alegra');
    }

    try {
      load({ params: { competidor: 'siigo' } });
    } catch (err: unknown) {
      const redirectErr = err as { status: number; location: string };
      expect(redirectErr.status).toBe(301);
      expect(redirectErr.location).toBe('/comparar?vs=siigo');
    }

    try {
      load({ params: { competidor: 'bsale' } });
    } catch (err: unknown) {
      const redirectErr = err as { status: number; location: string };
      expect(redirectErr.status).toBe(301);
      expect(redirectErr.location).toBe('/comparar?vs=bsale');
    }
  });
});
