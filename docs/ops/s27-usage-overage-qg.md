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

## Auditoría FASE 8 — hallazgos cerrados (Ledger 0377/0378)

| Hallazgo | Fix | Evidencia |
|---|---|---|
| S27-H1 | **Concurrencia loyalty sin evidencia D1 real**: nuevo integration test — 2 reservas paralelas con saldo justo → a lo más 1 gana (guard atómico SQL), saldo jamás negativo, reservas ≤ balance siempre; idempotencia no duplica | `reserve-loyalty-atomic.integration.test.ts` 2/2 en D1 real (RED→GREEN) |
| S27-H2 | **Cron de cobro Stripe sin guard**: `POST /api/billing/cron/meter-overage` COBRA sobregiros y cualquier usuario autenticado lo disparaba; ahora admin/owner only → `403 FORBIDDEN_ADMIN`, rol desde el JWT | `meter-overage-routes.test.ts` 5/5 (RED→GREEN) |
| S27-H1 | **Verificado (sin cambio)**: idempotencia doble-cron por `stripe_idempotency_key` (UNIQUE violation → skipped, no doble cobro); cupo en mismo `db.batch` de la venta; 0 Stripe en hot path | `meter-overage-cron.test.ts` 7/7 |

## RACI

| Rol | Quién | Firma |
|---|---|---|
| R | Backend ACID + Security + Data | OK |
| A | Staff Principal | OK |
| V | Security + Backend ACID + Growth + QA/Chaos | OK |

## Residuales

- Credenciales Stripe staging live → runbook metered
- Devoluciones / NC no reembolsa cupo (claim) → Sprint 28 / GTM-05
