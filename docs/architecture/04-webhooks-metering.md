---
doc_id: arch-04-webhooks-metering
alias: Arquitectura
authority: normativa
owner: "@DawoT"
section: "4"
---

## **4. Webhooks de Pasarela de Pago & Invalidation Instantánea con Firma Criptográfica WebCrypto**

// src/workers/paymentWebhookWorker.ts  
import { Hono } from 'hono';

const app = new Hono<{ Bindings: Env }>();

app.post('/v1/webhooks/stripe', async (c) => {  
  const signatureHeader = c.req.header('stripe-signature');  
  const rawBody = await c.req.text();  
  const webhookSecret = c.env.STRIPE_WEBHOOK_SECRET;

  if (!signatureHeader || !webhookSecret) {  
    return c.json({ error: 'Webhook signature verification failed: Missing headers/secrets' }, 400);  
  }

  // 1. Validar firma HMAC SHA-256 de Stripe mediante WebCrypto nativa  
  const isValid = await verifyStripeSignature(rawBody, signatureHeader, webhookSecret);  
  if (!isValid) {  
    return c.json({ error: 'Invalid Stripe signature' }, 401);  
  }

  const event = JSON.parse(rawBody);
  const eventId = event.id as string | undefined;  
  const tenantId = event.data?.object?.metadata?.tenant_id as string | undefined;  
  const isSubscriptionEvent = [
    'customer.subscription.deleted', 'customer.subscription.updated',
    'invoice.payment_failed', 'invoice.paid'
  ].includes(event.type);
  if (!eventId) return c.json({ error: 'Missing Stripe event id' }, 400);  
  if (isSubscriptionEvent && !tenantId) {  
    return c.json({ error: 'Missing tenant_id in metadata' }, 400);  
  }

  // SEC-08: claim atómico por (source, event.id) ANTES de procesar. El INSERT con
  // ON CONFLICT elimina el TOCTOU SELECT→INSERT; re-deliveries legítimas o replays
  // dentro de la ventana de 5 min no re-ejecutan efectos tras PROCESSED.
  // WEBHOOK_EVENTS_DB es el binding D1 canónico del registro de eventos entrantes.
  const db = c.env.WEBHOOK_EVENTS_DB as D1Database;
  const claim = await db.prepare(
    `INSERT INTO webhook_events (id, tenant_id, source, event_id, status, attempt_count)
     VALUES (?, ?, 'stripe', ?, 'PROCESSING', 1)
     ON CONFLICT (source, event_id) DO NOTHING`,
  ).bind(crypto.randomUUID(), tenantId ?? 'external', eventId).run();
  if (claim.meta.changes === 0) {
    const priorEvent = await db.prepare(
      `SELECT status FROM webhook_events WHERE source = 'stripe' AND event_id = ?`,
    ).bind(eventId).first<{ status: 'PROCESSING' | 'PROCESSED' | 'FAILED' }>();
    if (priorEvent?.status === 'PROCESSED') {
      return c.json({ received: true, deduplicated: true });
    }
    await db.prepare(
      `UPDATE webhook_events SET status = 'PROCESSING', attempt_count = attempt_count + 1,
         last_error = NULL WHERE source = 'stripe' AND event_id = ?`,
    ).bind(eventId).run();
  }

  try {
  if (isSubscriptionEvent) {  
    const objectStatus = event.data?.object?.status as string | undefined;
    const subscriptionStatus = event.type === 'customer.subscription.deleted'
      ? 'canceled'
      : event.type === 'invoice.payment_failed'
        ? 'past_due'
        : event.type === 'invoice.paid'
          ? 'active'
          : event.type === 'customer.subscription.updated' && objectStatus === 'past_due'
            ? 'past_due'
            : event.type === 'customer.subscription.updated'
              && ['canceled', 'unpaid', 'incomplete', 'incomplete_expired'].includes(objectStatus ?? '')
              ? 'canceled'
              : undefined;

    // Solo invoice.paid des-revoca. Un updated activo/trialing/desconocido es no-op:
    // Stripe no garantiza orden entre tipos en retries y no debe restaurar acceso tarde.
    // Un estado no-pagador en updated revoca fail-closed; payment_failed queda en gracia
    // (GTM §4.3): actualiza past_due, pero no bloquea caja ni emisión.
    if (subscriptionStatus === 'canceled') {
      const doId = c.env.TENANT_STATE_DO.idFromName(tenantId!);  
      const stub = c.env.TENANT_STATE_DO.get(doId);  
      await stub.fetch(new Request(new URL('/revoke', c.env.FQDN), { method: 'POST' }));
      await c.env.TENANT_KV.put(`revocation:${tenantId}`, '1');
    } else if (subscriptionStatus === 'active') {
      const doId = c.env.TENANT_STATE_DO.idFromName(tenantId!);
      const stub = c.env.TENANT_STATE_DO.get(doId);
      await stub.fetch(new Request(new URL('/unrevoke', c.env.FQDN), { method: 'POST' }));
      await c.env.TENANT_KV.delete(`revocation:${tenantId}`);
    }

    // Actualizar estado en KV Cache  
    const tenantRaw = await c.env.TENANT_KV.get(`tenant:${tenantId}`);  
    if (tenantRaw && subscriptionStatus) {
      const tenant = JSON.parse(tenantRaw);  
      tenant.subscriptionStatus = subscriptionStatus;
      await c.env.TENANT_KV.put(`tenant:${tenantId}`, JSON.stringify(tenant));  
    }  
  }
    await db.prepare(
      `UPDATE webhook_events SET status = 'PROCESSED', processed_at = CURRENT_TIMESTAMP WHERE source = 'stripe' AND event_id = ?`
    ).bind(eventId).run();
  } catch (error) {
    await db.prepare(
      `UPDATE webhook_events SET status = 'FAILED', last_error = ? WHERE source = 'stripe' AND event_id = ?`
    ).bind(String(error), eventId).run();
    return c.json({ error: 'Webhook effect failed; retryable', code: 'WEBHOOK_RETRYABLE' }, 503);
  }

  return c.json({ received: true });  
});

