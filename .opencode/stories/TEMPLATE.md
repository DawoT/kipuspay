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

## Flujos adversariales (mínimo 2)

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

## Notas de implementación (opcional, técnico)

<Detalles técnicos SOLO aquí abajo: packages destino, adapters, flags — nunca en la historia ni arriba.>
