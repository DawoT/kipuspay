---
doc_id: runbook-fiscal-deadlines-rc
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Runbook — Plazos fiscales, RC y alertas

**Owners:** Staff Fiscal + Staff SRE  
**Flags:** `FEATURE_FISCAL_RC` (default `0`), `FEATURE_CPE_PORTAL` (default `0`)  
**ADR:** ADR-FISCAL-001 (plazos factura 3d / boleta-RC 7d)

## Plazos

| Documento | Plazo | Worker |
|---|---|---|
| Factura `01` | `must_submit_by` = issued + 3d | `processFiscalDeadlines` |
| Boleta `03`/`12` + RC | fin día Lima + ventana 7d | `buildDailySummary` + deadlines |

## Alertas Dueño

1. **T-24h** — `fiscal_owner_alerts.alert_kind=T24H`
2. **T-6h** — `T6H`
3. **DEADLINE_EXCEEDED** — marca `sales.sunat_status`; outbox `FAILED` + `last_error=DEADLINE_EXCEEDED`; payload sugiere **NC E-A** (sin CDR)

CA: **0** CPE/RC fuera de plazo **sin** alerta.

## Resumen Diario (RC)

- Clave: `(tenant_id, summary_date, rc_type=PRIMARY)` — **no** por `branch_id` (FIS-03).
- Endpoint: `POST /api/fiscal/cron` `{ "action": "daily-summary", "tenantId", "summaryDate" }` con flag on.
- Arqueo Z **nunca** dispara RC (`CASH_CLOSE_MUST_NOT_TRIGGER_RC`).
- NRUS ≤ S/5 (`NRUS_UNITARY_OMISSION_CENTS=500`): omisión unitaria consolidada en RC del día; **no inventar series**.

## Baja boleta (E-C)

- `POST /api/fiscal/void-boleta` `{ "saleId" }` → `VOID_PENDING_RC`.
- Si RC del día ya `PROCESSING`/`ACCEPTED` → **422** `VOID_AFTER_RC_SENT` (usar NC).
- Invariante: **no** altera stock ni caja.

## Portal CPE (1 año)

- `GET /v1/cpe/portal/:tenantId/:saleId?token=…` (`FEATURE_CPE_PORTAL=1`).
- Token = SHA-256(`tenantId:saleId:secret`); retención ≥ 365 días; HTML zero-dep.

## Chaos

```bash
node scripts/chaos/run.mjs --scenario deadline --sprint 5
```

Fail-closed: sin deps de evidencia → error, nunca PASS silencioso.

## Rollback

1. `FEATURE_FISCAL_RC=0` / `FEATURE_CPE_PORTAL=0`
2. No reescribir ledger; correcciones = entrada nueva.
