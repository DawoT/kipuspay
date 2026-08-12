import { describe, expect, it, vi } from 'vitest';
import { createLpdpClient } from './customer-lpdp-client.js';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('LPDP POS seams (Sprint 47)', () => {
  const fetcher = vi.fn();
  const client = createLpdpClient({
    authenticatedFetch: fetcher,
    apiBase: 'https://api.kipuspay.local/',
  });

  it('lista clientes sin PII y pasa el tenant solo vía el backend', async () => {
    fetcher.mockResolvedValueOnce(
      jsonResponse({
        items: [{ id: 'c1', documentTypeCode: '1', documentNumber: '12345678', piiErased: false }],
      }),
    );
    const res = await client.list();
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({ id: 'c1', documentNumber: '12345678' });
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.kipuspay.local/api/customers?limit=100&offset=0');
    expect(init.body).toBeUndefined();
  });

  it('consulta y revoca consentimientos por propósito (GRANT/REVOKE)', async () => {
    fetcher.mockResolvedValueOnce(
      jsonResponse({
        customerId: 'c1',
        consents: [
          { purpose: 'marketing', granted: true, grantedAtIso: '2026-08-10', revokedAtIso: null },
        ],
      }),
    );
    const consents = await client.consents('c1');
    expect(consents.consents[0]?.purpose).toBe('marketing');

    fetcher.mockResolvedValueOnce(jsonResponse({ kind: 'REVOKE' }));
    await client.setConsent('c1', 'marketing', false);
    const [, revokeInit] = fetcher.mock.calls.at(-1) as [string, RequestInit];
    expect(revokeInit.method).toBe('POST');
    expect(revokeInit.body).toEqual(JSON.stringify({ purpose: 'marketing', granted: false }));
  });

  it('export descarga el payload del titular (LPDP-02)', async () => {
    fetcher.mockResolvedValueOnce(
      jsonResponse({
        customerId: 'c1',
        profile: { documentNumber: '12345678' },
        consents: [],
        sales: [],
        exportedAtIso: '2026-08-10T00:00:00Z',
      }),
    );
    const payload = await client.exportCustomer('c1');
    expect(payload.customerId).toBe('c1');
    expect(payload.profile).toHaveProperty('documentNumber');
  });

  it('erase anonimiza en un solo POST (LPDP-03)', async () => {
    fetcher.mockResolvedValueOnce(
      jsonResponse({ customerId: 'c1', fiscalSnapshotsAnonymized: 3, consentsRevoked: 2 }),
    );
    const result = await client.erase('c1');
    expect(result.consentsRevoked).toBe(2);
    const [, eraseInit] = fetcher.mock.calls.at(-1) as [string, RequestInit];
    expect(eraseInit.method).toBe('POST');
  });

  it('propaga errores semánticos del backend', async () => {
    fetcher.mockResolvedValueOnce(
      jsonResponse({ error: 'CUSTOMER_ERASED', code: 'CUSTOMER_ERASED' }, 404),
    );
    await expect(client.consents('c1')).rejects.toThrow('CUSTOMER_ERASED');
  });
});
