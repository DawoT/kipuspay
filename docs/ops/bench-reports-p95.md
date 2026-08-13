---
doc_id: ops-bench-reports-p95
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Bench P95 Reportes - S9-H3

| Campo | Valor |
|---|---|
| Fecha UTC | 2026-08-13T02:02:55.344Z |
| Iteraciones | 200 |
| Shards | 4 |
| P50 | 4.5542 ms |
| P95 | 5.2513 ms |
| Max | 7.0278 ms |
| Presupuesto | 50 ms |
| Dentro de presupuesto | SI |

## Metodo

`node scripts/bench/reports-p95.mjs` — fan-out multi-shard (Promise.all) +
serializacion CSV con BOM de un reporte de 50 filas, in-process. No incluye
latencia D1 real ni Workers Edge; el P95 de red se valida en staging con el
mismo presupuesto (Arquitectura §9, runbook reporting-rollups-incident).

## Resultado
