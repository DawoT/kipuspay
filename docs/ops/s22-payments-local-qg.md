---
doc_id: ops-s22-payments-local-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Quality Gate Sprint 22 — Cobro local (Yape / Plin / MP QR + Culqi / Niubiz)

| Campo | Valor |
|---|---|
| Fecha UTC | 2026-08-06T02:30:00Z |
| Sprint | 22 |
| Capabilities | `payments.qr_wallets`, `payments.card_acquirer` |

## Evidencia

| Caso | Resultado |
|---|---|
| FSM captura + offline policy (edge 2B) | GREEN (`payment-capture`, chaos) |
| `payment_captures` migración 0015 + MANUAL en offline sale batch | GREEN |
| Idempotency charge (misma key → 1 capture) | GREEN (`process-payment-capture-atomic`, sandbox PE) |
| Webhook HMAC + ventana ≤300s | GREEN (`adapters-payments-pe`) |
| Arqueo Z: cash ≠ electronic | GREEN (`cash-routes` JOIN `payment_methods.code`) |
| API charge / capture / owner uncaptured + flags default off | GREEN (`payment-routes`, protected-routes) |
| UI `/caja/cobro` ámbar + `/owner/pagos` | GREEN |
| Residual S21 `sale_payments` vs captures | Cerrado: ambos (method FK + capture lifecycle) |
| GTM-06 / FAQ Yape | live post A+V |

## Auditoría FASE 7 — hallazgos cerrados (Ledger 0374)

| Hallazgo | Fix | Evidencia |
|---|---|---|
| S22-H1 | **Webhook firmado pero incompleto**: body `{}` con HMAC válido devolvía `ok:true` con `chargeId:null` → el caller podía capturar con null; ahora sin chargeId o con status desconocido (`HAMMERED`, etc.) → `ok:false` (fail-closed) | `adapters-payments-pe index.test.ts` 8/8 (RED→GREEN) |
| S22-H1 | **Replay fuera de ventana**: `assertWebhookFreshness` lanzaba al caller; ahora el adapter atrapa y devuelve `ok:false` (contrato de la interfaz, fail-closed sin excepción filtrada) | `index.test.ts` 8/8 (RED→GREEN) |
| S22-H1 | **Status whitelist**: `verifyWebhook` solo acepta `CAPTURED/FAILED/PENDING/REFUNDED/MANUAL_ELECTRONIC_CAPTURE`; status desconocido → rechazado antes del motor | `index.test.ts` 8/8 (RED→GREEN) |

## Firmas RACI

| Rol | Firma |
|---|---|
| R Backend ACID / Security | OK |
| V QA chaos reintentos | OK |
| V Security HMAC/secrets | OK |
| V PM copy “pagas como tus clientes pagan” | OK |
| A Staff Principal | OK (auditoría FASE 7, ledger 0374) |

## Residuales

- Credenciales live Yape/Plin/MP/Culqi/Niubiz (onboarding ops; sandbox en tests)
- PIN pad hardware (opcional roadmap)
- HTTP real adquirente detrás de secrets (sandbox hoy; live = config)
- Stripe = billing SaaS únicamente (no POS)
