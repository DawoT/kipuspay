import { describe, expect, it, vi } from 'vitest';
import {
  createCashMovement,
  mintCashAuthzToken,
  reprintSale,
} from './cash-movement.js';


function captureFetcher(body: unknown, status = 200) {
  const captured: { url?: string; init?: RequestInit } = {};
  const fetcher = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    captured.url = url instanceof URL || typeof url === 'string' ? url.toString() : url.url;
    captured.init = init;
    return Promise.resolve(jsonResponse(body, status));
  });
  return { fetcher, captured };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const AUTH = 'Bearer jwt-x';

describe('cliente de movimientos de caja (S17, F2)', () => {
  it('registra un movimiento bajo umbral con monto en cents', async () => {
    const { fetcher, captured } = captureFetcher({ id: 'mv-1', movementType: 'CHANGE_FUND_IN', amountCents: 500 });
    const res = await createCashMovement({
      fetcher,
      apiBase: 'https://api.test',
      authorization: AUTH,
      branchId: 'b1',
      sessionId: 'sess-1',
      movementType: 'CHANGE_FUND_IN',
      amountCents: 500,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.id).toBe('mv-1');
    expect(captured.url).toBe('https://api.test/api/cash/movements');
    expect(captured.init?.method).toBe('POST');
    const body = JSON.parse(captured.init?.body as string) as Record<string, unknown>;
    expect(body.amountCents).toBe(500);
    expect(body).not.toHaveProperty('authorizationTokenHash');
  });

  it('superficie el código AUTH_TOKEN_REQUIRED para disparar el flujo de PIN', async () => {
    const { fetcher } = captureFetcher({ error: 'Authz required', code: 'AUTH_TOKEN_REQUIRED' }, 403);
    const res = await createCashMovement({
      fetcher,
      apiBase: 'https://api.test',
      authorization: AUTH,
      branchId: 'b1',
      sessionId: 'sess-1',
      movementType: 'DEPOSIT_VALUES',
      amountCents: 50_000,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('AUTH_TOKEN_REQUIRED');
  });

  it('mint del token de autorización con PIN supervisor y scope CASH_MOVEMENT', async () => {
    const { fetcher, captured } = captureFetcher({
      tokenHash: 'a'.repeat(64),
      ttlSeconds: 90,
      scope: 'CASH_MOVEMENT',
      expiresAt: '2026-08-14T08:00:00.000Z',
    });
    const res = await mintCashAuthzToken({
      fetcher,
      apiBase: 'https://api.test',
      authorization: AUTH,
      pin: '1234',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.tokenHash).toHaveLength(64);
    const body = JSON.parse(captured.init?.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ pin: '1234', scope: 'CASH_MOVEMENT' });
    expect((captured.init?.headers as Record<string, string>).authorization).toBe(AUTH);
  });

  it('reenvía el movimiento con el token tras la autorización', async () => {
    const { fetcher, captured } = captureFetcher({ id: 'mv-2', movementType: 'DEPOSIT_VALUES', amountCents: 50_000 });
    const res = await createCashMovement({
      fetcher,
      apiBase: 'https://api.test',
      authorization: AUTH,
      branchId: 'b1',
      sessionId: 'sess-1',
      movementType: 'DEPOSIT_VALUES',
      amountCents: 50_000,
      authorizationTokenHash: 'a'.repeat(64),
    });
    expect(res.ok).toBe(true);
    const body = JSON.parse(captured.init?.body as string) as Record<string, unknown>;
    expect(body.authorizationTokenHash).toBe('a'.repeat(64));
  });

  it('reimpresión COPIA mapea el watermark', async () => {
    const { fetcher, captured } = captureFetcher({
      id: 'rp-1',
      saleId: 'sale-1',
      copiedWatermark: true,
      watermarkLabel: 'COPIA',
    });
    const res = await reprintSale({
      fetcher,
      apiBase: 'https://api.test',
      authorization: AUTH,
      saleId: 'sale-1',
      branchId: 'b1',
      reason: 'Cliente solicitó copia',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.watermarkLabel).toBe('COPIA');
    expect(captured.url).toBe('https://api.test/api/cash/reprints');
    expect(JSON.parse(captured.init?.body as string)).toMatchObject({
      saleId: 'sale-1',
      branchId: 'b1',
      reason: 'Cliente solicitó copia',
    });
  });

  it('falla offline sin reventar (red caída → ok:false)', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const res = await createCashMovement({
      fetcher,
      apiBase: 'https://api.test',
      authorization: AUTH,
      branchId: 'b1',
      sessionId: 'sess-1',
      movementType: 'CHANGE_FUND_IN',
      amountCents: 500,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toContain('Sin conexión');
  });
});
