---
doc_id: adr-arch-003-tenant-capabilities-dynamic
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-ARCH-003 — Capabilities dinámicas por tenant (SaaS real vs piloto estático)

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-27 |
| Decisores | Staff Principal, Staff PM |
| Consultados | Staff Security, Staff SRE, Staff Backend Datos, Staff Frontend POS |
| Informados | Staff QA, Staff ACID, Staff Hardware |
| Relaciona | Arquitectura §5.12 (COM-11) · Arquitectura §5.7 · Arquitectura §1.1 (ADR-ARCH-002) · Proceso §4 · Ledger 0525 · ADR-0035 |

## Contexto

Fase piloto/staging encendía módulos con flags estáticos por despliegue: `PUBLIC_FEATURE_*` en `apps/pos-web/wrangler.jsonc:11-16` y `FEATURE_*` en `apps/worker-api/wrangler.jsonc:101-177` (`flagOn(pub(PF+'X'))` en `features.ts:14-124`, gating en `owner/+layout.svelte:14` y `owner/+page.svelte:41`). El mismo artefacto sirve a todos los tenants — un `arranque` ve `owner.mode` si el build lo trae `"1"`. El Worker ya exige `tenant_capabilities` por fila (`migrations/0011:4-11`, `mobile-push-routes.ts:166`, `process-offline-sale-atomic.ts:624`) + `FEATURE_*` como kill-switch global. Divergencia cliente/servidor: UI muestra botón que API rechaza 404 `FEATURE_OFF`.

Un SaaS real exige que cada tenant porte su set `capabilities` en D1 y lo reciba en `GET /api/auth/session` hacia `capabilitiesStore` reactivo, con 3 niveles aislados: SuperAdmin `admin.kipuspay.com` (platform), Dueño `app.kipuspay.com/owner` (tenant), POS `/` (caja offline-first). Sin esto, facturación por plan es incorrecta y cualquier claim GTM (GTM §4.1) es falso.

## Decisión

**SoT = `tenant_capabilities` (D1 `tenant_id, capability, enabled, config_json` PK)** + `tenants.plan_id` como input comercial. `tenants.plan_id` mapea a defaults en `domain-billing` (`plan→capabilities`), overrides por tenant viven como filas. Capabilities viajan **solo** por `GET /api/auth/session` extendido `{capabilities: string[] sorted, capabilitiesEpoch: number}` (vista de D1, cache KV 10s `control-plane.ts:283` PERF-04, nunca JWT), poblando `capabilitiesStore` (Svelte `Set<string>`) con persistencia IDB + `tenant_data_epochs.epoch` (`0035:362-364` triggers). Gating: UI `store.has(cap)` y API `SELECT enabled FROM tenant_capabilities` — ambos deben estar `enabled=1` y `FEATURE_*` global `=1`. SuperAdmin en control plane aislado `admin.kipuspay.com` (CF Access, `platform_admin ≠ owner`, `x-platform-staff-token` patrón `index.ts:739`), Dueño solo `PATCH /api/tenant/plan` (derivado), nunca toggle fino.

