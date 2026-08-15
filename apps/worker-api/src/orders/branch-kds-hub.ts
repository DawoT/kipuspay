/**
 * BranchKdsHub — fan-out WebSocket KDS por (tenant, branch).
 * ADR-0013: separado de TenantState (revocación).
 */
import { DurableObject } from 'cloudflare:workers';
import type { KdsBroadcastEvent } from './kds-hub-helpers.js';
import { verifyKdsBroadcastToken } from './kds-hub-helpers.js';

export {
  assertKdsFireWithinSla,
  branchKdsHubName,
  KDS_FIRE_SLA_MS,
  type KdsBroadcastEvent,
  type KdsEventType,
} from './kds-hub-helpers.js';

interface KdsHubEnv {
  readonly KDS_BROADCAST_TOKEN?: string;
}

export class BranchKdsHub extends DurableObject<KdsHubEnv> {
  private sessions = new Set<WebSocket>();
  /** S19-H1: historial de eventos para replay (reconexión de KDS). */
  private readonly historyKey = 'kds_history';

  private authorized(request: Request): boolean {
    return verifyKdsBroadcastToken(
      request.headers.get('x-kds-token'),
      this.env.KDS_BROADCAST_TOKEN,
    );
  }

  private async handleBroadcast(request: Request): Promise<Response> {
    const event: KdsBroadcastEvent = await request.json();
    const payload = JSON.stringify(event);
    // S19-H1: persiste el evento para replay (fIFO, máx 200).
    const history = (await this.ctx.storage.get<KdsBroadcastEvent[]>(this.historyKey)) ?? [];
    history.push(event);
    if (history.length > 200) history.splice(0, history.length - 200);
    await this.ctx.storage.put(this.historyKey, history);
    let delivered = 0;
    for (const ws of this.sessions) {
      try {
        ws.send(payload);
        delivered += 1;
      } catch {
        this.sessions.delete(ws);
      }
    }
    return Response.json({ ok: true, listeners: this.sessions.size, delivered });
  }

  private acceptWebsocket(): Response {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    this.sessions.add(server);
    server.addEventListener('close', () => this.sessions.delete(server));
    server.addEventListener('error', () => this.sessions.delete(server));
    return new Response(null, { status: 101, webSocket: client });
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const isBroadcast = request.method === 'POST' && url.pathname === '/broadcast';
    const isReplay = request.method === 'GET' && url.pathname === '/replay';

    // S1: broadcast y replay son canales internos (worker→DO): token obligatorio.
    if ((isBroadcast || isReplay) && !this.authorized(request)) {
      return new Response('Forbidden', { status: 401 });
    }

    if (isBroadcast) return this.handleBroadcast(request);

    if (isReplay) {
      // S19-H1: un KDS que se reconecta recupera los eventos no vistos.
      const history = (await this.ctx.storage.get<KdsBroadcastEvent[]>(this.historyKey)) ?? [];
      return Response.json({ events: history });
    }

    if (request.headers.get('Upgrade') === 'websocket') {
      return this.acceptWebsocket();
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
