---
doc_id: ops-bench-sub50ms-sprint14
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Bench Sub-50ms - Sprint 14

| Campo | Valor |
|---|---|
| Fecha UTC | 2026-08-16T23:14:35.659Z |
| Iteraciones | 200 |
| P50 | 0.0018 ms |
| P95 | 0.0039 ms |
| Max | 0.3329 ms |
| Presupuesto | 50 ms |
| Dentro de presupuesto | SI |

## Método

`node scripts/bench/hot-path.mjs` — cobro sintetico in-process (suma cents).
No incluye red D1 ni Workers; el P95 Edge se valida en staging con el mismo presupuesto.

## Resultado

```json
{
  "sprint": 14,
  "iters": 200,
  "budgetMs": 50,
  "p50Ms": 0.0018,
  "p95Ms": 0.0039,
  "maxMs": 0.3329,
  "withinBudget": true,
  "note": "Microbench local CPU-only; load multi-tenant = staging game-day (runbook)."
}
```
