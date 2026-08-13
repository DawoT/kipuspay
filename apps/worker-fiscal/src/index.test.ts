import { describe, expect, it } from 'vitest';
import worker, { cdrVerdict, selectFiscalTransport, submitViaMockPse } from './index.js';

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

describe('F5-2: selectFiscalTransport (fail-closed sin mezcla)', () => {
  it('sin flag → MOCK_STAGING (compatibilidad local)', () => {
    const t = selectFiscalTransport({});
    expect(t.mode).toBe('MOCK_STAGING');
  });

  it('flag on + endpoint → KIPUSPAY_PSE_DIRECT (HTTP real)', () => {
    const t = selectFiscalTransport({
      FEATURE_FISCAL_TRANSPORT_PLUGINS: '1',
      FISCAL_PSE_ENDPOINT_URL: 'https://pse.kipuspay.test/submit',
    });
    expect(t.mode).toBe('KIPUSPAY_PSE_DIRECT');
  });

  it('flag on SIN endpoint → MOCK_STAGING documentado (no falla en local)', () => {
    const t = selectFiscalTransport({
      FEATURE_FISCAL_TRANSPORT_PLUGINS: '1',
    });
    expect(t.mode).toBe('MOCK_STAGING');
  });

  it('flag on + endpoint: el drain envía por HTTP real (fetchImpl spy)', async () => {
    const calls: string[] = [];
    const fetchImpl = (url: RequestInfo | URL) => {
      calls.push(typeof url === 'string' ? url : 'pse-submit');
      return Promise.resolve(
        new Response(JSON.stringify({ cdrCode: '0', accepted: true }), { status: 200 }),
      );
    };
    const t = selectFiscalTransport({
      FEATURE_FISCAL_TRANSPORT_PLUGINS: '1',
      FISCAL_PSE_ENDPOINT_URL: 'https://pse.kipuspay.test/submit',
      FISCAL_PSE_FETCH: fetchImpl,
    });
    const outcome = await t.submit({
      tenantId: 't1',
      saleId: 's1',
      xml: '<Invoice/>',
      xmlHash: 'abc',
      documentType: '01',
    });
    expect(calls).toEqual(['https://pse.kipuspay.test/submit']);
    expect(outcome.kind).toBe('accepted');
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
