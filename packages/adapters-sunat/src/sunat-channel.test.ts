import { describe, expect, it } from 'vitest';
import {
  SUNAT_BETA_BILL_SERVICE_URL,
  SUNAT_PRODUCTION_BILL_SERVICE_URL,
  SunatChannelError,
  parseSunatBillChannel,
  resolveSunatBillEndpoint,
} from './sunat-channel.js';

describe('canal dual billService SUNAT (FL-2)', () => {
  it('URL oficial de producción CPE: exacta, HTTPS, dominio sunat.gob.pe', () => {
    expect(SUNAT_PRODUCTION_BILL_SERVICE_URL).toBe(
      'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService',
    );
    const parsed = new URL(SUNAT_PRODUCTION_BILL_SERVICE_URL);
    expect(parsed.protocol).toBe('https:');
    expect(parsed.hostname).toBe('e-factura.sunat.gob.pe');
    expect(SUNAT_PRODUCTION_BILL_SERVICE_URL).not.toContain('.invalid');
    expect(SUNAT_PRODUCTION_BILL_SERVICE_URL).not.toContain('example');
  });

  it('parseSunatBillChannel: default staging; production explícito; basura → error tipado', () => {
    expect(parseSunatBillChannel(undefined)).toBe('staging');
    expect(parseSunatBillChannel('staging')).toBe('staging');
    expect(parseSunatBillChannel(' staging ')).toBe('staging');
    expect(parseSunatBillChannel('production')).toBe('production');
    try {
      parseSunatBillChannel('prod');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(SunatChannelError);
      expect((err as SunatChannelError).code).toBe('SUNAT_CHANNEL_INVALID');
    }
  });

  it('staging sin override → e-beta; override opt-in se respeta', () => {
    expect(resolveSunatBillEndpoint({ channel: 'staging' }).endpointUrl).toBe(
      SUNAT_BETA_BILL_SERVICE_URL,
    );
    expect(resolveSunatBillEndpoint({}).endpointUrl).toBe(SUNAT_BETA_BILL_SERVICE_URL);
    expect(
      resolveSunatBillEndpoint({
        channel: 'staging',
        endpointUrl: 'https://e-beta.example.test/billService',
      }).endpointUrl,
    ).toBe('https://e-beta.example.test/billService');
  });

  it('producción sin override → URL oficial; con la oficial → oficial', () => {
    expect(resolveSunatBillEndpoint({ channel: 'production' }).endpointUrl).toBe(
      SUNAT_PRODUCTION_BILL_SERVICE_URL,
    );
    expect(
      resolveSunatBillEndpoint({
        channel: 'production',
        endpointUrl: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService',
      }),
    ).toEqual({ channel: 'production', endpointUrl: SUNAT_PRODUCTION_BILL_SERVICE_URL });
  });

  it.each([
    'https://pse.kipuspay.staging.invalid/billService',
    'https://example.com/billService',
    'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
    'http://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService',
    'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
    'https://e-factura.evil.com/billService',
    'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService/',
  ])('producción con URL no oficial (%s) → fail-closed tipado', (bad) => {
    try {
      resolveSunatBillEndpoint({ channel: 'production', endpointUrl: bad });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(SunatChannelError);
      expect((err as SunatChannelError).code).toBe('SUNAT_PRODUCTION_ENDPOINT_FORBIDDEN');
    }
  });
});
