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

## Matriz Chaos §13.5 (CAL-04 — `scripts/quality.sh` pasos 4b-4j)

| Paso | Escenario | Capa | Herramienta | Fail-closed sin deps |
|---|---|---|---|---|
| 4b | `concurrent-writers` + `duplicate-retry` | Motor ACID D1 | `adapters-d1` integration + `chaos-harness` (D1 real, 8 escritores, retry idempotente) | Sí — 0 escrituras parciales / 500 ciclos |
| 4c | `deadline` (RC 7d / factura 3d, T-24h/T-6h, DLQ) | Fiscal | `domain-fiscal-pe` + `adapters-d1` | Sí |
| 4d | `network-adversarial` + `quota-exceeded` (500 ventas, `QuotaExceededError`) | POS offline | `pos-web` + `chaos-harness` (packet loss, latencia, IDB quota) | Sí |
| 4e | `low-end-device` (1 GB RAM, CPU throttled, 500 ventas) | POS/hardware | `chaos-harness` + emulador Android | Sí |
| 4f | `ar-compensate` (NC/NV sobre CxC) | Ledger | `domain-cash` integration | Sí |
| 4g | `rollup-idempotent` (re-materialización D1) | Reporting §9 | `adapters-d1` rollup cron idempotente | Sí |
| 4g2 | `dr-failover` (KPBK1 backup + restore dry-run) | DR/BCP §5.9 | `adapters-d1` `data-backup` (RPO 0, RTO ≤30m) | Sí |
| 4h | `marketing_copy` anti-jerga GTM §1 | GTM | `marketing_copy.py` V-26 | Sí |
| 4i | `bench Sub-50ms` (hot path p95) | Perf | `bench-sub50ms` | Sí |
| 4j | `deps_audit` (osv/pnpm audit) | Supply chain | `deps_audit.sh` | Sí |

`CAL-02` `strict` via `pnpm typecheck`, `CAL-08` complejidad `≤12` hot path / `≤15` resto via `eslint complexity` — ambos en `pnpm lint`.

## Cierre

- `SUITE GREEN` documental (`scripts/verify.sh` 32/32) + pipeline verde + umbrales CAL-05 cumplidos son condición **necesaria**.
- V-20 exige `green_commit_sha`/`red_commit_sha` **reachable desde HEAD** (salvo entrada posterior `CORRIGE`). Tras un rewrite de commits, registrar CORRIGE — no editar la entrada.
- El cierre del sprint exige además la firma RACI de `A` + `V` independiente (`docs/PROCESS.md` §8.1 Anexo A) y evidencia runtime RED→GREEN registrada en el ledger con schema v2 y contrato TDD (CAL-07: `test_ids`, `red_run_id`/`green_run_id`, commits reales reachable); sin `A` + `V` distinto de `R`, el veredicto es `NO-GO`.
