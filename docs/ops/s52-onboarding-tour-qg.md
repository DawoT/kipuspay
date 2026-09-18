---
doc_id: s52-onboarding-tour-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 52 — Onboarding tour + Setup Checklist — Quality Gate

**Estado software:** GREEN local + canary D1 staging técnico
**Estado claim:** onboarding "segundo día" descongelado-condicionado (GTM §4.1)
**Estado producción/piloto:** NO-GO hasta validación UX humana + firmas A/V independientes
**Capability:** `onboarding.tour` (default-off), `onboarding.checklist` (default-off)
**Spec:** Arquitectura §5.3 regla 36 · Roadmap FASE 6G Sprint 52

El gate automatizado demuestra el contrato de software en entorno local: product
tour post-onboarding activado por las capabilities del tenant (ADR-ARCH-002),
setup checklist con progreso por capability, FAQ in-product contextual, router
tenant→shard y formalización del comercio con máquina de estados server-side.
El canary staging verificó límite de metadata e idempotencia de growth events. La
validación UX humana y las firmas A+V siguen pendientes: producción y piloto NO-GO.

## Evidencia RED→GREEN

| Hito | Run ID | Evidencia |
|---|---|---|
| RED schema | `run-red-s52-onboarding-tour` | CHECK del DDL 0044 rechazaba eventos no whitelisteados |
| GREEN schema | `run-green-s52-onboarding-tour` | `onboarding-tour.integration.test.ts` 3/3 (CHECK acepta 5 eventos nuevos, rechaza `hack`, query setup-progress) |
| GREEN rutas | `run-green-s52-routes` | `onboarding-routes.test.ts` 7/2 (mocks) + E2E onboarding-tour 5/5 |
| GREEN hardening | `run-green-s52-hardening` | `onboarding-routes.test.ts` 25/25 + `tour-client.test.ts` 7/7; migración 0068 e índice único tenant+idempotency |
| GREEN auditoría staff | `run-green-s52-s49` | S52-H1: PATCH /api/tenant/formalization con role-guard admin/owner + `from` verificado contra la DB (STAGE_MISMATCH) — cajero NO cambia el modo fiscal |

## Checklist

| Check | Resultado |
|---|---|
| Mig 0044 + down protegido DAT-12 | GREEN |
| Tour por capabilities (ADR-ARCH-002) | GREEN |
| Setup checklist con progreso | GREEN |
| Formalización con máquina de estados server-side | GREEN |
| S52-H1: role-guard admin/owner en formalization | GREEN |
| S52-H1: `from` = estado real de la DB (0 saltos/retrocesos) | GREEN |
| growth_events `meta_json` ≤4096 bytes | GREEN |
| Integración D1 de growth_events con dedupe | GREEN técnico; staging verificado |

## Estado

**SOFTWARE-GREEN-CANARY.** El flujo de formalización y el hardening de growth
events quedan verificados localmente y en staging sintético. El claim onboarding
"segundo día" sigue condicionado a validación UX humana y firmas A/V
independientes.

## Residuales

- Metricas de completitud client-instrumentadas (el servidor no verifica pasos).
- Sin staging real ni firmas A/V independientes de UX.

## Evidencia staging — 2026-09-17

Se aplicó `0068_sprint52_growth_events_idempotency.sql` en D1 `kipuspay-staging` y
en `kipuspay-dr-staging`; el deploy posterior acumulado activo es
`6a45c6a0-497c-45b3-a41e-2c52a3c59883`.
El canary autenticado `tenant_stg_cadena_001` devolvió **201** en el primer
`tour_completed` y **200** con `replayed: true` en el reintento. D1 confirmó una
sola fila para la llave `s52-replay-20260917-001`; un segundo canary con
`s52-replay-20260917-002` repitió el mismo 201→200. El endpoint rechaza metadata
mayor a 4096 bytes y el cliente genera una llave estable sin PII.

Los negativos del mismo canary devolvieron **403** ante tenant hint cruzado,
**422 `IDEMPOTENCY_KEY_REQUIRED`** sin llave y **409
`GROWTH_IDEMPOTENCY_MISMATCH`** al reutilizar la llave con otro evento.
