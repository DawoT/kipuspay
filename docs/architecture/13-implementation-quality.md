---
doc_id: arch-13-implementation-quality
alias: Arquitectura
authority: normativa
owner: "@DawoT"
section: "13"
---

## **13. Calidad de Implementación — Toolchain Staff y Presupuestos**

Este capítulo **materializa las Etapas 1–7 del pipeline de implementación** (`Proceso §5.2`)
y el "cómo se valida" de la matriz de testing (`Proceso §6`): convierte umbrales declarados
en herramientas, configuración y números que bloquean CI. No reabre reglas de negocio: las
cita con `§`. Es **normativo** para todo el código del monorepo (§1.1) desde el Sprint 0.

### **13.0 Decisiones de stack (cerradas, no reabrir por conveniencia)**

| Capa | Herramienta | Por qué (Staff) |
|---|---|---|
| Monorepo | `pnpm` workspaces + Turborepo | Dependencias estrictas; task graph con caché y orden de CI |
| Runtime | Node 22 LTS (dev/tooling); Cloudflare Workers (prod) | `wrangler` y `@cloudflare/vitest-pool-workers` soportan la misma versión |
| Tipado | TypeScript `strict` (config en §13.3) | Errores que hoy son runtime pasan a compile |
| Lint / format | ESLint 9 flat + `typescript-eslint` (type-aware) + Prettier | Enforce de invariantes con `no-restricted-syntax`; formato determinista |
| Complejidad | Regla `complexity` de ESLint | Hot path ≤ 12; resto ≤ 15 (CAL-08) |
| Unit / coverage | Vitest + `@vitest/coverage-v8` | Umbrales por capa en CI (CAL-03) |
| Integration D1 | `@cloudflare/vitest-pool-workers` (Miniflare + Workerd real) | `db.batch([...])` se prueba contra D1 real, no mocks |
| E2E / a11y | Playwright + `@axe-core/playwright` | WCAG 2.1 AA y flujos de caja extremo a extremo |
| Componentes | `@testing-library/svelte` | Interacciones del POS aisladas |
| Chaos | `scripts/chaos/` + package `chaos-harness` (§13.6) | Fallo inyectado antes que el cliente real |
| SAST | Semgrep (reglas propias) + CodeQL + `eslint-plugin-security` | Tres capas: patrón, dataflow y regla propia |
| Secretos | gitleaks (pre-commit + CI) + `eslint-plugin-no-secrets` | Cero secretos en historia y en código |
| Dependencias | `osv-scanner` + `pnpm audit` + Dependabot | Vulnerabilidades conocidas antes de merge |
| Fiscal | `xmllint` + XSD SUNAT vendorizadas (`domain-fiscal-pe/test/xsd`) | Validación contra XSD oficial |
| Bundle | `@size-limit` + `scripts/checks/bundle_budget.py` (§13.8) | Presupuesto medible, no opinión |
| CI | GitHub Actions (`.github/workflows/quality.yml`) | Etapas 1–5 bloqueantes (§13.7) |

### **13.1 Monorepo y boundaries**

1. **Estructura** exacta de `§1.1`: `packages/domain-*`, `packages/adapters-*`,
   `packages/contracts-sync`, `apps/pos-web`, `apps/worker-api`, `apps/worker-fiscal`.
2. **Regla de imports (CAL-01):** `packages/domain-*` **no importa** Hono, D1 (el binding),
   Svelte, ni SDK SUNAT. Se enforce en ESLint con `no-restricted-imports` por package
   (`eslint.config.js`) y en Semgrep con una regla de patrón (`semgrep/rules/`).
3. **Dependencias:** `pnpm` con `hoist=false`; una dependencia se declara en el package que
   la usa. Está **prohibido** importar un modulo de un package `apps/` hacia otro `apps/`:
   solo hacia `packages/`.
4. **Salud del monorepo:** `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test` deben ser
   órdenes únicas desde la raíz; Turborepo garantiza el orden topológico y el caché.

### **13.2 TypeScript strict (CAL-02)**

