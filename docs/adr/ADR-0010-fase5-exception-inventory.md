---
doc_id: adr-0010-fase5-exception-inventory
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0010 — Inventario de excepciones EN REVISION antes de FASE 5

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-05 |
| Decisores | Staff Principal |
| Consultados | Staff Architect, Staff Verifier, Staff PM |
| Informados | Review Board |
| Relaciona | ADR-0008 · Proceso Anexo B §3 · Ledger 0213–0238 · 0251 · 0254 |

## Contexto

Proceso Anexo B §3 exige que ninguna excepción acumulada cruce al Go/No-Go del Sprint 15
sin resolución. ADR-0008 ya permitió avanzar S11 pese a CIERRAs `EN REVISION` de S5–7 y S10.
Antes de abrir trabajo de hardening FASE 5 hay que inventariar y decidir.

## Inventario (tip post-0254)

| Origen | IDs ledger (ejemplos) | Decisión Staff Principal |
|---|---|---|
| CIERRA S5 / 5b / 6 / 7 | 0213, 0216, 0219, 0222 | **Tracked:** A+V humano pendiente; **no bloquea** S14 tooling; **bloquea** Go S15 si sigue abierto sin firma o ADR fechado |
| CIERRA S10 | 0238 | Igual que fila anterior |
| Slices S11–S12 | 0252 EN REVISION; 0253 GOV-APROBADO S11; 0254 EN REVISION S12 | 0253 cierra S11; 0254 requiere A+V Data/Content/Fiscal **antes de Go S15** |
| ADR-0008 | 0251 | Vigente: deuda no bloquea código; sí exige resolución pre-Go |

## Decisión

1. FASE 5 **Sprint 14 puede abrirse** con excepciones EN REVISION **documentadas** (esta ADR).
2. **Go/No-Go Sprint 15** exige, por cada fila del inventario: firma A+V humana **o** CORRIGE/ADR de excepción con fecha de remedio ≤ 30 días post-launch.
3. No se reescribe el ledger histórico; no se inventa GOV-APROBADO retroactivo.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Bloquear todo FASE 5 hasta A+V de 5–7 | Paraliza hardening sin remediar evidencia ya GREEN |
| Auto-firmar A+V en agente | Viola Proceso §8.1 |

## Consecuencias

- **Gana:** entrada controlada a S14 con trazabilidad Anexo B.
- **Paga:** backlog explícito de firmas humanas pre-Go.
- **Activación:** inmediata; registro en ledger del programa FASE 5.

## Evidencia de cierre

- Checks: `scripts/verify.sh` SUITE GREEN en tip del programa.
- Firmas: `R` Staff Principal · `A` pendiente Review Board en S15 · `V` pendiente por fila.
