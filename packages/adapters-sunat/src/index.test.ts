import { describe, expect, it } from 'vitest';
import { classifySunatResponse } from './index.js';

describe('classifySunatResponse', () => {
  it('acepta solo HTTP 200 con CDR accepted', () => {
    expect(
      classifySunatResponse({
        httpStatus: 200,
        cdr: { cdrCode: '0', cdrDescription: 'ok', accepted: true },
      }),
    ).toEqual({ kind: 'accepted', cdr: { cdrCode: '0', cdrDescription: 'ok', accepted: true } });
    expect(
      classifySunatResponse({
        httpStatus: 503,
        cdr: { cdrCode: '0', cdrDescription: 'x', accepted: true },
      }),
    ).toEqual({ kind: 'unreachable' });
  });
});
