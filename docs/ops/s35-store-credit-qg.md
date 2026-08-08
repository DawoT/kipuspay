---
doc_id: ops-s35-store-credit-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 35 — Crédito de tienda / vales / gift cards — Quality Gate

**Estado:** GOV-APROBADO (firma A+V)  
**Capabilities:** `ledger.store_credit`  
**Spec:** Arquitectura §5.3 regla 20 · ADR-0019 · GTM-21 · Roadmap FASE 6C

## Evidencia

| Check | Resultado |
|---|---|
| ADR-0019 (vale=venta+cupo, saldo servidor, GL 2102 ≠ 2101, DAT-12 cents) | GREEN |
| Regla 20 + fence DDL DAT-12 / INTEGER cents | GREEN |
| Mig 0028 `store_credit_accounts` / `store_credit_transactions` + down + V-14 burn-down | GREEN |
| Dominio store-credit + journal 2102 + PaymentMethodCode `store_credit` | GREEN |
| ACID issue/redeem/expire/adjust (sale engine + NC consent; 0 offline redeem) | GREEN |
| Flags default off + caja vale / Admin / Owner | GREEN |
| Audit `STORE_CREDIT_ISSUE` / `STORE_CREDIT_REDEEM` hash encadenado | GREEN |
| Chaos `store-credit-issue-redeem` 500 | GREEN |
| GTM-21 + FAQ/marketing/playbook | GREEN |
| `scripts/verify.sh` | SUITE GREEN |
| `scripts/quality.sh` | Quality Gate OK |

## Evidencia RED→GREEN

- RED dominio: `store-credit.ts` / journal 2102 inexistentes.
- GREEN dominio: máquina ISSUE/REDEEM/EXPIRE/ADJUST + Zero-Trust redeem + 2102.
- RED migración: `0028_sprint35_store_credit.sql` inexistente.
- GREEN migración/schema integration DAT-12.
- RED ACID/API: orquestadores y flags ausentes.
- GREEN ACID/API/UI + chaos 500/0.

## RACI

| Rol | Quién | Firma |
|---|---|---|
| R | Staff Backend ACID + Frontend + Data | OK |
| A | Staff Principal | OK |
| V | Staff Security (anti-fraude saldo) + Staff QA | OK |

## Residuales

- Comisiones → Sprint 37.
- Seriales → Sprint 39.
