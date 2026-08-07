import { describe, expect, it } from 'vitest';
import { resolvePosTerminalConfig } from './resolve-pos-terminal.js';
import type { D1Bound, D1DatabaseLike, D1Result } from './index.js';

function okResult<T>(results: readonly T[] = []): D1Result<T> {
  return { results, success: true, meta: {} };
}

function mockDb(
  row: {
    id: string;
    paper_width_mm: number;
    line_width: number;
    printer_strategy: string;
  } | null,
): D1DatabaseLike {
  return {
    prepare() {
      const stmt = {
        bind() {
          return stmt;
        },
        first: <T>() => Promise.resolve(row as T | null),
        all: <T>() => Promise.resolve(okResult([] as T[])),
        run: () => Promise.resolve(okResult()),
      };
      return stmt;
    },
    batch: (stmts: readonly D1Bound[]) => Promise.resolve(stmts.map(() => okResult())),
  };
}

describe('resolve-pos-terminal', () => {
  it('resuelve 80mm → lineWidth 48', async () => {
    const cfg = await resolvePosTerminalConfig(
      mockDb({
        id: 't1',
        paper_width_mm: 80,
        line_width: 48,
        printer_strategy: 'webusb',
      }),
      'ten',
      'br',
      't1',
    );
    expect(cfg?.paperWidthMm).toBe(80);
    expect(cfg?.lineWidth).toBe(48);
  });

  it('null si no hay terminal', async () => {
    const cfg = await resolvePosTerminalConfig(mockDb(null), 'ten', 'br');
    expect(cfg).toBeNull();
  });
});
