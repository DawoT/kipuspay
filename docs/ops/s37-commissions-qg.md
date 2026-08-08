---
doc_id: ops-s37-commissions-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 37 — Comisiones de vendedor — Quality Gate

**Estado:** GOV-APROBADO (firma A+V)  
**Capabilities:** `sales.commissions`  
**Spec:** Arquitectura §5.3 regla 22 · ADR-0021 · COM-07 · GTM-23 · Roadmap FASE 6C

## Evidencia

| Check | Resultado |
|---|---|
| ADR-0021 (rates→accruals→payouts, Zero-Trust, DAT-12 cents, GL 6311/2111) | GREEN |
| Regla 22 + fence DDL DAT-12 / INTEGER cents / COM-07 reverse | GREEN |
| Mig 0030 `commission_*` + down + V-14 burn-down (57→52) | GREEN |
| Dominio commissions + journal `COMMISSION` + seed 6311/2111 | GREEN |
| ACID accrue on sale (`seller_id`); reverse on NC; payout PAID + audit | GREEN |
| Flags default off + Admin rates/payouts + Owner reporte/CSV + RBAC | GREEN |
| Chaos `commission-accrual-payout` 500 | GREEN |
| GTM-23 + FAQ/marketing/playbook | GREEN |
| `scripts/verify.sh` | SUITE GREEN |
| `scripts/quality.sh` | Quality Gate OK |

## Evidencia RED→GREEN

- RED dominio: `commissions.ts` / journal COMMISSION / GL 6311/2111 inexistentes.
- GREEN dominio: rate precedence + half-up + reverse COM-07 + payout Zero-Trust + 0 nómina.
- RED migración: `0030_sprint37_commissions.sql` inexistente / FKs simples.
- GREEN migración/schema integration DAT-12.
- RED ACID/API: sellerId omitido en sale_items; orquestadores y flags ausentes.
- GREEN ACID/API/UI + chaos 500/0.

## RACI

| Rol | Quién | Firma |
|---|---|---|
| R | Staff Backend Datos + Frontend + Mobile | OK |
| A | Staff Data + Staff PM | OK |
| V | Staff Security (Zero-Trust montos) + Staff QA | OK |

## Residuales

- Badge EMP- / team invite → Sprint 50–51.
- Seriales → Sprint 39.
- Proporcional fino reverse NC → residual OOS.
