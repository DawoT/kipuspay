import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inviteTeamMember, issueShiftPin, resolveSeller, transferShift } from './shift-handoff';

function mockFetch(response: { status: number; body: Record<string, unknown> }) {
  return vi.fn(
    () =>
      new Promise<Response>((resolvePromise) =>
        resolvePromise(
          new Response(JSON.stringify(response.body), {
            status: response.status,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
  ) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shift handoff cliente (Sprint 51)', () => {
  it('issueShiftPin: valida sessionId y operador', async () => {
    const res = await issueShiftPin('', '');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toContain('requeridos');
  });

  it('issueShiftPin: devuelve el PIN claro solo desde el servidor', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        status: 200,
        body: { pin: '123456', expiresAtIso: '2026-08-12T12:05:00.000Z', ttlSeconds: 300 },
      }),
    );
    const res = await issueShiftPin('s1', 'u1');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.pin).toBe('123456');
    expect(res.ttlSeconds).toBe(300);
  });

  it('issueShiftPin: errores del servidor se traducen', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({ status: 401, body: { code: 'PIN_EXPIRED', error: 'expired' } }),
    );
    const res = await issueShiftPin('s1', 'u1');
    expect(res).toEqual({ ok: false, message: 'expired' });
  });

  it('transferShift: construye el body con conteo intermedio', async () => {
    let sentBody: Record<string, unknown> | null = null;
    const fetchMock = vi.fn((_url: unknown, init?: RequestInit) => {
      const rawBody = init?.body;
      sentBody = JSON.parse(typeof rawBody === 'string' ? rawBody : '{}') as Record<
        string,
        unknown
      >;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            shiftId: 'sh2',
            incomingUserId: 'u2',
            cashDiffCents: 500,
            interimCountCents: 9500,
            interimRequired: true,
          }),
          { status: 200 },
        ),
      );
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);
    const res = await transferShift('s1', 'u1', '123456', 9500);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.cashDiffCents).toBe(500);
    expect(sentBody).toMatchObject({
      sessionId: 's1',
      outgoingUserId: 'u1',
      pin: '123456',
      interimCountCents: 9500,
    });
  });

  it('transferShift: 409 reuso del PIN → mensaje de error', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({ status: 409, body: { code: 'PIN_USED', error: 'ya usado' } }),
    );
    const res = await transferShift('s1', 'u1', '123456', null);
    expect(res).toEqual({ ok: false, message: 'ya usado' });
  });

  it('resolveSeller: badge o PIN → vendedor', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        status: 200,
        body: { userId: 'u9', email: 'v@tienda.pe', role: 'cashier', resolvedBy: 'badge' },
      }),
    );
    const res = await resolveSeller('EMP-55555');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.userId).toBe('u9');
  });

  it('resolveSeller: fallo fail-closed se traduce', async () => {
    vi.stubGlobal('fetch', mockFetch({ status: 404, body: { code: 'UNKNOWN_IDENTIFIER' } }));
    const res = await resolveSeller('EMP-99999');
    expect(res.ok).toBe(false);
  });

  it('inviteTeamMember: crea y expone credenciales una sola vez', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        status: 201,
        body: { userId: 'u8', badgeBarcode: 'EMP-12345', cashierPin: '4321' },
      }),
    );
    const res = await inviteTeamMember('v@tienda.pe', 'cashier', 'b1');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.badgeBarcode).toBe('EMP-12345');
    expect(res.cashierPin).toBe('4321');
  });

  it('inviteTeamMember: duplicado → mensaje del servidor', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({ status: 409, body: { code: 'USER_ALREADY_INVITED', error: 'ya invitado' } }),
    );
    const res = await inviteTeamMember('v@tienda.pe', 'cashier', null);
    expect(res).toEqual({ ok: false, message: 'ya invitado' });
  });
});
