/**
 * Helpers KDS puros (sin cloudflare:workers) — unit-testables.
 */
import { KDS_FIRE_SLA_MS } from '@kipuspay/domain-sales';

export type KdsEventType = 'ITEM_FIRED' | 'ITEM_READY' | 'ITEM_CANCELLED' | 'ORDER_READY';

export interface KdsBroadcastEvent {
  readonly type: KdsEventType;
  readonly tenantId: string;
  readonly branchId: string;
  readonly orderId: string;
  readonly orderItemId?: string;
  readonly firedAtMs: number;
  readonly serverNowMs: number;
}

export { KDS_FIRE_SLA_MS };

export function assertKdsFireWithinSla(firedAtMs: number, visibleAtMs: number): void {
  if (visibleAtMs - firedAtMs > KDS_FIRE_SLA_MS) {
    throw new Error(`KDS_SLA_BREACH:${visibleAtMs - firedAtMs}ms`);
  }
}

export function branchKdsHubName(tenantId: string, branchId: string): string {
  return `${tenantId}:${branchId}`;
}

export function verifyKdsBroadcastToken(
  token: string | null | undefined,
  secret: string | undefined,
): boolean {
  if (!secret || secret.length === 0) return false;
  const a = token ?? '';
  const b = secret;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export const KDS_WS_TICKET_TTL_SECONDS = 60;
export const KDS_WS_TICKET_KV_PREFIX = 'kds-ws:';

export interface KdsWsTicketPayload {
  readonly tenantId: string;
  readonly branchId: string;
  readonly exp: number;
}

export function kdsWsTicketKvKey(ticket: string): string {
  return `${KDS_WS_TICKET_KV_PREFIX}${ticket}`;
}

export function parseKdsWsTicketPayload(
  raw: string | null,
  nowMs: number,
): KdsWsTicketPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      tenantId?: unknown;
      branchId?: unknown;
      exp?: unknown;
    };
    if (
      typeof parsed.tenantId !== 'string' ||
      !parsed.tenantId ||
      typeof parsed.branchId !== 'string' ||
      !parsed.branchId ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }
    if (parsed.exp <= nowMs) return null;
    return { tenantId: parsed.tenantId, branchId: parsed.branchId, exp: parsed.exp };
  } catch {
    return null;
  }
}
