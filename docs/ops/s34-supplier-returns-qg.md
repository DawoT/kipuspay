---
doc_id: ops-s34-supplier-returns-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 34 — Devolución a proveedor — Quality Gate

**Estado:** GOV-APROBADO (firma A+V)  
**Capabilities:** `purchasing.returns`  
**Spec:** Arquitectura §5.3 regla 19 · ADR-0018 · GTM-20 · Roadmap FASE 6C

## Evidencia

| Check | Resultado |
|---|---|
| ADR-0018 (0 CPE, PMP outbound, CxP explícito, DAT-12 microunits) | GREEN |
| Regla 19 + fence DDL DAT-12 / INTEGER microunits | GREEN |
| Mig 0027 `supplier_returns` / `supplier_return_items` + down + V-14 burn-down | GREEN |
| Dominio outbound PMP + supplier-return + journal `SUPPLIER_RETURN` | GREEN |
| ACID create/close/cancel (stock solo CLOSED; 0 CPE) | GREEN |
| Flags default off + Admin/Owner | GREEN |
| Audit `SUPPLIER_RETURN` / `SUPPLIER_PRICE_DIFF` hash encadenado | GREEN |
| Chaos `supplier-return-receive` 500 | GREEN |
| GTM-20 + FAQ/marketing/playbook | GREEN |
| `scripts/verify.sh` | SUITE GREEN |
| `scripts/quality.sh` | Quality Gate OK |

## Evidencia RED→GREEN

- RED dominio: `supplier-return.ts` / `refreshAvgCostOnOutboundCents` inexistentes.
- GREEN dominio: máquina + PMP outbound + AP 422.
- RED migración: `0027_sprint34_supplier_returns.sql` inexistente.
- GREEN migración/schema integration.
- RED ACID/API: orquestadores y flags ausentes.
- GREEN ACID/API/UI + chaos 500/0.

## RACI

| Rol | Quién | Firma |
|---|---|---|
| R | Staff Backend Datos + ACID + Frontend | OK |
| A | Staff Principal | OK |
| V | Staff QA + Staff Security + Staff Growth | OK |

## Residuales

- Store credit → Sprint 35 (cerrado: `docs/ops/s35-store-credit-qg.md`).
- Cuotas / comisiones → Sprints 36–37.
- Seriales → Sprint 39.
