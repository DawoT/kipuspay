export interface CashierLoginResult {
  readonly token: string;
  readonly expiresAt: string;
  readonly user: { userId: string; role: string; branchId: string };
}

export class LoginError extends Error {
  constructor(
    readonly code: string,
    readonly status?: number,
  ) {
    super(code);
    this.name = 'LoginError';
  }
}

function isLoginResult(value: unknown): value is CashierLoginResult {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.token === 'string' &&
    row.token.length > 0 &&
    typeof row.expiresAt === 'string' &&
    typeof row.user === 'object' &&
    row.user !== null
  );
}

export async function cashierLogin(input: {
  readonly apiBase: string;
  readonly tenantId: string;
  readonly identifier: string;
  readonly pin: string;
  readonly fetcher?: typeof fetch;
}): Promise<CashierLoginResult> {
  const fetcher = input.fetcher ?? fetch;
  const base = input.apiBase.replace(/\/$/, '');
  let response: Response;
  try {
    response = await fetcher(`${base}/api/auth/cashier-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        tenantId: input.tenantId,
        identifier: input.identifier,
        pin: input.pin,
      }),
    });
  } catch {
    throw new LoginError('LOGIN_OFFLINE');
  }
  if (!response.ok) {
    let code = `HTTP_${response.status}`;
    try {
      const body = (await response.json()) as { code?: string };
      if (typeof body.code === 'string') code = body.code;
    } catch {
      // cuerpo no JSON: el código HTTP es suficiente.
    }
    throw new LoginError(code, response.status);
  }
  const body = (await response.json()) as unknown;
  if (!isLoginResult(body)) throw new LoginError('LOGIN_INVALID');
  return body;
}
