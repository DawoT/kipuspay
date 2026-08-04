# Chaos orchestration (`scripts/chaos/`)

Orquesta los escenarios de `@kipuspay/chaos-harness` (Arquitectura §13.5).

## Estado

| Escenario | Activo desde | Runner |
|---|---|---|
| `concurrent-writers` / `duplicate-retry` | Sprint 4 | `chaos-harness` + evidencia D1 en `adapters-d1` integration |
| `network-adversarial` / `quota-exceeded` | Sprint 6 | pendiente |
| `low-end-device` | Sprint 7 / 14 | pendiente |
| `ar-compensate` | Sprint 8 | activo (quality 4f) |
| `shard-do-failure` | Sprint 26 | pendiente |

## Uso Sprint 4

```bash
pnpm --filter @kipuspay/chaos-harness test:unit
pnpm --filter @kipuspay/adapters-d1 test:integration
# orquestación:
node scripts/chaos/run.mjs --scenario concurrent-writers --sprint 4
node scripts/chaos/run.mjs --scenario duplicate-retry --sprint 4
```
