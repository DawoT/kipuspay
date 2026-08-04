import { DurableObject } from 'cloudflare:workers';

/**
 * Plano de control por tenant (Arquitectura §3).
 * Un DO por tenantId (idFromName); estado autoritativo de revocación.
 */
export class TenantState extends DurableObject {
  async status(): Promise<{ revoked: boolean }> {
    const revoked = (await this.ctx.storage.get<boolean>('revoked')) === true;
    return { revoked };
  }

  async setRevoked(revoked: boolean): Promise<void> {
    await this.ctx.storage.put('revoked', revoked);
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/status') {
      return Response.json(await this.status());
    }
    if (request.method === 'POST' && url.pathname === '/revoke') {
      await this.setRevoked(true);
      return Response.json({ ok: true });
    }
    if (request.method === 'POST' && url.pathname === '/reinstate') {
      await this.setRevoked(false);
      return Response.json({ ok: true });
    }
    return new Response('Not Found', { status: 404 });
  }
}
