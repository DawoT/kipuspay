---
name: kipus-quality-gate
description: Quality Gate de implementación de KipusPay (CAL-01..08, Arquitectura §13; Proceso §8.3). Orquesta la herramienta del monorepo — lint, format, typecheck, tests unitarios con umbrales de cobertura (dominio 95%, adaptadores/apps 70%), integración, build y bundle del POS — más Gitleaks y Semgrep. Úsalo al cerrar un sprint de código o antes de firmar un gate RACI con evidencia runtime.
allowed-tools: Bash(*)
---

# kipus-quality-gate — Calidad de implementación

El estándar completo vive en `docs/architecture/13-implementation-quality.md` (Registry
CAL-01..08). Este skill es la **secuencia de ejecución**, no la doctrina.

## Pipeline local

```bash
bash scripts/quality.sh        # lint + format + typecheck + unit + integration + security + build
```

Equivalente por pasos (útil para aislar un fallo):

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test:unit                  # vitest --coverage; umbrales en cada vitest.config.ts
pnpm test:integration
pnpm build
```

## Umbrales exigidos (CAL-05)

| Capa | Líneas | Ramas | Funciones |
|---|---|---|---|
| `packages/domain-*` | ≥ 95% | ≥ 95% | ≥ 95% |
| `packages/adapters-*` y `apps/*` | ≥ 70% | ≥ 60% | ≥ 70% |

El fallo de umbral rompe `test:unit`. Para ver solo el reporte:

```bash
pnpm exec vitest run --coverage  # en el paquete que falla
```

## Presupuesto y dependencias (CAL-06)

- Bundle del POS: `cd apps/pos-web && pnpm bundle` (size-limit, 300 kB gz).
- Cero dependencias runtime nuevas en `apps/pos-web`: cualquier `dependencies` que no
  esté en `scripts/checks/bundle_deps_baseline.json` rompe V-24 (ADR obligatorio).

## Seguridad (CAL-03 / CAL-04)

```bash
semgrep --config semgrep/rules/invariants.yml --error apps packages   # invariantes (db.batch, dinero, vertical)
gitleaks git --no-banner --redact -v                                  # secretos
```

## Cierre

- `SUITE GREEN` documental (`scripts/verify.sh`) + pipeline verde + umbrales cumplidos
  son condición **necesaria**.
- El cierre del sprint exige además la firma RACI de `A` + `V` independiente
  (`docs/PROCESS.md` §8.1) y evidencia runtime RED→GREEN registrada en el ledger con
  contrato TDD (CAL-07): `test_ids`, `red_run_id`/`green_run_id`, commits reales.
