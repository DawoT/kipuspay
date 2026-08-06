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

## Firmas RACI

| Rol | Firma |
|---|---|
| R Backend ACID / Security | OK |
| V QA chaos reintentos | OK |
| V Security HMAC/secrets | OK |
| V PM copy “pagas como tus clientes pagan” | OK |
| A Staff Principal | ledger A+V |

## Residuales

- Credenciales live Yape/Plin/MP/Culqi/Niubiz (onboarding ops; sandbox en tests)
- PIN pad hardware (opcional roadmap)
- HTTP real adquirente detrás de secrets (sandbox hoy; live = config)
- Stripe = billing SaaS únicamente (no POS)