async function verifyStripeSignature(  
  rawBody: string,  
  signatureHeader: string,  
  secret: string  
): Promise<boolean> {  
  try {  
    const parts = signatureHeader.split(',').reduce(  
      (acc: { timestamp?: string; v1: string[] }, item) => {  
        const [key, val] = item.split('=');  
        if (key?.trim() === 't' && val) acc.timestamp = val.trim();  
        if (key?.trim() === 'v1' && val) acc.v1.push(val.trim());  
        return acc;  
      },  
      { v1: [] }  
    );

    const timestamp = parts.timestamp;  
    const stripeSigs = parts.v1;  
    if (!timestamp || stripeSigs.length === 0) return false;

    // Prevenir ataques de Replay (5 minutos) — SEC-08: ventana con cota SUPERIOR e INFERIOR
    // (0 ≤ ageSeconds ≤ 300): una firma con timestamp FUTURO se rechaza, no solo la vieja.  
    const timestampSeconds = Number(timestamp);  
    if (!Number.isInteger(timestampSeconds)) return false;  
    const ageSeconds = Math.floor(Date.now() / 1000) - timestampSeconds;  
    if (ageSeconds > 300 || ageSeconds < 0) return false;

    const payloadToSign = `${timestamp}.${rawBody}`;  
    const encoder = new TextEncoder();  
    const key = await crypto.subtle.importKey(  
      'raw',  
      encoder.encode(secret),  
      { name: 'HMAC', hash: 'SHA-256' },  
      false,  
      ['sign']  
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadToSign));  
    const computedSig = Array.from(new Uint8Array(signatureBuffer))  
      .map((b) => b.toString(16).padStart(2, '0'))  
      .join('');

    // SEC-08: comparación CONSTANTE en tiempo sobre bytes, no `===` sobre strings directos.
    const expected = decodeHex(computedSig);  
    if (!expected) return false;  
    let valid = 0;  
    for (const stripeSig of stripeSigs) {  
      const received = decodeHex(stripeSig);  
      if (!received || expected.length !== received.length) continue;  
      let diff = 0;  
      for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ received[i];  
      valid |= diff === 0 ? 1 : 0;  
    }  
    return valid === 1;  
  } catch (err) {  
    console.error('Crypto Webhook Verification Error:', err);  
    return false;  
  }  
}

function decodeHex(value: string): Uint8Array | null {  
  if (value.length % 2 !== 0 || /[^0-9a-f]/i.test(value)) return null;  
  const bytes = new Uint8Array(value.length / 2);  
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);  
  return bytes;  
}

export default app;

### **4.0 Política de seguridad transversal (SEC-11 / SEC-04)**

- **Rate limit por ruta (Cloudflare Rate Limiting):** login/PIN → 5 fallos/15 min + lockout; webhooks entrantes → 100/min/IP; API pública → por API key (429); insights AI → por tenant/día (regla 33).
- **CORS:** allowlist por tenant (solo el origen del dashboard), jamás `*` en rutas autenticadas.
- **CSRF:** cookies de sesión `SameSite=Lax/Strict` + `Secure`; tokens CSRF/`Authorization` para mutaciones; nunca cookies de sesión sin `Secure` ni `SameSite`.
- **PIN de caja (`users.pin_hash`, `transfer_pin_hash`):** argon2id; verificado server-side; lockout 5 fallos/15 min (SEC-03/SEC-11).
- **Webhooks salientes (`webhook_endpoints`):** URL solo HTTPS, resuelta contra deny-list (IP privada, link-local, `169.254.169.254`); timeout 5 s; 3 reintentos con backoff; auto-disable tras N fallos (`failure_count`); rotación de API keys cada 180 días con alerta (`last_used_at`).

