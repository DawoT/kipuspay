---
doc_id: ops-s36-installments-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 36 — Cuotas / pago en partes — Quality Gate

**Estado:** GOV-APROBADO (firma A+V)  
**Capabilities:** `sales.installments`  
**Spec:** Arquitectura §5.3 regla 21 · ADR-0020 · COM-06 · GTM-22 · Roadmap FASE 6C

## Evidencia

| Check | Resultado |
|---|---|
| ADR-0020 (schedule sobre AR, principal-only CxC, Zero-Trust pay, DAT-12 cents) | GREEN |
| Regla 21 + fence DDL DAT-12 / INTEGER cents / COM-06 CHECKs | GREEN |
| Mig 0029 `sale_installments` / `sale_installment_payments` + down + V-14 burn-down (59→57) | GREEN |
| Dominio installments + journal `INSTALLMENT` + `planPayAr` principal-only | GREEN |
| ACID plan/pay; hook credit sale; NC full cancela PENDING/OVERDUE | GREEN |
| Flags default off + caja/cuotas + Owner OVERDUE + RBAC Supervisor+ | GREEN |
| Audit `INSTALLMENT` hash encadenado | GREEN |
| Chaos `installment-pay-idempotent` 500 | GREEN |
| GTM-22 + FAQ/marketing/playbook | GREEN |
| `scripts/verify.sh` | SUITE GREEN |
| `scripts/quality.sh` | Quality Gate OK |

## Evidencia RED→GREEN

- RED dominio: `installments.ts` / journal INSTALLMENT inexistentes.
- GREEN dominio: schedule + pay Zero-Trust + OVERDUE on-read + COM-06.
- RED migración: `0029_sprint36_installments.sql` inexistente.
- GREEN migración/schema integration DAT-12.
- RED ACID/API: orquestadores y flags ausentes.
- GREEN ACID/API/UI + chaos 500/0.

## RACI

| Rol | Quién | Firma |
|---|---|---|
| R | Staff Backend ACID + Frontend + Mobile | OK |
| A | Staff Principal | OK |
| V | Staff Security (Zero-Trust pay) + Staff QA | OK |

## Residuales

- Comisiones → Sprint 37 (**cerrado**; ver `docs/ops/s37-commissions-qg.md`).
- Seriales → Sprint 39.
- Reprogramar tras NC parcial → fuera de alcance.
