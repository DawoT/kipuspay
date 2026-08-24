import { describe, expect, it } from 'vitest';
import worker, { cdrVerdict, selectFiscalTransport, submitViaMockPse } from './index.js';
import { initialBreakerSnapshot } from '@kipuspay/domain-fiscal-pe';
import { readBreakerOpen, type BreakerKvLike } from './breaker-read-cache.js';
import type { FiscalWorkerEnv } from './index.js';

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
    expect(result).toEqual({
      verdict: 'aceptada',
      sunatStatus: 'ACCEPTED',
      cdrCode: '0',
      cdrDescription: 'Mock PSE staging accepted',
    });
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

  it('flag on SIN endpoint → MISCONFIGURED (nunca ACCEPTED)', async () => {
    const t = selectFiscalTransport({
      FEATURE_FISCAL_TRANSPORT_PLUGINS: '1',
    });
    expect(t.mode).toBe('MISCONFIGURED');
    const outcome = await t.submit({
      tenantId: 't1',
      saleId: 's1',
      xml: '<Invoice/>',
      xmlHash: 'abc',
      documentType: '01',
    });
    expect(outcome.kind).toBe('unreachable');
  });

  it('flag on + SOL → sunat_bill_beta (no POST JSON al PSE .invalid)', async () => {
    const urls: string[] = [];
    const bodies: string[] = [];
    const t = selectFiscalTransport({
      FEATURE_FISCAL_TRANSPORT_PLUGINS: '1',
      FISCAL_PSE_ENDPOINT_URL: 'https://pse.kipuspay.staging.invalid/fiscal',
      SUNAT_SOL_USER: '20612913251TESTUSER',
      SUNAT_SOL_PASSWORD: 'sol-pass-fixture',
      SUNAT_BILL_ENDPOINT_URL: 'https://e-beta.example.test/billService',
      FISCAL_PSE_FETCH: (url, init) => {
        urls.push(typeof url === 'string' ? url : 'bill');
        bodies.push(typeof init?.body === 'string' ? init.body : '');
        return Promise.resolve(new Response('gateway', { status: 503 }));
      },
    });
    expect(t.mode).toBe('sunat_bill_beta');
    const xml =
      '<Invoice><cbc:ID>F001-00000001</cbc:ID>' +
      '<cac:AccountingSupplierParty><cbc:ID>' +
      '20' +
      '612913251' +
      '</cbc:ID></cac:AccountingSupplierParty></Invoice>';
    await t.submit({
      tenantId: 't1',
      saleId: 's1',
      xml,
      xmlHash: 'h',
      documentType: '01',
    });
    expect(urls).toEqual(['https://e-beta.example.test/billService']);
    expect(bodies[0]).toContain('<ser:sendBill>');
    expect(urls[0]).not.toContain('pse.kipuspay.staging.invalid');
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

describe('breaker bootstrap en frío (Sello QA Batch I)', () => {
  it('KV vacío + DO abierto → 503 BREAKER_OPEN (fail-closed real)', async () => {
    const kv: BreakerKvLike = { get: () => Promise.resolve(null), put: async () => {} };
    const doStub = {
      fetch: () =>
        Promise.resolve(
          Response.json({ state: 'open', openedAtMs: Date.now(), infraFailures: 10 }),
        ),
    };
    const env = {
      FEATURE_FISCAL_CIRCUIT_BREAKER: '1',
      FISCAL_BREAKER_KV: kv,
      FISCAL_CIRCUIT_BREAKER_DO: {
        idFromName: () => 'breaker-do',
        get: () => doStub,
      },
    };
    expect(await readBreakerOpen(kv, 'KIPUSPAY_PSE_DIRECT', 'submit')).toBe(true);
    const res = await worker.fetch(
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
      env,
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'BREAKER_OPEN', code: 'BREAKER_OPEN' });
  });
  it('KV vacío + DO cerrado → el submit continúa y persiste "0"', async () => {
    const puts: string[] = [];
    const kv: BreakerKvLike = {
      get: () => Promise.resolve(null),
      put: (_key, value) => {
        puts.push(value);
        return Promise.resolve();
      },
    };
    const doStub = {
      fetch: () => Promise.resolve(Response.json(initialBreakerSnapshot())),
    };
    const env = {
      FEATURE_FISCAL_CIRCUIT_BREAKER: '1',
      FEATURE_FISCAL_TRANSPORT_PLUGINS: '1',
      FISCAL_PSE_ENDPOINT_URL: 'https://pse.kipuspay.test/submit',
      FISCAL_PSE_FETCH: () =>
        Promise.resolve(
          new Response(JSON.stringify({ cdrCode: '0', accepted: true }), { status: 200 }),
        ),
      FISCAL_BREAKER_KV: kv,
      FISCAL_CIRCUIT_BREAKER_DO: {
        idFromName: () => 'breaker-do',
        get: () => doStub,
      },
    };
    expect(await readBreakerOpen(kv, 'KIPUSPAY_PSE_DIRECT', 'submit')).toBe(true);
    const res = await worker.fetch(
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
      env,
    );
    expect(res.status).toBe(200);
    expect(puts).toContain('0');
  });
});

describe('drain con error de infraestructura (F-5 Sello QA Batch I)', () => {
  it('fallo del DB → 500 DRAIN_FAILED sin stack crudo', async () => {
    const env = {
      FEATURE_FISCAL_CIRCUIT_BREAKER: '1',
      FISCAL_BREAKER_KV: {
        get: () => Promise.resolve('0'),
        put: () => Promise.resolve(),
      },
      DB: {
        prepare: () => ({
          bind: () => ({
            run: () => Promise.reject(new Error('D1_ERROR: no such column: x')),
          }),
        }),
      },
      FISCAL_XML_R2: { get: () => Promise.resolve(null) },
    };
    const res = await worker.fetch(
      new Request('https://fiscal.local/v1/fiscal/drain', { method: 'POST' }),
      env as unknown as FiscalWorkerEnv,
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'DRAIN_FAILED', code: 'DRAIN_FAILED' });
    expect(JSON.stringify(body)).not.toContain('D1_ERROR');
  });

  it('FEATURE_FISCAL_CPE on + DB/R2 → drain no es FEATURE_OFF con breaker off', async () => {
    const bound = {
      bind(..._args: unknown[]) {
        void _args;
        return bound;
      },
      all: () => Promise.resolve({ results: [] }),
      run: () => Promise.resolve({ meta: { changes: 0 } }),
    };
    const env = {
      FEATURE_FISCAL_CPE: '1',
      FEATURE_FISCAL_CIRCUIT_BREAKER: '0',
      DB: { prepare: () => bound },
      FISCAL_XML_R2: { get: () => Promise.resolve(null), put: () => Promise.resolve() },
    };
    const res = await worker.fetch(
      new Request('https://fiscal.local/v1/fiscal/drain', { method: 'POST' }),
      env,
    );
    expect(res.status).toBe(200);
    const body: { processed?: number } = await res.json();
    expect(body.processed).toBe(0);
  });

  it('sin CPE ni breaker → drain FEATURE_OFF', async () => {
    const env = {
      FEATURE_FISCAL_CPE: '0',
      FEATURE_FISCAL_CIRCUIT_BREAKER: '0',
      DB: { prepare: () => ({ bind: () => ({ run: () => Promise.resolve() }) }) },
      FISCAL_XML_R2: { get: () => Promise.resolve(null) },
    };
    const res = await worker.fetch(
      new Request('https://fiscal.local/v1/fiscal/drain', { method: 'POST' }),
      env as unknown as FiscalWorkerEnv,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'FEATURE_OFF' });
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
    expect(await submit.json()).toEqual({
      verdict: 'aceptada',
      sunatStatus: 'ACCEPTED',
      cdrCode: '0',
      cdrDescription: 'Mock PSE staging accepted',
    });

    const miss = await worker.fetch(new Request('https://fiscal.local/nope'));
    expect(miss.status).toBe(404);

    const misconfigured = await worker.fetch(
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
      { FEATURE_FISCAL_TRANSPORT_PLUGINS: '1' },
    );
    expect(misconfigured.status).toBe(503);
    expect(await misconfigured.json()).toEqual({
      error: 'TRANSPORT_MISCONFIGURED',
      code: 'TRANSPORT_MISCONFIGURED',
    });
  });
});
