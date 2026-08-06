---
doc_id: adr-0013-branch-kds-hub
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0013 — BranchKdsHub Durable Object (KDS WebSocket) vs TenantState

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-06 |
| Decisores | Staff Principal · Staff Backend ACID · Staff Hardware |
| Consultados | Staff Frontend · Staff SRE |
| Informados | Staff PM · Staff Growth |
| Relaciona | Roadmap Sprint 19 · Arquitectura §5.3 regla 7 · §1.1 `orders.kds` · Proceso §8.1 |

## Contexto

Sprint 19 exige que un ítem `FIRED` aparezca en KDS **&lt;1s en LAN** vía WebSocket.
Ya existe `TenantState` (Durable Object) para revocación fail-closed del plano de control
(Arquitectura §3). Mezclar fan-out de cocina con revocación acoplaría latencia y
ciclo de vida distintos en el mismo DO.

## Decisión

1. **`BranchKdsHub`** — DO hibernatable por `idFromName(tenantId:branchId)` dedicado a
   WebSocket fan-out (`ITEM_FIRED` / `ITEM_READY` / `ITEM_CANCELLED` / `ORDER_READY`).
2. **`TenantState`** permanece solo para estado de revocación / reinstate.
3. El CA de latencia se mide con `KDS_FIRE_SLA_MS` (domain-sales) en harness/E2E;
   **no** se difiere el WebSocket a un sprint futuro (a diferencia de ADR-0012).

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Reusar TenantState para WS | Acopla auth-plane con realtime de cocina; hibernación y storage distintos |
| Diferir WS (HTTP poll) | Deja claim `kds_split` congelado; incumple CA roadmap &lt;1s |
| Un DO global por tenant | Contención multi-sucursal; fan-out innecesario entre branches |

## Consecuencias

- **Gana:** SLA medible; aislamiento de fallos; capability `orders.kds` sin rol `kds`.
- **Paga:** binding `BRANCH_KDS_HUB_DO` + migración wrangler `v2-branch-kds-hub`.
- **Invariantes:** ADR-ARCH-002 (flags, no `switch(vertical)`); auth vía `orders.kds.operate` en cashier.
- **Activación:** `FEATURE_ORDERS_KDS` (default off).

## Evidencia de cierre

- Tests: `kds-hub-helpers.test.ts`, order-routes fire notify, ops [`docs/ops/s19-orders-kds-qg.md`](../ops/s19-orders-kds-qg.md)
- Ledger: CIERRA Sprint 19
- Firmas RACI: `R` Frontend/ACID/Hardware · `A` Staff Principal · `V` Design+PM+QA
