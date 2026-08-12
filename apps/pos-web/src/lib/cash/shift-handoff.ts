/**
 * Sprint 51 — cliente del handoff de turno (regla 35) y equipo (regla 36).
 * El servidor es la única autoridad del PIN: el cliente nunca ve hashes y el
 * PIN claro se muestra una sola vez en la UI.
 */

export interface IssueShiftPinResultOk {
  ok: true;
  pin: string;
  expiresAtIso: string;
  ttlSeconds: number;
}

export interface ShiftTransferResultOk {
  ok: true;
  shiftId: string;
  incomingUserId: string;
  cashDiffCents: number | null;
  interimCountCents: number | null;
  interimRequired: boolean;
}

export type ShiftTransferResult = ShiftTransferResultOk | { ok: false; message: string };

function apiBase(): string {
  return (import.meta.env.PUBLIC_API_BASE as string | undefined) ?? '';
}

function authHeader(): string {
  return (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';
}

async function post(path: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${apiBase().replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: authHeader() },
    body: JSON.stringify(body),
  });
}

export async function issueShiftPin(
  sessionId: string,
  outgoingUserId: string,
): Promise<IssueShiftPinResultOk | { ok: false; message: string }> {
  if (!sessionId.trim() || !outgoingUserId.trim()) {
    return { ok: false, message: 'sessionId y operador saliente son requeridos.' };
  }
  try {
    const res = await post('/api/cash/shifts/pin', { sessionId, outgoingUserId });
    const data = (await res.json()) as { code?: string; error?: string };
    if (!res.ok)
      return { ok: false, message: data.error ?? data.code ?? 'No se pudo generar el PIN.' };
    return {
      ok: true,
      pin: String((data as { pin: string }).pin),
      expiresAtIso: String((data as { expiresAtIso: string }).expiresAtIso),
      ttlSeconds: Number((data as { ttlSeconds: number }).ttlSeconds),
    };
  } catch {
    return { ok: false, message: 'Sin conexión con el servidor.' };
  }
}

export async function transferShift(
  sessionId: string,
  outgoingUserId: string,
  pin: string,
  interimCountCents: number | null,
): Promise<ShiftTransferResult> {
  if (!sessionId.trim() || !outgoingUserId.trim() || !pin.trim()) {
    return { ok: false, message: 'sessionId, operador saliente y PIN son requeridos.' };
  }
  try {
    const res = await post('/api/cash/shifts/transfer', {
      sessionId,
      outgoingUserId,
      pin,
      interimCountCents,
    });
    const data = (await res.json()) as {
      code?: string;
      error?: string;
      shiftId?: string;
      cashDiffCents?: number | null;
      interimCountCents?: number | null;
      interimRequired?: boolean;
      incomingUserId?: string;
    };
    if (!res.ok) return { ok: false, message: data.error ?? data.code ?? 'No se pudo transferir.' };
    return {
      ok: true,
      shiftId: String(data.shiftId ?? ''),
      incomingUserId: String(data.incomingUserId ?? ''),
      cashDiffCents: data.cashDiffCents ?? null,
      interimCountCents: data.interimCountCents ?? null,
      interimRequired: data.interimRequired ?? false,
    };
  } catch {
    return { ok: false, message: 'Sin conexión con el servidor.' };
  }
}

export async function resolveSeller(
  identifier: string,
): Promise<
  { ok: true; userId: string; email: string; role: string } | { ok: false; message: string }
> {
  if (!identifier.trim())
    return { ok: false, message: 'Escanea el badge o teclea el PIN del vendedor.' };
  try {
    const res = await post('/api/team/resolve', { identifier });
    const data = (await res.json()) as {
      code?: string;
      error?: string;
      userId?: string;
      email?: string;
      role?: string;
    };
    if (!res.ok)
      return { ok: false, message: data.error ?? data.code ?? 'No se encontró al vendedor.' };
    return {
      ok: true,
      userId: String(data.userId ?? ''),
      email: String(data.email ?? ''),
      role: String(data.role ?? ''),
    };
  } catch {
    return { ok: false, message: 'Sin conexión con el servidor.' };
  }
}

export async function inviteTeamMember(
  email: string,
  role: string,
  branchId: string | null,
): Promise<
  | { ok: true; userId: string; badgeBarcode: string; cashierPin: string }
  | { ok: false; message: string }
> {
  if (!email.trim() || !role.trim()) {
    return { ok: false, message: 'Email y rol son requeridos.' };
  }
  try {
    const res = await post('/api/team/invites', { email, role, branchId });
    const data = (await res.json()) as {
      code?: string;
      error?: string;
      userId?: string;
      badgeBarcode?: string;
      cashierPin?: string;
    };
    if (!res.ok) return { ok: false, message: data.error ?? data.code ?? 'No se pudo invitar.' };
    return {
      ok: true,
      userId: String(data.userId ?? ''),
      badgeBarcode: String(data.badgeBarcode ?? ''),
      cashierPin: String(data.cashierPin ?? ''),
    };
  } catch {
    return { ok: false, message: 'Sin conexión con el servidor.' };
  }
}
