---
doc_id: ops-s28-sales-returns-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 28 — Devoluciones con política N días — Quality Gate

**Estado:** GOV-APROBADO (firma A+V)  
**Capabilities:** `sales.returns`  
**Spec:** Arquitectura §5.3 regla 13 · ADR-FISCAL-001 · GTM-05 · Roadmap FASE 6B

## Evidencia

| Check | Resultado |
|---|---|
| Mig 0021 `return_policies` / `sales_returns` / `sale_return_items` | GREEN |
| Dominio ventana N días (`OUTSIDE_WINDOW` / qty) | GREEN — domain-sales returns |
| `processReturnAtomic` 07 / NV_RETURN + PMP + cash + RETURN audit + E-D | GREEN |
| Uncatalogued → 0 stock fantasma | GREEN — chaos + unit |
| E-D CxC misma tx | GREEN — process-return + chaos |
| Cupo: NC/NV_RETURN +1; no refund origen (§4.1) | GREEN — appendUsageMeterToPlan (S27) |
| Flags default off (`FEATURE_SALES_RETURNS` / `PUBLIC_FEATURE_SALES_RETURNS`) | GREEN |
| Chaos `sales-returns-window` 500 ciclos | GREEN |
| GTM-05 descongelado + FAQ/marketing | GREEN |
| `scripts/verify.sh` | SUITE GREEN |
| `scripts/quality.sh` | Quality Gate OK |

## RACI

| Rol | Quién | Firma |
|---|---|---|
| R | Backend ACID + Fiscal + Frontend caja | OK |
| A | Staff Principal | OK |
| V | Fiscal + QA (cost) + QA/Chaos + PM (GTM) | OK |

## Residuales

- Store credit producto completo → FASE 6C / regla 20
- 3-way proveedores → Sprint 29
- Credenciales staging para NC reales SUNAT → runbook fiscal existente
