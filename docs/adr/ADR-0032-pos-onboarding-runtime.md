---
doc_id: adr-0032
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0032 — Autorización runtime de `@kipuspay/domain-onboarding` en el POS

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-12 |
| Decisores | Staff Principal |
| Consultados | Staff Frontend POS, Staff Growth |
| Informados | Staff Backend Datos |
| Relaciona | Arquitectura §13.8 (CAL-06) · GTM §6.2 · Ledger NNNN · ADR-0031 |

## Contexto

El POS (`apps/pos-web`) es zero-dependencia runtime por invitante (invariante 10,
AGENTS §2): el check V-24 (`scripts/checks/bundle_budget.py`) compara
`apps/pos-web/package.json → dependencies` contra el baseline
`bundle_deps_baseline.json` y cualquier dependencia nueva sin ADR rompe CI (CAL-06,
Arquitectura §13.8 punto 2).

El Sprint 52 (tour de onboarding y checklist "segundo día", capability
`onboarding.tour`) introdujo `@kipuspay/domain-onboarding` como `dependency` del POS
para `computeSetupProgress`, `TourStep` y FAQ contextuales. Es un package **interno
del monorepo** (workspace `*`), con cero dependencias propias (`dependencies: {}`) y
lógica pura de dominio — no es una librería npm de render/QR/ticket, que es lo que la
invariante 10 busca excluir. El gate V-24 quedó RED por no estar autorizado.

## Decisión

Autorizar `@kipuspay/domain-onboarding` en el baseline de dependencias runtime del
POS (`bundle_deps_baseline.json`), por tratarse de un dominio puro del monorepo sin
deps transitivas npm. El ADR es la puerta que exige CAL-06; el baseline queda como
single source of truth que V-24 verifica.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Mover la lógica a `@kipuspay/domain-fiscal-pe` o `@kipuspay/domain-sales` | Onboarding es un capability transversal (GTM §6.2), no fiscal ni de venta; acoplarlo a esos paquetes viola separación de dominios (ADR-ARCH-002, §1.1) |
| Copiar el código en `apps/pos-web/src/vendor/` | Duplica un dominio con tests propios (packages/domain-onboarding tiene 100% de intención de cobertura) y rompe DRY (invariante 9) |
| Declararlo como `devDependency` | Falso: se importa en runtime desde `src/lib/ui/Tour.svelte` y `SetupChecklist.svelte` |

## Consecuencias

- **Gana:** el POS consume `computeSetupProgress`/`TourStep`/FAQ desde el dominio
  testado; V-24 vuelve a GREEN; el capability `onboarding.tour` queda empaquetado en
  el cliente sin dep npm externa.
- **Paga:** una entrada más en el baseline del POS (monitoreada por V-24; cualquier
  dependencia npm real nueva seguirá exigiendo su propio ADR).
- **Invariantes tocadas:** 10 (zero-dependency cliente) se respeta: la dependencia es
  interna del monorepo, cero deps npm, cero render visual con librerías; 9 (DRY) se
  respeta: no se copió código al vendor.
- **Activación:** Sprint 52 (feature flag `FEATURE_ONBOARDING_TOUR`).

## Evidencia de cierre

- Tests / checks: V-24 GREEN con `bundle_deps_baseline.json` actualizado;
  `pnpm --filter apps/pos-web test` GREEN.
- Ledger: `id: NNNN` (entrada nueva con `ticket_or_adr: ADR-0032`).
- Firmas RACI: `R` Staff Frontend POS · `A` Staff Principal · `V` Staff Backend Datos
  + Staff Growth.
