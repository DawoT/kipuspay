import { describe, expect, it } from 'vitest';
import { isD1Success, type D1Result } from './index.js';

describe('isD1Success', () => {
  it('true con D1Result.success', () => {
    const result: D1Result<unknown> = { results: [], success: true, meta: {} };
    expect(isD1Success(result)).toBe(true);
  });

  it('false cuando D1 falla', () => {
    const result: D1Result<unknown> = { results: [], success: false, meta: {} };
    expect(isD1Success(result)).toBe(false);
  });
});
