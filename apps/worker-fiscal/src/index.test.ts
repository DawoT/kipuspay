import { describe, expect, it } from 'vitest';
import worker, { cdrVerdict, submitViaMockPse } from './index.js';

describe('cdrVerdict', () => {
  it('aceptada solo con CDR válido', () => {
    expect(cdrVerdict({ cdrCode: '0', cdrDescription: 'ok', accepted: true })).toBe('aceptada');
    expect(cdrVerdict({ cdrCode: '2335', cdrDescription: 'no', accepted: false })).toBe(
      'rechazada',
    );
  });
});

describe('submitViaMockPse', () => {
  it('mock PSE staging → aceptada / ACCEPTED', async () => {
    const result = await submitViaMockPse({
      tenantId: 't1',
      saleId: 's1',
      xml: '<Invoice/>',
      xmlHash: 'abc',
      documentType: '01',
    });
    expect(result).toEqual({ verdict: 'aceptada', sunatStatus: 'ACCEPTED' });
  });
});

describe('worker fetch', () => {
  it('POST /cdr y /v1/fiscal/submit; 404 else', async () => {
    const cdr = await worker.fetch(
      new Request('https://fiscal.local/cdr', {
        method: 'POST',
        body: JSON.stringify({ cdrCode: '0', cdrDescription: 'ok', accepted: true }),
      }),
    );
    expect(cdr.status).toBe(200);
    expect(await cdr.json()).toEqual({ verdict: 'aceptada' });

    const submit = await worker.fetch(
      new Request('https://fiscal.local/v1/fiscal/submit', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: 't1',
          saleId: 's1',
          xml: '<Invoice/>',
          xmlHash: 'h',
          documentType: '01',
        }),
      }),
    );
    expect(submit.status).toBe(200);
    expect(await submit.json()).toEqual({ verdict: 'aceptada', sunatStatus: 'ACCEPTED' });

    const miss = await worker.fetch(new Request('https://fiscal.local/nope'));
    expect(miss.status).toBe(404);
  });
});
