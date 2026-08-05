---
doc_id: adr-0011-sprint14-shard-chaos-scope
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0011 — Alcance de caos de shard en Sprint 14 vs Sprint 26

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-05 |
| Decisores | Staff Principal · Staff QA/Chaos · Staff SRE |
| Relaciona | Roadmap Sprint 14 · Sprint 26 · `packages/chaos-harness` · ADR-0007 |

## Contexto

FASE 5 Sprint 14 pide “simulacro de caída de shard”. El harness marca escenarios de
fallo de Durable Object / shard como activos hacia **Sprint 26** (breaker). Confundir
PASS unitario del harness con recuperación multi-shard verificada sería un falso GREEN.

## Decisión

En **Sprint 14**:

1. Se exige evidencia runtime de **storage local / low-end / quota** (jueces + integración
   donde exista) y de **load Sub-50ms** documentada en `scripts/bench/`.
2. El simulacro de **pérdida de un shard con RPO verificado** queda **explícitamente** en
   Sprint 26; S14 registra un **drill de degradación documentado** (fail-closed del juez
   + runbook) sin reclamar “recuperación multi-shard sin pérdida” como cerrada.
3. Una vulnerabilidad alta **nunca** se mitiga con “plan futuro” ([docs/roadmap/fase-5.md](docs/roadmap/fase-5.md)).

## Consecuencias

- **Gana:** honestidad de evidencia S14.
- **Paga:** CA de “caída de shard” completa se cierra en S26; S14 no afirma FASE 5 shard-DR.
- **Invariantes:** fail-closed; no PASS vacío de `run.mjs` unit-only como DoD S14.
