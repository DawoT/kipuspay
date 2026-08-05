---
doc_id: ops-security-audit-sprint14
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Informe de auditoría de seguridad — Sprint 14

| Campo | Valor |
|---|---|
| Fecha | 2026-08-05 |
| Tipo | Auditoría interna de control (soft-launch) |
| Aprobador | Staff Principal |
| Relaciona | Roadmap Sprint 14 · CAL-03/04 · ADR-0011 |

## Alcance

- Secretos: Gitleaks (CI + local quality).
- Invariantes de dominio: Semgrep `semgrep/rules/invariants.yml`.
- CodeQL workflow (CI).
- Dependencias: `scripts/checks/deps_audit.sh` (`pnpm audit --audit-level=high`).
- ASVS L2 auth slice: ADR-0004 (Sprint 2).

## Hallazgos

| ID | Severidad | Estado | Notas |
|---|---|---|---|
| — | Critical | **0 abiertas** | Sin hallazgos críticos en este ciclo |
| — | High | **0 abiertas** | `pnpm audit --audit-level=high` GREEN; override `undici>=7.29.0` en `pnpm-workspace.yaml` (GHSA-4cwx-7wf7-3272) |
| S14-INFO-1 | Info | Aceptado | Chaos shard-DR completo diferido a Sprint 26 (ADR-0011) — no es vuln de producto |

## Criterio fase-5

> 0 vulnerabilidades críticas **o altas** abiertas; un plan futuro nunca convierte una alta en mitigada.

Cumple: no hay altas abiertas; el diferimiento de shard-DR está en ADR-0011 (alcance), no como mitigación de CVE.

## Firma

- Staff QA/Chaos (R) · Staff Security (R) · Staff Principal (A) — ciclo Sprint 14.
- Pentest externo: backlog post-launch si el Review Board lo exige en S15 (no bloquea cierre S14 interno con 0 high/crit).
