# Chaos orchestration (`scripts/chaos/`)

Orquesta los escenarios de `@kipuspay/chaos-harness` (Arquitectura §13.5).

## Estado

| Escenario | Activo desde | Runner |
|---|---|---|
| `concurrent-writers` / `duplicate-retry` | Sprint 4 | pendiente |
| `network-adversarial` / `quota-exceeded` | Sprint 6 | pendiente |
| `low-end-device` | Sprint 7 / 14 | pendiente |
| `shard-do-failure` | Sprint 26 | pendiente |

Hasta la activación, `runChaosScenario` falla en seco (no hay PASS vacío). Sprint 0/1
cierran con integración D1 real (`packages/adapters-d1`), no con chaos.

## Uso (cuando exista runner)

```bash
# desde la raíz del monorepo
pnpm --filter @kipuspay/chaos-harness test:unit
# orquestación futura:
# node scripts/chaos/run.mjs --scenario concurrent-writers --sprint 4
```