### **4.1 Medición de uso y sobregiro facturado (v8.2)**

Principio 5: **nunca apagar la caja**; el excedente del cupo Arranque se factura.

**Fuente de verdad de dinero:** `usage_counters` en D1, **no** Cloudflare Analytics Engine (AE es muestreado → solo dashboards).

```sql
CREATE TABLE usage_counters (
    tenant_id TEXT NOT NULL,
    period_ym TEXT NOT NULL,      -- 'YYYY-MM' America/Lima
    doc_count INTEGER NOT NULL DEFAULT 0,
    overage_reported_thru INTEGER NOT NULL DEFAULT 0, -- último doc_count ya enviado a Stripe
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, period_ym)
);

CREATE TABLE usage_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    usage_key TEXT NOT NULL,             -- usage:{documentId}
    period_ym TEXT NOT NULL,
    document_id TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, usage_key),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE billing_overages (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    period_ym TEXT NOT NULL,
    units INTEGER NOT NULL,       -- comprobantes cobrados en este batch
    stripe_idempotency_key TEXT NOT NULL UNIQUE, -- tenant:period:day
    reported_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Reglas:**

1. Dentro del mismo `db.batch([...])` atómico de la venta CPE/NV que cuenta para cupo: `INSERT ... ON CONFLICT ... DO UPDATE SET doc_count = doc_count + 1`.
2. Cron diario (aislado del hot path): lee `doc_count - overage_reported_thru` vs cupo del plan; si hay excedente, `Stripe Metered Billing` batch con `idempotency_key = tenant:period:day`; escribe `billing_overages` y avanza `overage_reported_thru`.
3. Cobro / emisión **nunca** hacen `fetch` a Stripe.
4. Cupo Arranque: **1,000 comprobantes/mes** incluidos; **S/ 0.05** por adicional (GTM §4.1). Crece/Cadena: cupo holgado o incluido en precio (sin sobregiro en pitch).

**Documentos que cuentan para cupo (regla cerrada):**

| Documento | `doc_count + 1` | Nota |
|---|---|---|
| Factura `01`, Boleta `03`, Ticket `12`, NC `07`, ND `08` | **Sí** | Cada CPE emitido = 1 doc, incluida la corrección. Idempotency: `usage:{docId}` en la misma tx. |
| `NV` / `NV_RETURN` | **Sí** | Comprobante interno emitido; consume cupo como cualquier venta. |
| Baja de boleta (void → RC) | **No suma ni resta** | El doc ya consumió cupo al emitirse; la baja es cambio de estado sobre el mismo doc, no un documento nuevo. |
| Resumen Diario (RC) | **Cada boleta del RC = 1** | El RC es solo el vehículo de envío, no un documento facturable; los docs que contiene ya contaron en su emisión. |

Regla anti-ambigüedad: el cupo se consume **al emitir** el comprobante (venta, NC, ND, NV), nunca al anular. Un error del cajero que se corrige con 50 NC consume 50 docs de cupo (cada NC es un XML real enviado a SUNAT). La NC **no** reembolsa el cupo consumido por la venta original.

Regla de aceptación SUNAT: el cupo cubre la **generación/procesamiento** del comprobante (XML emitido y enviado), **independiente del estado final de aceptación** (`ACEPTADO`, `QUARANTINED`, `REJECTED`, `DEADLINE_EXCEEDED`). Un CPE que SUNAT nunca acepta ya consumió su doc; solo una NC posterior anula el efecto comercial, pero cada XML generado contó para el cupo. La caja nunca se detiene por rechazo: el cobro commite y el reintento de envío queda en la cola de resumen, sin exigir doc nuevo. **Anulación de CPE no aceptado (edge E-A):** si el origen está `REJECTED`/`QUARANTINED`/`DEADLINE_EXCEEDED` (jamás tuvo CDR `ACCEPTED`), la NC de anulación **no exige** CDR aceptado — no existe CDR que exigir. Se emite la NC con motivo Catálogo 09 de anulación (por el total, no parcial), se revierte el efecto comercial (el dinero ya está contabilizado en caja/rollups), se alerta al Dueño vía Modo Dueño (`audit_events` `CREDIT_NOTE_NO_CDR` con el estado origen) y el XML de la NC se envía como corrección del original no aceptado (unitaria o en RC, según §5.2). La precondición `ACCEPTED` (§8, Sprint 5) aplica **solo** cuando el origen sí tiene CDR. Jamás se bloquea la caja por un rechazo.
