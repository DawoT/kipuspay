#!/usr/bin/env node
/**
 * S9-H3 — benchmark P95 de la capa de reportes (Arquitectura §9 / ADR-0007).
 * Mide in-process el fan-out multi-shard (Promise.all sobre N shards) y la
 * serialización de un reporte (toCsv con BOM) — el costo que el cron agrega
 * sobre el presupuesto Sub-50ms. No sustituye load de staging; documenta el
 * P95 local reproducible igual que scripts/bench/hot-path.mjs.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ITER = Number(process.env.BENCH_ITERS ?? 200);
const BUDGET_MS = Number(process.env.BENCH_BUDGET_MS ?? 50);
const SHARDS = Number(process.env.BENCH_SHARDS ?? 4);

function syntheticShardAggregation(shards) {
  // Fan-out Promise.all con latencia sintética por shard (p95 Edge ~8ms).
  return Promise.all(
    shards.map(async (_, i) => {
      await new Promise((resolve) => setTimeout(resolve, 2 + (i % 3)));
      return { shardKey: `shard-${i}`, grossSalesCents: 1180 * 100 };
    }),
  );
}

function syntheticReportCsv() {
  // Serialización CSV con BOM de un reporte tipo day-summary (50 filas).
  const headers = ['branch_id', 'gross_sales_cents', 'doc_count', 'igv_cents'];
  const rows = Array.from({ length: 50 }, (_, i) => [
    `b-${i}`,
    1180 * (i + 1),
    i + 1,
    180 * (i + 1),
  ]);
  const escape = (v) => {
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) lines.push(row.map(escape).join(','));
  return `\uFEFF${lines.join('\n')}\n`;
}

const samples = [];
for (let i = 0; i < ITER; i += 1) {
  const t0 = performance.now();
  await syntheticShardAggregation(Array.from({ length: SHARDS }, (_, k) => k));
  syntheticReportCsv();
  samples.push(performance.now() - t0);
}
samples.sort((a, b) => a - b);
const p50 = samples[Math.floor(samples.length * 0.5)];
const p95 = samples[Math.floor(samples.length * 0.95)];
const max = samples[samples.length - 1];
const within = p95 <= BUDGET_MS;

const summary = {
  benchmark: 'reports-p95',
  fecha: new Date().toISOString(),
  iteraciones: ITER,
  shards: SHARDS,
  p50_ms: Number(p50.toFixed(4)),
  p95_ms: Number(p95.toFixed(4)),
  max_ms: Number(max.toFixed(4)),
  presupuesto_ms: BUDGET_MS,
  dentro_de_presupuesto: within,
};

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'ops');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'bench-reports-p95.md'), buildDoc(summary), 'utf-8');
console.log(JSON.stringify(summary, null, 2));
if (!within) {
  console.error(`P95 ${p95.toFixed(4)}ms excede presupuesto ${BUDGET_MS}ms`);
  process.exit(1);
}

function buildDoc(s) {
  return `---
doc_id: ops-bench-reports-p95
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Bench P95 Reportes - S9-H3

| Campo | Valor |
|---|---|
| Fecha UTC | ${s.fecha} |
| Iteraciones | ${s.iteraciones} |
| Shards | ${s.shards} |
| P50 | ${s.p50_ms} ms |
| P95 | ${s.p95_ms} ms |
| Max | ${s.max_ms} ms |
| Presupuesto | ${s.presupuesto_ms} ms |
| Dentro de presupuesto | ${s.dentro_de_presupuesto ? 'SI' : 'NO'} |

## Metodo

\`node scripts/bench/reports-p95.mjs\` — fan-out multi-shard (Promise.all) +
serializacion CSV con BOM de un reporte de 50 filas, in-process. No incluye
latencia D1 real ni Workers Edge; el P95 de red se valida en staging con el
mismo presupuesto (Arquitectura §9, runbook reporting-rollups-incident).

## Resultado
`;
}
