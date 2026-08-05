# Chaos orchestration (`scripts/chaos/`)

Orquesta los escenarios de `@kipuspay/chaos-harness` (Arquitectura §13.5).

## Estado

| Escenario | Activo desde | Runner |
|---|---|---|
| `concurrent-writers` / `duplicate-retry` | Sprint 4 | `chaos-harness` + evidencia D1 en `adapters-d1` integration |
| `network-adversarial` / `quota-exceeded` | Sprint 6 | pendiente |
| `low-end-device` | Sprint 7 / 14 | Juez unitario + evidencia integración donde aplique; **PASS de `run.mjs` ≠ DoD S14 solo** (ADR-0011) |
| `ar-compensate` | Sprint 8 | activo (quality 4f) |
| `rollup-idempotent` | Sprint 9 | activo (quality 4g) |
| `shard-do-failure` | Sprint 26 | pendiente — **fuera de alcance S14** (ADR-0011) |

## Honestidad Sprint 14

`node scripts/chaos/run.mjs` corre el harness **unitario** fail-closed y declara que la evidencia D1 vive en `adapters-d1` integration (quality step 4). No usar ese PASS como “recuperación de shard verificada”.

## Uso Sprint 4

```bash
pnpm --filter @kipuspay/chaos-harness test:unit
pnpm --filter @kipuspay/adapters-d1 test:integration
# orquestación:
node scripts/chaos/run.mjs --scenario concurrent-writers --sprint 4
node scripts/chaos/run.mjs --scenario duplicate-retry --sprint 4
```
