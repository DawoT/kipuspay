---
doc_id: adr-0008-qg-debt-en-revision
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0008 — Deuda QG EN REVISION no bloquea apertura de Sprint 11

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-05 |
| Decisores | Staff Principal (por ejecución del plan de auditoría) |
| Consultados | Staff Frontend, Staff Architect |
| Informados | Dirección de Producto, Gobernanza |
| Relaciona | Proceso §8.1 · Proceso §8.2 · Ledger 0213 · 0216 · 0219 · 0222 · 0233 · 0238 · 0251 |

## Contexto

Los CIERRA de implementación de Sprints **5, 5b, 6, 7** y el CIERRA formal de Sprint **10** (0233, corregido por 0238) permanecen con `estado_gov: EN REVISION` y `RACI A+V humano pendiente`. ROADMAP/INDEX ya marcan esas entregas como **Cerrado**. El milestone `GOV-APROBADO` de Proceso §8.2 es de **especificación**, no sustituye Quality Gates de implementación (§8.1).

Sin una decisión explícita, el arranque de Sprint 11 queda ambiguo: ¿hay que esperar Firma A+V humana de toda la deuda o se puede avanzar en código?

## Decisión

La deuda QG `EN REVISION` de Sprints 5–7 y del CIERRA Sprint 10 **no bloquea** la apertura ni la implementación de Sprint 11. Cada CIERRA pendiente sigue siendo **deuda de gobernanza** que requiere Firma A+V humana independiente (o un CORRIGE futuro); no se reescribe el ledger ni se inventa GOV-APROBADO de implementación retroactivo.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Bloquear Sprint 11 hasta A+V de 5–7 y 10 | Paraliza FASE 4 sin remediar evidencia runtime ya GREEN |
| Reescribir entradas CIERRA a GOV-APROBADO | Viola ledger append-only (AGENTS invariante 4) |
| Emitir Firma A+V automática del agente | §8.1 exige `A` + `V` humanos independientes |

## Consecuencias

- **Gana:** Sprint 11 puede arrancar con tip limpio y verify GREEN.
- **Paga:** backlog explícito de Firmas A+V humanas sobre 0213, 0216, 0219, 0222 y 0238.
- **Invariantes tocadas:** Ledger append-only; Proceso §8.1 (evidencia runtime ≠ firma humana).
- **Activación:** inmediata al aceptar este ADR; registro en Ledger 0251.

## Evidencia de cierre

- Tests / checks: `scripts/verify.sh` SUITE GREEN en tip post-0250.
- Ledger: `id: 0251`
- Firmas RACI: `R` Staff Frontend · `A` pendiente humano · `V` pendiente humano
