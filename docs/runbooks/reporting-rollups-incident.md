---
doc_id: runbook-reporting-rollups-incident
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Runbook — Reporting rollups / cron multi-shard (Sprint 9)

| Campo | Valor |
|---|---|
| Severidad tipica | SEV-2 (rollup stale) / SEV-1 (cron down multi-shard) |
| Owner on-call | Staff SRE + Staff Data |
| Ultima ensayada | 2026-08-04 (local quality / game day checklist) |
| Relaciona | Arquitectura §9 · GTM-03/11 · Sprint 9 |

## Sintomas

- Modo Dueño ranking vacío o `rankingClaimFrozen: true` con catalog on.
- Reportes `/api/reports/*` → 404 `FEATURE_OFF` o montos desfasados vs caja.
- Cron `POST /api/reporting/cron/daily-rollups` no corre o `elapsedMs` fuera de presupuesto.

## Flags

| Flag | Default | Efecto |
|---|---|---|
| `FEATURE_REPORTING_ROLLUPS` | `0` | Cron / rematerialize batch shard |
| `FEATURE_REPORTING_CATALOG` | `0` | Catálogo + lecturas reportes + unfreeze ranking |
| `FEATURE_REPORTING_EXPORT` | `0` | `?format=csv` |

## Diagnostico rapido

1. `scripts/verify.sh` + `scripts/quality.sh` (incluye chaos `rollup-idempotent` 4g).
2. Correr cron 2× con mismo `scheduledTimeMs` → mismos PK/montos (idempotencia).
3. Edge D: venta de día cerrado → `rematerializeDailyRollup` financial + product.
4. Confirmar **0** lecturas de reportes en `processOfflineSaleAtomic` hot path.

## P95 Sub-50ms

Presupuesto: P95 del fan-out por shard (pares tenant×branch del día cerrado) **&lt; 50 ms** en entorno controlado con N≤10 pares.

Evidencia local (quality): respuesta cron incluye `elapsedMs` y `p95BudgetMs: 50`. Con `pairs === 0` se acepta `withinBudget` (no hay trabajo). Bench harness: `runDailyRollupsCron` unit/integration.

## Error budget

| Servicio | SLO | Burn |
|---|---|---|
| Cron daily rollups | 99% éxito / día | 2 fallos consecutivos → page SRE |
| Lectura reportes Arranque | 99.5% &lt; 50 ms | p95 15 min |
| Advanced (Crece) | 99% (402 por plan no cuenta) | — |

## Game day checklist (simulacro)

- [ ] Apagar un shard ficticio → `Promise.all` no bloquea el resto
- [ ] Re-run cron 2× → 0 duplicados PK financial/product
- [ ] Sync offline tardío día cerrado → rematerialize + banner Dueño “no en vivo”
- [ ] `past_due`: `/api/reports/arqueo` **no** 402; `/api/reports/advanced/top-products` sí 402
- [ ] Export CSV BOM; montos INTEGER cents
- [ ] Staff Data certifica SoT; Growth descongela GTM-03/11 solo con evidencia

## Fronteras

No forecasting (S46), no agentic insights (S49), no Excel npm, no `UPSERT INTO`.
