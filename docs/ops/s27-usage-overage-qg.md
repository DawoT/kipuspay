---
doc_id: ops-s27-usage-overage-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 27 — Cupo + sobregiro Stripe + loyalty locks — Quality Gate

**Estado:** GOV-APROBADO (firma A+V)  
**Capabilities:** `billing.usage_overage`, `loyalty.reservations`  
**Spec:** Arquitectura §4.1 · §5.4 · GTM-04 · Roadmap FASE 8

## Evidencia

| Check | Resultado |
|---|---|
| Mig 0020 `usage_counters` / `usage_events` / `billing_overages` | GREEN |
| Cupo en mismo `db.batch` venta/NC; void/RC no cuentan | GREEN — domain-billing + usage-meter-batch |
| 0 Stripe en hot path cobro/emisión | GREEN — no-hotpath-stripe.test |
| Doble cron no doble-cobra | GREEN — meter-overage-cron + chaos usage-overage-idempotent |
| Loyalty reuse + offline off + EXPIRED_ON_RETRY | GREEN — loyalty.s27-qg |
| Caja nunca 402 por cupo | GREEN — plan-routes / auth-decide |
| Flags default off (`FEATURE_BILLING_USAGE_OVERAGE`) | GREEN |
| GTM-04 descongelado + marketing disclaimer | GREEN |
| `scripts/verify.sh` | SUITE GREEN |
| `scripts/quality.sh` | Quality Gate OK |

## RACI

| Rol | Quién | Firma |
|---|---|---|
| R | Backend ACID + Security + Data | OK |
| A | Staff Principal | OK |
| V | Security + Backend ACID + Growth + QA/Chaos | OK |

## Residuales

- Credenciales Stripe staging live → runbook metered
- Devoluciones / NC no reembolsa cupo (claim) → Sprint 28 / GTM-05
