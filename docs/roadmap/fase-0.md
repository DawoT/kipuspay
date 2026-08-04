---
doc_id: roadmap-fase-0
alias: Roadmap
authority: normativa
owner: "@DawoT"
fase: "0"
sprints: "0"
---

### FASE 0 — Fundación y Gobernanza del Escuadrón

#### Sprint 0 — Charter, Roles, Tooling de Calidad y Changelog
**Duración:** 1 semana · **Agentes:** Staff Principal (owner), todos los roles reciben asignación

**Entregables**
- Charter del escuadrón (este documento, adoptado formalmente) y asignación de owner por rol.
- Plantilla de ADR (`docs/adr/TEMPLATE.md`), plantilla de runbook (`docs/runbooks/TEMPLATE.md`), estructura de repositorio; **ADR-0001** (adopción roadmap/DoD/ledger/CAL/monorepo) en `docs/adr/`.
- Pipeline de CI con linters, cobertura de tests, escaneo de secretos y de dependencias vulnerables (Sección 5).
- Pipeline de testing multi-capa configurado con los umbrales mínimos de la Sección 6 activos en CI.
- Esquema y tooling del Changelog Obligatorio inmutable (Sección 7), incluida la plantilla de entrada.
- Constitución del Staff Review Board (quórum mínimo por tipo de entregable, según Sección 4).

**Criterios de aceptación**
- CI en verde sobre un pipeline de referencia (hello-world) con los cuatro escaneos activos.
- ADR-0001 ("Adopción de este roadmap, del DoD global y del Changelog inmutable") aprobado por el Staff Review Board.
- Primera entrada de changelog registrada siguiendo el esquema de la Sección 7.2, con evidencia adjunta.

**Tooling de calidad (CAL-01..08)** — capítulo `Arquitectura §13` y checks V-20..V-24:
- Estándar de calidad de código normado (`docs/architecture/13-implementation-quality.md`),
  Registry CAL-01..08 (dinero entero, SEMGREP invariantes, GITLEAKS, SEMGREP/SAST, cobertura,
  bundle/zero-dep, TDD, disciplina de deuda).
- Gate V-20..V-24 implementado y autotesteado (V-00) en `scripts/verify.sh`.
- Monorepo scaffold de `Arquitectura §1.1`: `packages/domain-*`, `packages/adapters-*` y
  `apps/pos-web` + `apps/worker-*`, con pnpm workspaces, Turbo, TypeScript estricto,
  ESLint (invariantes vía `no-restricted-syntax`), Prettier, Vitest con umbrales de
  cobertura, size-limit y Semgrep; la venta y la edición de código **no** pueden romper
  el gate documental.
- CI: `verify.yml` (gate documental), `quality.yml` (pipeline de calidad), `security.yml`
  (Gitleaks + Semgrep), `codeql.yml` y `dependabot.yml`.

**Quality Gate:** ningún sprint de la Fase 1 puede iniciar sin este sprint cerrado.

---

