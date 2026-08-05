---
doc_id: runbook-launch-rollback-sprint15
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Runbook — Lanzamiento y rollback (Sprint 15 game-day)

| Campo | Valor |
|---|---|
| Severidad | SEV-1 si rollback en producción |
| Owner | Staff Principal (release) · Staff SRE |
| Relaciona | Proceso §5.2 · Roadmap Sprint 15 |

## Pre-flight

1. `scripts/verify.sh` SUITE GREEN.
2. `scripts/quality.sh` OK (incluye bench + deps audit).
3. Excepciones ADR-0010 resueltas o con fecha ≤30d.
4. Feature flags soft-launch documentados (`PUBLIC_FEATURE_*`).

## Ensayo staging (game-day)

| Paso | Acción | Evidencia |
|---|---|---|
| 1 | Deploy build actual a staging | URL + SHA |
| 2 | Smoke: `/` `/empezar` cobro POS NV | Screenshots / logs |
| 3 | Simular incidente: flag `FEATURE_POS_CHECKOUT=0` | UI demo; cola intacta |
| 4 | Rollback: redeploy SHA anterior o flags off | Tiempo total documentado |
| 5 | Verificar sync/cola no corrupta | Checklist SRE |

**Resultado del ensayo (Sprint 15):** PASS — rollback por flags &lt; 5 min; sin pérdida de cola local.

## Rollback producción

1. Soft: desactivar flags de superficie (POS/marketing) — caja offline local sigue.
2. Hard: revert deploy Workers/Pages al SHA Go previo.
3. Comunicar a Growth (status page / chat Enterprise).
4. Postmortem en 5 días hábiles (`docs/ops/postmortem-launch.md`).

## Go/No-Go

Quórum Review Board. Un veto bloquea. Desempate: Staff Principal (ADR), nunca relajar SUNAT/ACID/Zero-Trust.
