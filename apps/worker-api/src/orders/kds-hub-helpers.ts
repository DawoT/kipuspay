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
