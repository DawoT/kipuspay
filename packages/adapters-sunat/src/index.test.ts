import { describe, expect, it } from 'vitest';
import { applyCdrToSaleStatus, classifySunatResponse, createMockPseTransport } from './index.js';

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
    expect(
      classifySunatResponse({
        httpStatus: 200,
        cdr: { cdrCode: '2324', cdrDescription: 'rej', accepted: false },
      }),
    ).toEqual({
      kind: 'rejected',
      cdr: { cdrCode: '2324', cdrDescription: 'rej', accepted: false },
    });
  });
});

describe('createMockPseTransport', () => {
  it('staging mock acepta XML y mapea ACCEPTED', async () => {
    const transport = createMockPseTransport();
    expect(transport.mode).toBe('MOCK_STAGING');
    const outcome = await transport.submit({
      tenantId: 't1',
      saleId: 's1',
      xml: '<Invoice/>',
      xmlHash: 'abc',
      documentType: '01',
    });
    expect(outcome.kind).toBe('accepted');
    expect(await applyCdrToSaleStatus(outcome)).toBe('ACCEPTED');
    expect(await applyCdrToSaleStatus({ kind: 'unreachable' })).toBe('QUARANTINED');
    expect(
      await applyCdrToSaleStatus({
        kind: 'rejected',
        cdr: { cdrCode: '1', cdrDescription: 'x', accepted: false },
      }),
    ).toBe('REJECTED');
    expect(
      (
        await transport.submit({
          tenantId: 't1',
          saleId: 's1',
          xml: '   ',
          xmlHash: 'x',
          documentType: '01',
        })
      ).kind,
    ).toBe('unreachable');
    const cdr = await transport.queryCdr('ticket');
    expect(cdr.accepted).toBe(true);
  });
});
