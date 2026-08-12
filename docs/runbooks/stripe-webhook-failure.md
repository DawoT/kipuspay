---
doc_id: runbook-stripe-webhook-failure
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Runbook — Fallo de webhook Stripe / secret rotado / storm de retries


| Campo | Valor |
|---|---|
| Severidad tipica | SEV-2 (billing/revocación); SEV-1 si storm satura D1 |
| Owner on-call | Staff SRE |
| Ultima ensayada | 2026-08-04 (handle-stripe-webhook.test.ts + verify-stripe-signature fuzz) |
| Relaciona | Arquitectura §4 · SEC-08 · ADR-0005 · ADR-0006 · AGENTS invariante 6 · Roadmap Sprint 3 |

## Sintomas

- Stripe Dashboard muestra entregas fallidas (401 / 400 / 503 `WEBHOOK_RETRYABLE`).
- `webhook_events.status = FAILED` con `last_error` poblado.
- Tenant sigue `active` tras cancelación (revocación no propagó) o permanece
  revocado tras `invoice.paid`.
- Storm: spike de `attempt_count` y 503 repetidos en `POST /v1/webhooks/stripe`.

## Impacto

- Cobro online: si falta revoke, un tenant cancelado podría seguir autenticando
  hasta que se corrija (SEV-1 comercial).
- `invoice.payment_failed` solo marca `past_due` (gracia GTM §4.3): la caja no
  se apaga — comportamiento esperado, no incidente de revoke.
- Offline-first: la venta local no depende del webhook; sync/auth sí.

## Latencia de invalidación (medición)

| Ambiente | Medición | Resultado |
|---|---|---|
| Unit (mem KV/DO) | `handle-stripe-webhook.test.ts` timed: webhook procesado → `isTenantRevokedCached` true | p95 < 100 ms (ensayo 2026-08-04) |
| Staging E2E | Stripe CLI `trigger customer.subscription.deleted` → lookup revoked en control-plane | Registrar en post-deploy; objetivo < 5 s incl. entrega Stripe |

## Diagnóstico rápido (<5 min)

1. ¿401 Invalid signature? → secret desfasado (`STRIPE_WEBHOOK_SECRET`) o body no raw.
2. ¿400 Missing headers/secrets? → binding secret ausente en el Worker.
3. ¿503 WEBHOOK_RETRYABLE? → efecto DO/KV falló; ver `webhook_events.last_error`.
4. ¿200 deduplicated? → evento ya `PROCESSED` (replay/re-delivery); no es error.
5. Confirmar `tenant_id` en `event.data.object.metadata` para eventos de suscripción.

## Mitigación

1. **Secret rotado:** actualizar Workers Secret `STRIPE_WEBHOOK_SECRET` al valor
   activo en Stripe; redeploy o secret sync; reenviar eventos fallidos desde Dashboard.
2. **DO/KV down:** restaurar `TENANT_STATE_DO` / `TENANT_KV`; Stripe reintenta 503.
3. **Storm de retries:** no bajar anti-replay ni fail-open; confirmar dedup
   `UNIQUE(source,event_id)`; rate-limit en Cloudflare si D1 satura.
4. **Revoke manual de emergencia:** `POST /revoke` al DO del tenant +
   `TENANT_KV.put(revocation:{id}, '1')` (mismo efecto que subscription.deleted).

## Rollback

- Revertir Worker solo si un deploy rompió firma/dedup (verify suite + fuzz).
- Tras rotar secret: smoke con Stripe CLI firmando un evento de test → 200.
- Verificar: tenant cancelado → `isTenantRevokedCached` true; past_due sin revoke.

## Escalamiento

| Condición | Escalar a |
|---|---|
| Revocación no propaga > 15 min | Staff Security + Staff Principal |
| Secret comprometido | Staff Security (rotar + invalidar sesiones) |
| Storm > 1k retries/min | Staff SRE + Cloudflare account owner |

## Ensayo (suite = drill)

- Fuzz firmas inválidas: `verify-stripe-signature.test.ts` — fuzz **determinista**
  (PRNG seedable, reproducible en CI) ≥50 casos + adversarial (borde 300 s, hex
  truncado, `=` extra, multi-v1, mayúsculas) → todos rechazados o según spec.
- Replay/dedup: `handle-stripe-webhook.test.ts` (PROCESSED → 200 deduplicated;
  **ataque replay re-firmado** — mismo event_id con timestamp nuevo dentro de
  ventana → dedup sin doble efecto; re-firma fuera de ventana → 401).
- Orden/reintento: `updated(active)` no des-revoca, `updated(canceled)` revoca y
  redelivery `PROCESSING` reclama sin 500.
- Efecto fallido: DO 503 → `FAILED` + HTTP 503 `WEBHOOK_RETRYABLE`.
- Timing: test timed invalidación < 100 ms (unit).

## Postmortem

- Entrada de ledger (tipo Corrección / incidente): `id: ____`
- Acción preventiva con sprint owner (Staff Security): …