Verificable: `scripts/verify.sh` `V-07`/`V-23` sin `switch(vertical)`, `V-24` bundle, `V-28`/`V-29` parity, `V-05` `tenant_id NOT NULL`, `V-25` migraciones espejo; `GET /api/auth/session` integra `capabilities` con `tenant_data_epochs` y `store.has()` cubre 38 `isXEnabled()` de `features.ts`.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| **A — `tenant_plans` tabla nueva + `PATCH tenant_plans SET capabilities`** | No existe en DDL, duplicaría `tenants.plan_id` + `tenant_capabilities`, deja `V-08` huérfano y rompe SoT single-source (`INDEX.md:174` §5.3). |
| **B — Capabilities en JWT claims** | Bloat 1-2KB (50 caps), stale hasta expiración 12h (`auth-decide:253` cashier), obliga re-emisión masiva, expone superficie. JWT queda `tenantId/sub/role/branchId/auth_time` (`session-route.ts:14`). |
| **C — KV `tenant:{id}` como SoT** | KV es cache, no autoritativo. SoT debe ser D1 transaccional `db.batch` + `audit_events` append-only (`05-3:91`). KV solo PERF-04 10s. |
| **D — `PUBLIC_FEATURE_*` como SoT permanente** | Global por despliegue, anti-SaaS. Se mantiene solo como kill-switch `FEATURE_TENANT_CAPABILITIES_DYNAMIC=0` hasta ola 5, luego se depreca. |
| **E — SuperAdmin en mismo `worker-api` con `role=owner`** | Mezcla blast radius, privilege escalation via `x-tenant-id` hint (`tenant-auth-middleware:44`), viola `SEC-01`/`V-03`. Control plane aislado es mandatorio. |
| **F — `if(plan==='cadena')` gating por plan string** | Reintroduce fork por plan, viola ADR-ARCH-002 `V-07`/`V-23` (`invariants.yml:43`). Todo gating por `capabilities.has()` — plan solo en `domain-billing` provisioning. |

## Consecuencias

- **Gana:** SaaS real por tenant, monetización correcta (arranque sin `owner.mode`/`inventory.batches`, crece/cadena desbloquean sin redeploy), divergencia UI/API cerrada, 3 niveles con least privilege, offline-first preservado (server-authoritative `SYN-06`), claims GTM desbloqueables por plan.
- **Paga:** 4 sprints (DDL/backfill, session/store, SuperAdmin, plan/metering + cleanup), complejidad D1 triggers parity `V-29`, cache invalidation por `epoch`, auditoría `CAPABILITY_UPDATE`/`PLAN_UPGRADE` en `audit_events` + `tenant_data_epochs` poll + banner stale.
- **Invariantes tocadas:** AGENTS §2 (ADR-ARCH-002 refuerza `V-07`/`V-23`, fail-closed `503`, offline-first `SYN-06`, Arquitectura §1.1, zero-dep) — `pos.checkout` nunca 402 (`auth-decide:72`), `processOfflineSaleAtomic` nunca pierde venta, capability en `01-principles:115`, store puro `V-24`.
- **Activación:** Ola 0 ADR+Ledger 0525 Aceptado → Ola 1 DDL `0036` + backfill + `FEATURE_TENANT_CAPABILITIES_DYNAMIC=0` → Ola 2 session/store `=1` canario staging → Ola 3 SuperAdmin `admin.kipuspay.com` → Ola 4 plan upgrade reconciliación → Ola 5 kill-switch a `1` prod + deprecate `PUBLIC_FEATURE_*` 1 release después. **NOTA IMPORTANTE (DAT-10): DDL 0036 citado en v1 es 0064 en repo (0064_ola1_tenant_capabilities_backfill.sql) — Ledger 0526:15336, INDEX.md:174 §5.3:63. La numeración 0036 era reserva, no migra.**

## Evidencia de cierre

- Tests / checks: `V-07`/`V-23` 0 `switch(vertical)`, `V-05` `tenant_id NOT NULL`, `V-25` up↔down espejo, `V-29` 3 triggers `tenant_capabilities`, `V-28` `/api/auth/session` registrado, `V-24` `310kB` `SIZE_LIMIT` + `bundle_budget.py`, `V-13` cadena `0525` `b1dd...→???`, `V-08` registry sin huérfanos, `scripts/verify.sh SUITE GREEN` + `scripts/quality.sh` CAL-03 95% dominio (`plan-defaults.test.ts`, `tenant-capabilities.test.ts`), CAL-05, semgrep `tenant_id from jwt only`.
- Ledger: `id: 0525`
- Firmas RACI: `R` Staff Principal+PM · `A` Staff Principal · `V` Staff Security + Staff QA + Staff SRE independientes
