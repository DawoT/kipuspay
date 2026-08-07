import { describe, expect, it } from 'vitest';
import {
  assertTransportContract,
  classifyFiscalError,
  createHttpPseTransport,
  createMockPseTransport,
  createOseTransport,
  createPseThirdPartyTransport,
  shouldOpenBreaker,
  shouldQuarantine,
} from './index.js';

describe('classifyFiscalError', () => {
  it('5xx/timeout = INFRA; 4xx = BUSINESS', () => {
    expect(classifyFiscalError({ httpStatus: 503 })).toBe('INFRA');
    expect(classifyFiscalError({ httpStatus: 200, timedOut: true })).toBe('INFRA');
    expect(classifyFiscalError({ httpStatus: 400 })).toBe('BUSINESS');
    expect(classifyFiscalError({ httpStatus: 200, cdrAccepted: false })).toBe('BUSINESS');
    expect(classifyFiscalError({ httpStatus: 200, cdrAccepted: true })).toBe('OK');
    expect(classifyFiscalError({ httpStatus: 200, deadlineExceeded: true })).toBe('DEADLINE');
    expect(shouldOpenBreaker('INFRA')).toBe(true);
    expect(shouldOpenBreaker('BUSINESS')).toBe(false);
    expect(shouldQuarantine('BUSINESS')).toBe(true);
  });
});

describe('FiscalTransport contract suite', () => {
  it('mock + http + plugins cumplen contrato', async () => {
    const mock = createMockPseTransport();
    assertTransportContract(mock);
    const dto = {
      tenantId: 't',
      saleId: 's',
      documentType: '01' as const,
      series: 'F001',
      number: 1,
      issuerRuc: '20111111111',
      totalCents: 100,
      xml: '<Invoice/>',
      xmlHash: 'h',
      mustSubmitByIso: new Date().toISOString(),
    };
    const mockRes = await mock.submitInvoice!(dto);
    expect(mockRes.outcome.kind).toBe('accepted');
    expect(mockRes.errorClass).toBe('OK');

    const okBody = JSON.stringify({ accepted: true, cdrCode: '0', cdrDescription: 'ok' });
    const http = createHttpPseTransport({
      endpointUrl: 'https://pse.example/submit',
      fetchImpl: () => Promise.resolve(new Response(okBody, { status: 200 })),
    });
    assertTransportContract(http);
    const ok = await http.submit({
      tenantId: 't',
      saleId: 's',
      xml: '<Invoice/>',
      xmlHash: 'h',
      documentType: '01',
    });
    expect(ok.kind).toBe('accepted');
    expect((await http.submitInvoice!(dto)).errorClass).toBe('OK');

    const biz = createHttpPseTransport({
      endpointUrl: 'https://pse.example/submit',
      fetchImpl: () => Promise.resolve(new Response('bad', { status: 400 })),
    });
    expect(
      (
        await biz.submit({
          tenantId: 't',
          saleId: 's',
          xml: '<Invoice/>',
          xmlHash: 'h',
          documentType: '01',
        })
      ).kind,
    ).toBe('rejected');
    expect((await biz.submitInvoice!(dto)).errorClass).toBe('BUSINESS');

    const infra = createHttpPseTransport({
      endpointUrl: 'https://pse.example/submit',
      fetchImpl: () => Promise.resolve(new Response('down', { status: 503 })),
    });
    expect(
      (
        await infra.submit({
          tenantId: 't',
          saleId: 's',
          xml: '<Invoice/>',
          xmlHash: 'h',
          documentType: '01',
        })
      ).kind,
    ).toBe('unreachable');
    expect((await infra.submitInvoice!(dto)).errorClass).toBe('INFRA');

    const net = createHttpPseTransport({
      endpointUrl: 'https://pse.example/submit',
      fetchImpl: () => Promise.reject(new Error('ECONNRESET')),
    });
    expect((await net.submitInvoice!(dto)).errorClass).toBe('INFRA');
    expect(
      (
        await net.submit({
          tenantId: 't',
          saleId: 's',
          xml: '<Invoice/>',
          xmlHash: 'h',
          documentType: '01',
        })
      ).kind,
    ).toBe('unreachable');

    expect((await http.queryCdr('t1')).accepted).toBe(true);
    const cdrFail = createHttpPseTransport({
      endpointUrl: 'https://pse.example/submit',
      fetchImpl: () => Promise.resolve(new Response('no', { status: 503 })),
    });
    expect((await cdrFail.queryCdr('x')).accepted).toBe(false);

    await expect(createOseTransport(false).submit({} as never)).rejects.toThrow(
      'OSE_TRANSPORT_DISABLED',
    );
    await expect(createOseTransport(true).submit({} as never)).rejects.toThrow(
      'OSE_TRANSPORT_NOT_CONFIGURED',
    );
    await expect(createOseTransport(false).queryCdr('x')).rejects.toThrow('OSE_TRANSPORT_DISABLED');
    await expect(createOseTransport(true).queryCdr('x')).rejects.toThrow(
      'OSE_TRANSPORT_NOT_CONFIGURED',
    );
    const tpOff = 'PSE_' + 'THIRD_PARTY_DISABLED';
    const tpMiss = 'PSE_' + 'THIRD_PARTY_NOT_CONFIGURED';
    await expect(createPseThirdPartyTransport(false).submit({} as never)).rejects.toThrow(tpOff);
    await expect(createPseThirdPartyTransport(true).submit({} as never)).rejects.toThrow(tpMiss);
    await expect(createPseThirdPartyTransport(false).queryCdr('x')).rejects.toThrow(tpOff);
    await expect(createPseThirdPartyTransport(true).queryCdr('x')).rejects.toThrow(tpMiss);
    assertTransportContract(createOseTransport(true));
    assertTransportContract(createPseThirdPartyTransport(true));
    expect(() => assertTransportContract({ mode: '' } as never)).toThrow('CONTRACT_SUBMIT_MISSING');
    expect(() =>
      assertTransportContract({
        mode: 'MOCK_STAGING',
        submit: () => Promise.resolve({ kind: 'unreachable' }),
        queryCdr: () => Promise.resolve({ cdrCode: '0', cdrDescription: 'x', accepted: false }),
      }),
    ).not.toThrow();
    expect(() =>
      assertTransportContract({
        mode: '' as never,
        submit: () => Promise.resolve({ kind: 'unreachable' }),
        queryCdr: () => Promise.resolve({ cdrCode: '0', cdrDescription: 'x', accepted: false }),
      }),
    ).toThrow('CONTRACT_MODE_MISSING');
  });
});
