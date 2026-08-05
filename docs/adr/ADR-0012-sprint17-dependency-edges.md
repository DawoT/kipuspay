---
doc_id: adr-0012-sprint17-dependency-edges
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0012 — Criterios S17: núcleo cerrable vs edges diferidos (S25 / S51)

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-05 |
| Decisores | Staff Principal · Staff Backend ACID · Staff QA |
| Consultados | Staff Frontend · Staff SRE · Staff Design |
| Informados | Staff PM · Staff Growth |
| Relaciona | Roadmap Sprint 17 · Sprint 25 · Sprint 51 · Arquitectura §5.3 · Proceso §8.1 · ADR-ARCH-002 |

## Contexto

Sprint 17 (FASE 6) exige caja dura, authz de descuentos, `credit_limit`, `audit_events`
sensibles y `sale_reprints` COPIA. Dos criterios de aceptación de [docs/roadmap/fase-6.md](docs/roadmap/fase-6.md)
dependen de entregas futuras:

- **Edge 2D** — gate de print outbox antes del cierre Z (`outbox.pendingCount()`, Arquitectura §7.5) → Sprint **25**.
- **Edge 1C** — desglose por operador vía `SHIFT_TRANSFER` / `cash_register_shifts` → FASE 6G Sprint **51**.

Sprint 16 permanece **En progreso** (continuo 30d). Bajo Proceso §8.1, S16 es track ops
paralelo (PM+SRE) y **no** bloquea la apertura de S17 tras el Go de S15.

## Decisión

1. **S17 puede abrirse y cerrarse** sobre el **núcleo**:
   - `cash.blind_z` (conteo ciego + fórmula de arqueo §5.3 regla 11 sin desglose multi-turno),
   - `cash_register_cash_movements`,
   - `cash.discount_authz` + `authorization_tokens`,
   - enforce `ledger.credit_limit_cents`,
   - catálogo base de `audit_events.action` FASE 6,
   - `sale_reprints` con sello COPIA,
   - flags en `tenant_capabilities` (ADR-ARCH-002).
2. **Edge 2D:** en S17 se expone el contrato stub `printOutboxPendingCount(): number` que
   retorna `0` hasta S25; el modal bloqueante de cierre Z se implementa contra esa API y
   queda **no-op** (nunca bloquea) mientras el stub esté activo. **No** se inventa la outbox
   IndexedDB completa en S17.
3. **Edge 1C:** el reporte Z atribuye diferencia a la **sesión de caja** (`cash_register_sessions`);
   no se crean `cash_register_shifts` ni `SHIFT_TRANSFER` hasta S51. El CA de desglose
   multi-turno queda explícitamente fuera del DoD S17.
4. **S16** permanece abierto en paralelo; no es dependencia dura de S17.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Bloquear S17 hasta S25/S51 | Congela FASE 6 sin necesidad; Proceso §8.1 permite split de dependencias futuras |
| Implementar outbox/shifts “lite” en S17 | Duplicaría S25/S51 y viola DRY de dominio |
| Exigir cierre S16 (30d) antes de S17 | S16 es continuo por diseño; S15 Go ya liberó soft-launch |

## Consecuencias

- **Gana:** FASE 6 avanza con evidencia real de anti-fraude de caja sin falsos GREEN de outbox/shifts.
- **Paga:** claims de “print outbox gate en Z” y “desglose por operador” no se afirman hasta S25/S51.
- **Invariantes:** ADR-ARCH-002 (capabilities); dinero en cents; `db.batch` only; append-only audit.
- **Activación:** Sprint 17; stub sustituido en S25; shifts en S51.

## Evidencia de cierre

- Tests / checks: dominio caja + migrate `0011` + verify/quality
- Ledger: entrada de programa FASE 6
- Firmas RACI: `R` Backend ACID · `A` Staff Principal · `V` Security/QA
