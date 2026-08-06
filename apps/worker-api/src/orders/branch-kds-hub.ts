/**
 * BranchKdsHub — fan-out WebSocket KDS por (tenant, branch).
 * ADR-0013: separado de TenantState (revocación).
 */
import { DurableObject } from 'cloudflare:workers';
import type { KdsBroadcastEvent } from './kds-hub-helpers.js';

export {
  assertKdsFireWithinSla,
  branchKdsHubName,
  KDS_FIRE_SLA_MS,
  type KdsBroadcastEvent,
  type KdsEventType,
} from './kds-hub-helpers.js';

export class BranchKdsHub extends DurableObject {
  private sessions = new Set<WebSocket>();

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/broadcast') {
      const event: KdsBroadcastEvent = await request.json();
      const payload = JSON.stringify(event);
      for (const ws of this.sessions) {
        try {
          ws.send(payload);
        } catch {
          this.sessions.delete(ws);
        }
      }
      return Response.json({ ok: true, listeners: this.sessions.size });
    }

    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.ctx.acceptWebSocket(server);
      this.sessions.add(server);
      server.addEventListener('close', () => this.sessions.delete(server));
      server.addEventListener('error', () => this.sessions.delete(server));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true, listeners: this.sessions.size });
    }

    return new Response('Not Found', { status: 404 });
  }

  override webSocketMessage(): void {
    // clients are receive-only for KDS fan-out
  }

  override webSocketClose(ws: WebSocket): void {
    this.sessions.delete(ws);
  }

  override webSocketError(ws: WebSocket): void {
    this.sessions.delete(ws);
  }
}
