---
doc_id: s52-onboarding-tour-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 52 — Onboarding tour + Setup Checklist — Quality Gate

**Estado software:** GREEN local
**Estado claim:** onboarding "segundo día" descongelado-condicionado (GTM §4.1)
**Estado producción/piloto:** NO-GO hasta validación UX humana + firmas A/V independientes
**Capability:** `onboarding.tour` (default-off), `onboarding.checklist` (default-off)
**Spec:** Arquitectura §5.3 regla 36 · Roadmap FASE 6G Sprint 52

El gate automatizado demuestra el contrato de software en entorno local: product
tour post-onboarding activado por las capabilities del tenant (ADR-ARCH-002),
setup checklist con progreso por capability, FAQ in-product contextual, router
tenant→shard y formalización del comercio con máquina de estados server-side.
No existe staging real ni firmas A+V independientes de UX: producción y piloto NO-GO.

## Evidencia RED→GREEN

| Hito | Run ID | Evidencia |
|---|---|---|
| RED schema | `run-red-s52-onboarding-tour` | CHECK del DDL 0044 rechazaba eventos no whitelisteados |
| GREEN schema | `run-green-s52-onboarding-tour` | `onboarding-tour.integration.test.ts` 3/3 (CHECK acepta 5 eventos nuevos, rechaza `hack`, query setup-progress) |
| GREEN rutas | `run-green-s52-routes` | `onboarding-routes.test.ts` 7/2 (mocks) + E2E onboarding-tour 5/5 |
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
| growth_events sin límite de meta (pendiente S54) | ABIERTO |
| Integración D1 de growth_events con dedupe | PENDIENTE |

## Estado

**GOV-APROBADO** (firma A+V staff) — auditoría FASE 6G: el flujo de formalización
quedó con role-guard y verificación de estado; los gaps abiertos (meta ilimitado
en growth_events, dedupe) se registran para la fase de hardening posterior.

## Residuales

- `growth_events` sin UNIQUE ni dedupe (retry duplica la métrica).
- `meta` del growth event sin límite de tamaño.
- Metricas de completitud client-instrumentadas (el servidor no verifica pasos).
- Sin staging real ni firmas A/V independientes de UX.
