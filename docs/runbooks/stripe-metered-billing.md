---
doc_id: runbook-stripe-metered-billing
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Runbook — Stripe Metered Billing (sobregiro cupo)

| Campo | Valor |
|---|---|
| Severidad tipica | SEV-2 (margen); SEV-3 si solo staging |
| Owner on-call | Staff Backend ACID / SRE |
| Ultima ensayada | 2026-08-07 (Sprint 27 unit + chaos usage-overage-idempotent) |
| Relaciona | Arquitectura §4.1 · ADR-0005 · GTM-04 · Roadmap Sprint 27 |

## Sintomas

- Cron `POST /api/billing/cron/meter-overage` responde 502 con `errors[]`.
- `usage_counters.doc_count` crece pero `billing_overages` no avanza.
- Stripe Dashboard sin meter events para el día Lima.

## Reglas no negociables

1. Cobro/emisión **nunca** hacen `fetch` a Stripe (hot path = D1 only).
2. Idempotency: `stripe_idempotency_key = tenant:periodYm:limaDay` UNIQUE.
3. Doble cron el mismo día civil Lima → segunda pasada `skippedIdempotent`.
4. Flag `FEATURE_BILLING_USAGE_OVERAGE` default off; sin secret → fail-closed.
5. Caja nunca 402 por cupo (Principio 5 / Plan Guard).

## Secrets (staging)

- `STRIPE_SECRET_KEY` (Workers secret; nunca en repo ni wrangler vars).
- `tenants.stripe_customer_id` poblado por onboarding/webhook — no hardcode.

## Replay seguro

```bash
# Flag on + secret inyectado en staging
curl -X POST "$API/api/billing/cron/meter-overage" -H "Authorization: Bearer $CRON_JWT"
# Segunda llamada mismo día: reported=0, skippedIdempotent>=1
```

## Mitigacion

| Caso | Accion |
|---|---|
| `missing_stripe_customer` | Completar customer en Stripe + UPDATE tenant; re-run cron |
| Stripe 5xx | Reintentar cron; no avanzar `overage_reported_thru` (ya fail-closed) |
| Doble cargo sospechoso | Verificar UNIQUE key; Stripe Idempotency-Key debe dedupe |

## Relacionado

- Webhooks de suscripción: [`stripe-webhook-failure.md`](stripe-webhook-failure.md)
- QG: [`docs/ops/s27-usage-overage-qg.md`](../ops/s27-usage-overage-qg.md)
