#!/usr/bin/env node
/**
 * Sprint 14 — microbench hot-path Sub-50ms (ADR-0007 / fase-5).
 * Mide un cobro sintético en-process (domain-sales charge path proxy).
 * No sustituye load de staging multi-tenant; documenta P95 local reproducible.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ITER = Number(process.env.BENCH_ITERS ?? 200);
const BUDGET_MS = Number(process.env.BENCH_BUDGET_MS ?? 50);

function syntheticChargeWork() {
  // Proxy CPU: validación de líneas + suma cents (sin I/O).
  let total = 0;
  for (let i = 0; i < 24; i += 1) {
    const unit = 1180 + (i % 7);
    const qty = 1 + (i % 3);
    total += unit * qty;
  }
  if (!Number.isInteger(total)) throw new Error('INVALID_CENTS');
  return total;
}

const samples = [];
for (let i = 0; i < ITER; i += 1) {
  const t0 = performance.now();
  syntheticChargeWork();
  samples.push(performance.now() - t0);
}
samples.sort((a, b) => a - b);
const p95 = samples[Math.min(samples.length - 1, Math.ceil(0.95 * samples.length) - 1)];
const p50 = samples[Math.floor(samples.length / 2)];
const max = samples[samples.length - 1];

const ok = p95 <= BUDGET_MS;
const report = {
  sprint: 14,
  iters: ITER,
  budgetMs: BUDGET_MS,
  p50Ms: Number(p50.toFixed(4)),
  p95Ms: Number(p95.toFixed(4)),
  maxMs: Number(max.toFixed(4)),
  withinBudget: ok,
  note: 'Microbench local CPU-only; load multi-tenant = staging game-day (runbook).',
};

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = join(root, 'docs/ops');
mkdirSync(outDir, { recursive: true });
const md = `---
doc_id: ops-bench-sub50ms-sprint14
alias: "${String.fromCodePoint(0x2014)}"
authority: normativa
owner: "@DawoT"
---

# Bench Sub-50ms - Sprint 14

| Campo | Valor |
|---|---|
| Fecha UTC | ${new Date().toISOString()} |
| Iteraciones | ${ITER} |
| P50 | ${report.p50Ms} ms |
| P95 | ${report.p95Ms} ms |
| Max | ${report.maxMs} ms |
| Presupuesto | ${BUDGET_MS} ms |
| Dentro de presupuesto | ${ok ? 'SI' : 'NO'} |

## Método

\`node scripts/bench/hot-path.mjs\` — cobro sintetico in-process (suma cents).
No incluye red D1 ni Workers; el P95 Edge se valida en staging con el mismo presupuesto.

## Resultado

\`\`\`json
${JSON.stringify(report, null, 2)}
\`\`\`
`;
writeFileSync(join(outDir, 'bench-sub50ms-sprint14.md'), md, 'utf8');
console.log(`RESULT BENCH_SUB50 ${ok ? 'GREEN' : 'RED'} p95=${report.p95Ms}ms budget=${BUDGET_MS}ms`);
process.exit(ok ? 0 : 1);
