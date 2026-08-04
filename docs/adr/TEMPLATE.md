---
doc_id: adr-template
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-NNNN — Título corto de la decisión

| Campo | Valor |
|---|---|
| Estado | Propuesto / Aceptado / Deprecado / Superseded por ADR-NNNN |
| Fecha | YYYY-MM-DD |
| Decisores | Staff Principal, … |
| Consultados | … |
| Informados | … |
| Relaciona | Arquitectura §N · Proceso §N · Ledger NNNN · ADR-… |

## Contexto

Qué problema o fuerza obliga a decidir ahora. Citar la sección canónica (`§`),
no re-escribir la regla.

## Decisión

La opción elegida, en una o dos oraciones. Debe ser verificable (test, check del
gate, o criterio de aceptación medible).

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| A | … |
| B | … |

## Consecuencias

- **Gana:** …
- **Paga:** …
- **Invariantes tocadas:** (AGENTS §2 / Registry) — cómo se respetan.
- **Activación:** sprint / feature flag / migración.

## Evidencia de cierre

- Tests / checks: …
- Ledger: `id: ____`
- Firmas RACI: `R` ____ · `A` ____ · `V` ____
