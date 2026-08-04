---
doc_id: adr-0001
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0001 — Adopción del roadmap, DoD global, Changelog inmutable y toolchain CAL

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-04 |
| Decisores | Staff Principal |
| Consultados | Staff QA/Chaos, Staff Backend Datos, Staff Security |
| Informados | Escuadrón completo |
| Relaciona | Proceso §3 · §5.2 · §7 · §8.1 · Arquitectura §1.1 · §13 · Roadmap FASE 0 · Ledger 0188–0189 |

## Contexto

El corpus normativo de KipusPay (`GOV-APROBADO`, Ledger 0176/0177) define el producto y el
proceso, pero el Sprint 0 exige adopción formal: charter, DoD, changelog append-only,
pipeline de calidad y estructura de monorepo. Sin este ADR, los sprints de FASE 1 no
tienen un punto de arranque auditable (Roadmap FASE 0: *ningún sprint de Fase 1 inicia
sin Sprint 0 cerrado*).

## Decisión

1. **Roadmap y proceso.** Se adoptan [`docs/PROCESS.md`](../PROCESS.md) (DoD §3, RACI §8.1,
   changelog §7) y [`docs/ROADMAP.md`](../ROADMAP.md) + `docs/roadmap/*` como autoridad de
   alcance por sprint.
2. **Changelog inmutable.** [`docs/LEDGER.md`](../LEDGER.md) schema v2 con cadena
   `prev_hash`/`entry_hash` es el único registro de cambios normativos; invariante 4
   (AGENTS §2) y check V-16.
3. **Calidad de implementación.** Se adoptan `Arquitectura §13` y Registry CAL-01..08
   (dinero entero, TS strict, cobertura, chaos por capa, SAST/secretos, bundle/zero-dep,
   TDD RED→GREEN, complejidad). El gate documental V-00..V-24 y `scripts/quality.sh` /
   workflows `quality.yml` + `security.yml` + `codeql.yml` son condición necesaria de merge.
4. **Monorepo hexagonal.** Estructura de `Arquitectura §1.1`: `packages/domain-*`,
   `packages/adapters-*`, `apps/pos-web`, `apps/worker-api`, `apps/worker-fiscal`;
   `domain-*` no importa Hono/D1 binding/Svelte/SDK SUNAT (CAL-01).
5. **Plantillas.** Toda decisión no trivial usa [`TEMPLATE.md`](TEMPLATE.md); todo
   procedimiento operativo usa [`../runbooks/TEMPLATE.md`](../runbooks/TEMPLATE.md).

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Empezar Sprint 1 sin cerrar Sprint 0 | Viola el Quality Gate explícito de FASE 0 |
| Calidad solo como guía, sin checks en CI | Ya produjo un falso GREEN documental (Ledger 0179); no es aceptable a nivel Staff |
| Monorepo único package | Impide boundaries CAL-01 y el mapa de packages de §1.1 |

## Consecuencias

- **Gana:** arranque auditable de FASE 1; agents tienen router (`AGENTS.md`) + índice + gate.
- **Paga:** todo cambio de código de sprints 1–53 exige contrato TDD en el ledger (CAL-07 / V-20).
- **Invariantes:** no se reabren ADR-FISCAL-001, ADR-ARCH-002 ni el modelo de dinero INTEGER cents.
- **Activación:** Sprint 0 cerrado con esta ADR + harness D1 de humo + tracker ROADMAP.

## Evidencia de cierre

- Checks: `scripts/verify.sh` SUITE GREEN (V-00..V-24); `scripts/quality.sh` GREEN.
- Ledger: `id: 0189` (cierre Sprint 0).
- Firmas RACI: `R` Staff Principal · `A` Staff Principal · `V` Staff QA/Chaos.
