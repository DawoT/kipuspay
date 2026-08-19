import { describe, expect, it } from 'vitest';
import { createHttpRcCdrPort } from './http-rc-cdr-port.js';
import type { FetchLike } from './fiscal-transport.js';

function stubFetch(status: number, body: unknown): FetchLike {
  return () =>
    Promise.resolve(
      typeof body === 'string'
        ? new Response(body, { status })
        : new Response(JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
          }),
    );
}

const input = {
  tenantId: 't1',
  summaryId: 'sum-1',
  xml: '<DailySummary tenant="t1" date="2026-08-04" tickets="3"/>',
};

describe('createHttpRcCdrPort (C6)', () => {
  it('200 con CDR aceptado → accepted true', async () => {
    const port = createHttpRcCdrPort({
      endpointUrl: 'https://pse.kipuspay.test/rc',
      fetchImpl: stubFetch(200, { cdrCode: '0', cdrDescription: 'ok', accepted: true }),
    });
    const cdr = await port.submit(input);
    expect(cdr.accepted).toBe(true);
    expect(cdr.cdrCode).toBe('0');
  });

  it('4xx → business reject (accepted false, no infra)', async () => {
    const port = createHttpRcCdrPort({
      endpointUrl: 'https://pse.kipuspay.test/rc',
      fetchImpl: stubFetch(422, { cdrCode: '2335', cdrDescription: 'reject' }),
    });
    const cdr = await port.submit(input);
    expect(cdr.accepted).toBe(false);
    expect(cdr.cdrCode).toBe('422');
  });

  it('5xx → PSE unreachable (accepted false, se reintenta)', async () => {
    const port = createHttpRcCdrPort({
      endpointUrl: 'https://pse.kipuspay.test/rc',
      fetchImpl: stubFetch(503, {}),
    });
    const cdr = await port.submit(input);
    expect(cdr.accepted).toBe(false);
    expect(cdr.cdrMessage).toBe('PSE unreachable');
  });

  it('network error → accepted false (fail-closed)', async () => {
    const port = createHttpRcCdrPort({
      endpointUrl: 'https://pse.kipuspay.test/rc',
      fetchImpl: () => Promise.reject(new Error('net')),
    });
    const cdr = await port.submit(input);
    expect(cdr.accepted).toBe(false);
    expect(cdr.cdrMessage).toBe('PSE unreachable');
  });

  it('200 sin accepted true → fail-closed (nunca afirma CDR)', async () => {
    const port = createHttpRcCdrPort({
      endpointUrl: 'https://pse.kipuspay.test/rc',
      fetchImpl: stubFetch(200, { cdrCode: '0', cdrDescription: 'ok' }),
    });
    const cdr = await port.submit(input);
    expect(cdr.accepted).toBe(false);
    expect(cdr.cdrCode).toBe('0');
  });

  it('200 accepted true sin cdrCode → fail-closed', async () => {
    const port = createHttpRcCdrPort({
      endpointUrl: 'https://pse.kipuspay.test/rc',
      fetchImpl: stubFetch(200, { accepted: true, cdrDescription: 'ok' }),
    });
    const cdr = await port.submit(input);
    expect(cdr.accepted).toBe(false);
  });

  it('200 cuerpo vacío → fail-closed', async () => {
    const port = createHttpRcCdrPort({
      endpointUrl: 'https://pse.kipuspay.test/rc',
      fetchImpl: stubFetch(200, {}),
    });
    const cdr = await port.submit(input);
    expect(cdr.accepted).toBe(false);
  });

  it('XML vacío → accepted false sin llamar al endpoint', async () => {
    let calls = 0;
    const port = createHttpRcCdrPort({
      endpointUrl: 'https://pse.kipuspay.test/rc',
      fetchImpl: () => {
        calls += 1;
        return Promise.resolve(new Response('{}', { status: 200 }));
      },
    });
    const cdr = await port.submit({ ...input, xml: '   ' });
    expect(cdr.accepted).toBe(false);
    expect(cdr.cdrCode).toBe('99');
    expect(calls).toBe(0);
  });
});
