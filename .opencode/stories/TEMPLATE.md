# US-<sprint>-NN — <título sin jerga, como lo diría el negocio>

| Campo | Valor |
|---|---|
| ID | US-<sprint>-NN |
| Sprint / Fase | <N> / <X> |
| Capability | `<capability.flag>` |
| Actor | Cajero · Dueño · Contador · Vendedor/Repartidor · Integrador/API |
| Estado | BORRADOR · LISTA · BLOQUEADA — falta regla § |
| Prioridad | <por qué ahora: métrica GTM §9 o riesgo normativo> |

## Historia

**Como** <actor>, **quiero** <capacidad en lenguaje del negocio>, **para** <resultado medible>.

## Flujo feliz

1. <Paso concreto con estado inicial explícito>
2. …
3. <Resultado visible para el actor>

## Flujos adversariales (mínimo 2 + checklist CAL-04 §13.5 — 6 familias)

> Cobrir al menos 2 de estas 6 familias (marcar las que aplica — Staff QA exige evidencia; si ninguna aplica, justificar):
> - [ ] Red hostil (packet loss / latencia / fragmentación — SYN-07)
> - [ ] Cuota IndexedDB (`QuotaExceededError` ≥80% — alertar antes de corromper cola)
> - [ ] Memoria/CPU gama baja (1 GB RAM, perfil tablet Android)
> - [ ] Shard/DO caído (circuit breaker §8.1, 0 lecturas DO en hot path)
> - [ ] Escritura concurrente (8 cajeros mismo SKU — ACID `db.batch`)
> - [ ] Reintento duplicado (idempotencia `offline_client_sale_id` → `ALREADY_SYNCED`)

### A1 — <p. ej. red caída a mitad de cobro>
- **Dado** … **Cuando** … **Entonces** <expectativa fail-closed explícita; la venta jamás se pierde>

### A2 — <p. ej. CDR rechazado / cuota IndexedDB llena / stock negativo offline>
- **Dado** … **Cuando** … **Entonces** …

## Criterios de aceptación (Gherkin ejecutable)

```gherkin
Escenario: <nombre>
  Dado <estado exacto, montos en S/ y *_cents>
  Cuando <acción concreta del actor>
  Entonces <resultado verificable + estado exacto>
  Y <invariante respetada si aplica: CDR, autoridad server-side, tenant_id…>
```

## Trazabilidad

| Referencia | Valor |
|---|---|
| Fase | `docs/roadmap/fase-X.md:L` |
| Reglas | `SEC-../FIS-../COM-../DAT-..` → `docs/architecture/<cap>.md §sección` |
| Empaquetado GTM | `GTM §N` |
| Tests existentes | `test_ids` reales del monorepo |
| Tests propuestos | `test_propuesto:` filas para Staff QA (CAL-07) |
| Quality Gate | `R/A/V` según `Proceso §8.1` Anexo A + `§4` Matriz |
| Anti-jerga | `GTM §1.1` / `V-26` (marketing) · `V-27` (POS) — 0 `Edge/D1/ACID/sharding/CDR/UBL/PSE` en copy |

> **Puente CAL-07 (Proceso §7.2.1, `tdd_evidence.py`):** cada `test_propuesto` debe mapear a `test_ids` del ledger con `expected_failure`, `red_commit_sha`/`green_commit_sha` y `ancestry_verified:true` — el commit RED debe ser ancestro del GREEN (`git merge-base --is-ancestor`).

## Notas de implementación (opcional, técnico)

<Detalles técnicos SOLO aquí abajo: packages destino, adapters, flags — nunca en la historia ni arriba.>