`tsconfig.base.json` obligatorio en todos los packages y apps:

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "target": "es2022",
    "noEmit": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": false
  }
}
```

1. `erasableSyntaxOnly` obliga a no usar enums ni namespaces (se emiten a runtime y rompen
   Workers); se usan uniones de literales y `as const`.
2. El dinero se modela como **`type Cents = number`** con eslint (`no-restricted-syntax`)
   prohibiendo `Number(...)`, `parseFloat(...)`, `toFixed(...)` y operaciones que degraden
   a `float` sobre valores `*_cents` (CAL-01; refuerza DAT-09).
3. `skipLibCheck: false` es deliberado: los tipos de dependencias se verifican, no se
   confía en silencio.
4. CI ejecuta `pnpm -r typecheck` (`tsc --noEmit` por package con project references).

### **13.3 Lint y estilo (CAL-01, CAL-08)**

Config: `eslint.config.js` flat (root) + overrides por package. Extensiones:

- `@eslint/js` + `typescript-eslint` (projectService, `recommended-type-checked`)
- `eslint-plugin-security` (patrones de riesgo: `eval`, `new Function`, SQL por
  concatenación, crypto inseguro)
- `eslint-plugin-no-secrets`
- `eslint-config-prettier` (el estilo lo decide Prettier, no ESLint)

**Reglas de invariantes (`no-restricted-syntax`), por dominio:**

| Invariante (fuente) | Patrón bloqueado |
|---|---|
| D1 no tiene `db.transaction` (AGENTS §2, invariante 2) | `CallExpression db.transaction(`, `db.transaction(` en `.ts` |
| UPSERT inexistente (AGENTS §2, invariante 2) | texto `UPSERT INTO` en `*.sql` y `.ts` |
| Redondeo server-side `Math.round`, jamás `toFixed` (DAT-09) | `MemberExpression *.toFixed(` |
| Dinero entero, cero `float` (AGENTS §2, invariante 1) | `parseFloat(`, `Number(`, `+` unario sobre `*_cents` |
| Capability model, cero fork vertical (ADR-ARCH-002) | `switch(vertical)`, `vertical_type ===`, `.vertical ===` |
| Atomicidad batch, cero awaits en loop sobre `db.batch` | `AwaitExpression` dentro de `for` sobre `db.batch` |

**Complejidad (CAL-08):** `complexity` max 12 en `domain-*` y en el orquestador ACID;
max 15 en el resto. Un override del archivo no se acepta sin ADR que lo justifique.

**Formato:** Prettier (config raíz `.prettierrc`) con `singleQuote: true`, `semi: true`,
`printWidth: 100`. CI ejecuta `prettier --check .`.

### **13.4 Testing por capa → harness concreto (CAL-03)**

Mapeo de la pirámide de `Proceso §6` a herramientas y umbrales que bloquean CI:

| Capa (`Proceso §6`) | Harness | Umbral en CI |
|---|---|---|
| Motor transaccional ACID | Vitest + pool-workers (D1 real) + suite de concurrencia | cobertura ≥ 95%; 0 escrituras parciales |
| Esquema / migraciones D1 | pool-workers: migración up/down + integridad referencial | 0 FKs huérfanas; reversible sin pérdida |
| Motor fiscal SUNAT | Vitest + `xmllint` contra XSD vendorizadas | 100% XML válido; transiciones prohibidas → 422 |
| Auth / Zero-Trust | Vitest: autorización negativa por ruta + fuzz de firmas | 100% rutas sensibles cubiertas |
| Sync offline / red adversarial | `chaos-harness` (Playwright + Service Worker) | 0 pérdida/duplicación en 500 ciclos |
| Storage local / dispositivo | inyección `QuotaExceededError` + perfil gama baja | 0 corrupción de cola; alerta ≥ 80% cuota |
| Frontend POS / UX | Playwright E2E + `@axe-core/playwright` | feedback < 100 ms (RUM); contraste AA |
| Carga / performance | bench del hot path en CI (script `scripts/bench/`) | P95 < 50 ms en el pipeline de venta |

**Convención de archivos:** tests al lado del fuente (`src/**.test.ts`) + suites de capa en
`test/`. `vitest.workspace.ts` declara cada package; los umbrales de cobertura viven por
package en su `vitest.config.ts` (no en la raíz), para que cada capa declare su presupuesto.

### **13.5 Chaos y adversarial (CAL-04)**

El package `chaos-harness` expone escenarios reutilizables; `scripts/chaos/` los orquesta.
Cada escenario emite un veredicto `PASS|FAIL` y un log reproducible.

**Activación por sprint (no fingir cobertura):** el andamiaje (`packages/chaos-harness`,
`scripts/chaos/`) existe desde Sprint 0; los escenarios **bloquean CI** solo cuando el
sprint de la capa correspondiente los activa. Hasta entonces el harness documenta el
contrato y falla en seco si se invoca un escenario no implementado.

| Escenario | Técnica | Capa | Activo desde |
|---|---|---|---|
| Red adversarial | CDP `Network.emulateNetworkConditions` (packet loss, latencia) | sync offline | Sprint 6 |
| Cuota local | monkeypatch de IndexedDB para lanzar `QuotaExceededError` | cola offline | Sprint 6 |
| Memoria / CPU gama baja | Playwright `--cpu-throttling`, perfil Android low-end | POS | Sprint 7 / 14 |
| Fallo de shard / DO | pool-workers: `fetch` al DO falla con 5xx; breaker (5xx abren, 4xx no) | SRE breaker | Sprint 26 (FASE 8) |
| Escritores concurrentes | `Promise.all` de N ventas sobre el mismo SKU en D1 real | motor ACID | Sprint 4 |
| Reintento duplicado | re-envío del mismo envelope de idempotencia | reconciliación | Sprint 4 |

Regla: **ningún sprint de las Fases 1–2 (dinero, impuestos, seguridad) cierra su gate sin
el escenario de su capa ejecutado en CI** una vez que ese escenario está marcado activo
arriba (CAL-04, `Proceso §4`). Sprint 1 cierra con integración D1 (migraciones up/down),
no con chaos de concurrencia — eso es el gate de Sprint 4.

### **13.6 Seguridad en CI (CAL-05)**

| Escáner | Cuándo | Falla el merge si |
|---|---|---|
| gitleaks | pre-commit + CI | cualquier secreto en el diff |
| `osv-scanner` + `pnpm audit` | cada PR | vulnerabilidad conocida sin mitiga |
| Semgrep (reglas propias) | cada PR | patrón de invariante o riesgo de seguridad |
| CodeQL (JS/TS) | cada PR + semanal | hallazgo crítico/alto |
| `eslint-plugin-security` | cada PR (lint) | patrón de riesgo |

Las reglas propias de Semgrep viven en `semgrep/rules/` y **duplican las invariantes** de
§13.3 (aplican donde ESLint no llega: SQL, XML, multi-archivo). Un PR que introduce un
nuevo patrón riesgoso y no lo cubre con regla (ESLint o Semgrep) viola el DoD (`Proceso §3`).

### **13.7 CI/CD (etapas bloqueantes)**

`.github/workflows/quality.yml` implementa las **Etapas 1–5** de `Proceso §5.2` en orden,
cada una bloquea la siguiente:

1. **Lint:** `pnpm lint` (ESLint + Prettier + reglas de invariantes) y `pnpm typecheck`.
2. **Unit:** `pnpm test:unit` (Vitest, umbrales de cobertura de cada package).
3. **Integration:** `pnpm test:integration` (pool-workers, D1 real, migraciones).
4. **Security:** gitleaks → osv/audit → semgrep → CodeQL.
5. **Build + bundle:** `pnpm build` + `bundle_budget.py` (§13.8).

Las **Etapas 6–11** (staging, canario, rollout) requieren secretos del entorno
Cloudflare; se despliegan con `workflow_dispatch` manual y el mismo orden, sin saltos
(`Proceso §5.3`). El workflow documental `verify.yml` sigue corriendo en paralelo y
bloquea el merge por sí solo (`AGENTS §5`).

### **13.8 Presupuesto de bundle y cero-dependencia (CAL-06)**

1. **Baseline:** `scripts/checks/bundle_budget.py` lee `size-limit.config.js` y el
   artefacto de build; falla si el JS emitido del POS supera el presupuesto (inicial:
   **220 kB** gz para `apps/pos-web`; se re-baselinea solo con ADR).
2. **Cero dependencia npm runtime nueva en el POS** (invariante 10, §7.5): un check de
   diff en CI compara `apps/pos-web/package.json` contra el baseline; cualquier `dependencies`
   nueva sin ADR rompe CI (CAL-06). Las dependencias de **dev** no se limitan. El baseline
   autoriza solo dominios puros del monorepo sin deps transitivas npm (p. ej.
   `@kipuspay/domain-onboarding`, ADR-0032).
3. **Offloading:** QR, ticket y ESC/POS se resuelven con Web Platform APIs o código
   vendorizado en `apps/pos-web/src/vendor/`; el vendor se marca y se mide en el bundle.

### **13.9 Evidencia TDD RED → GREEN y contrato del ledger (CAL-07)**

1. Todo cambio de código de Fases 1–53 lleva test que falla primero; el run RED debe
   fallar por la **aserción esperada**, no por infraestructura.
2. El ledger (schema v2, `Proceso §7.2.1`) registra `ticket_or_adr`, `test_ids`,
   `red_commit_sha`, `red_run_id`, `expected_failure`, `green_commit_sha`, `green_run_id`
   y `ancestry_verified: true`. El check **V-20** valida que cada `test_ids` resuelva en
   un test existente y que los campos RED/GREEN estén completos.
3. El commit RED debe ser **ancestro** del commit GREEN y del merge; CI conserva ambos
   logs (job con `fail-fast: false` que permite fallar el paso RED por la aserción esperada).
4. Migraciones D1: se prueban up/down contra D1 real en CI; el commit de migración sin
   test de reversibilidad no pasa el gate.

### **13.10 Checks del gate documental sobre código (V-20…V-24)**

La batería `scripts/verify.sh` (sin Node, corre en el hook) agrega cinco checks que
vigilan el código del monorepo con grep/python y Semgrep ligero:

| ID | Verifica | Implementación |
|---|---|---|
| V-20 | Evidencia TDD del ledger: `test_ids` existen en el repo; campos RED/GREEN completos | `scripts/checks/tdd_evidence.py` |
| V-21 | Dinero en código: cero `toFixed`, `parseFloat`, `Number` sobre `*_cents` | `scripts/checks/code_money.py` |
| V-22 | Cero `db.transaction(` y `UPSERT INTO` en `*.ts`/`*.sql`/`*.svelte` | extend V-04/V-02 |
| V-23 | Cero fork vertical en `*.svelte` (amplía V-07) | extend V-07 |
| V-24 | Presupuesto de bundle: baseline no crece sin ADR | `scripts/checks/bundle_budget.py` |

Estos checks se registran en `AGENTS §5` y en el skill `kipus-verify`. Su selftest vive en
`selftest.py` (V-00): un gate sin autotest es un falso GREEN.

### **13.11 Presupuestos que no se negocian (resumen numérico)**

| Presupuesto | Valor | Fuente | Check |
|---|---|---|---|
| Hot path de cobro | P95 < 50 ms | `Proceso §9.1` | bench en CI |
| Cobertura dominio / ACID | ≥ 95% | CAL-03 | coverage gate |
| Cobertura adapters | ≥ 70% | CAL-03 | coverage gate |
| Complejidad hot path | ≤ 12 | CAL-08 | ESLint |
| Complejidad resto | ≤ 15 | CAL-08 | ESLint |
| Bundle POS (gz) | ≤ 220 kB | CAL-06 | V-24 |
| Dependencias runtime POS nuevas | 0 sin ADR | CAL-06 | V-24 |
| FKs huérfanas | 0 | `Proceso §4` | integration |
| Escrituras parciales bajo caos | 0 | `Proceso §6` | chaos |
| XML fiscal | 100% válido | `Proceso §6` | XSD |
| Secretos / vuln conocidas | 0 | CAL-05 | gitleaks/osv |
| Entradas ledger sin evidencia | 0 | `Proceso §7` | V-20 |
