---
doc_id: ops-s47-lpdp-plan
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 47 — LPDP (datos personales) — Plan de trabajo y handoff

> Documento de continuidad para el siguiente agente. Estado al **2026-08-10 (tras commit `093977e`, pusheado a `main`)**: backend LPDP completo y verificado; quedan UI pos-web, runbook DPO, copy GTM, chaos/simulacro, E2E, QG documental y publicación de la política de privacidad. **Léelo entero antes de tocar nada.**

## Contexto (qué se hizo hasta acá)

El sprint-47 implementa la capability `compliance.lpdp` (Roadmap FASE 6F, Sprint 47; Arquitectura §5.3 regla 32a; Ley N.º 29733 Perú). Autoridad: Staff Security (owner), Staff Data, Staff Mobile, Staff Growth (copy). Criterios de aceptación: 0 PII sin consentimiento donde aplica; borrado anonimiza vínculo sin romper integridad fiscal; export incluye PII del cliente; simulacro de solicitud LPDP completado. QG: Staff Security + Staff Principal; Staff Growth publica política de privacidad solo tras gate.

### Hito 1 — Gobernanza (commit `5e3bacb`) ✅

- **ADR-0031** (LPDP capability model): `docs/adr/ADR-0031-lpdp-privacy.md`.
- **Reglas LPDP-01..04** definidas UNA vez en Arquitectura §5.3 (registry §0.4, sin huérfanos).
- **Migración D1 0040** `consent_records` (idempotente, `db.batch`, `tenant_id NOT NULL`, down `DOWN_0040`).
- Semgrep: regla PII para código del monorepo.
- Contrato RED del sprint (gobernanza declarada, implementación ausente).

### Hito 2 — Backend (commit `093977e`) ✅

- **`packages/domain-customers`** (nuevo): 4 módulos + tests, **100% cobertura**:
  - `consent.ts` — consentimiento por propósito (LPDP-01): GRANT/REVOKE/NOOP, reusa opt-in Sprint 24.
  - `export.ts` — export por-cliente (LPDP-02): fail-closed `CUSTOMER_ERASED`.
  - `erase.ts` — erase/anonimización (LPDP-03): estado `ERASED`, guard de re-consentimiento.
  - `inventory.ts` — inventario PII (LPDP-04): qué campos son PII por entidad.
- **`packages/adapters-d1/src/customer-repository.ts`** (nuevo): `listCustomers`, `getCustomer`, `listConsents`, `writeConsent` (idempotente), `eraseCustomer` en **un solo `db.batch`** (perfil → `pii_erased`, snapshots `[ANONYMIZED]`/`00000000`, revocación de consents, audit `LPDP_ERASE` con cadena `prev_hash`/`row_hash`), `exportCustomer`. **7 tests de integración workerd GREEN** (207/207 suite).
- **`apps/worker-api`**: rutas nuevas bajo `src/customers/customer-lpdp-routes.ts`:
  - `GET /api/customers` (listado, sin PII), `GET/POST /api/customers/:id/consents|consent`.
  - `GET /api/customers/:id/export` (LPDP-02, fail-closed si erasure), `POST /api/customers/:id/erase` (solo owner/admin/supervisor).
  - `tenant_id` **siempre del JWT** (nunca del body/query), flag `FEATURE_LPDP` **default-off**, Plan Guard premium (402) + 403 semántico.
  - 9 tests unit + suite 660 GREEN.
- **Fix preexistente sprint-46**: `schema.integration.test.ts` — el down total ahora incluye `DOWN_0039` (forecasting) y `DOWN_0040` (LPDP); antes quedaba un trigger de forecast vivo tras el drop.
- **Verificado**: unit 291/291, integración 207/207, `scripts/verify.sh` SUITE GREEN (V-00..V-24), bundle bajo CAL-06.

## Lo que falta (Hitos 3 y 4) — NO tocar hasta aquí

### Hito 3 — UI + Runbook + Copy (Staff Security / Staff Data / Staff Growth)

1. **Panel clientes pos-web** (`apps/pos-web`), en **Modo Dueño/Admin** (patrón `src/routes/owner/`, `src/routes/admin/`). **No existe módulo de clientes aún** — crear ruta nueva tipo `admin/clientes` (o `owner/clientes`, seguir patrón del shell admin `src/lib/admin/app-shell-session.ts` y `src/lib/features.ts`):
   - Listado de clientes (sin PII expuesta en lista), detalle con consentimientos por propósito (GRANT/REVOKE), botón export (descarga JSON), botón erase con **confirmación doble** (incluye anonimización irreversible + retención fiscal SUNAT ~5 años).
   - Gated por `FEATURE_LPDP` (default-off) igual que el backend.
   - Copy sin jerga (la privacidad es claim GTM-09, se vende al cliente final).
   - Tests: unit del client + (si aplica) E2E. Sigue el patrón de `forecasting-page.test.ts` y `e2e/forecasting.spec.ts`.
2. **Runbook DPO**: crear en `docs/runbooks/` (plantilla `docs/runbooks/TEMPLATE.md`) un runbook de atención a solicitudes de exportación (LPDP-02, vía API existente), borrado (LPDP-03), qué se retiene por SUNAT, cómo verificar el simulacro.
3. **Copy GTM**: redactar copy legal/UX de privacidad en `docs/GTM.md` (sin jerga) — **no publicar política de privacidad pública todavía**: solo tras QG (ver Hito 4).

### Hito 4 — Chaos, E2E, QG, Ledger

1. **Simulacro de solicitud LPDP** (criterio de aceptación de la fase): con la UI/API en local, simular pedido de export + borrado de un cliente real con datos; documentar evidencia.
2. **E2E** de flujo completo (export + erase) en `apps/pos-web/tests/e2e/`.
3. **Quality Gate documental**: crear en `docs/ops/` un doc QG (patrón `docs/ops/s46-forecasting-qg.md`) con tablas RED→GREEN, run IDs, commits, evidencia local exacta, y estado produccion/piloto (NO-GO hasta staging Cloudflare real + A+V independiente).
4. **Registrar en `docs/LEDGER.md`** con skill `kipus-changelog` (entrada nueva, schema v2, `prev_hash`/`entry_hash` reales, V-20).
5. **Staff Growth publica la política de privacidad** (GTM §5.7 Legal / footer) **solo tras el gate**.
6. Corre el sprint entero con skill `kipus-task` y cierra con `kipus-quality-gate` (CAL-01..08: cobertura dominio ≥95%, adaptadores/apps ≥70%, semgrep PII, gitleaks).

## Estado de gobernanza

- **GOV-APROBADO** vigente para la especificación (entrada 0176/0177). El QG de implementación (Proceso §8.1/§8.3) cierra por sprint con evidencia runtime + RACI A+V independiente; sin evidencia = NO-GO.
- Claims congeladas relacionadas: **GTM-09** (Exportación/privacidad) — "Export/LPDP congelado hasta Sprints 42/47"; no prometer "cuando quieras" antes del gate. El claim "analítica predictiva" (GTM-01) ya se descongeló en Sprint 46.
- **WIP ajeno**: en la rama existía un commit `33098d9` (admin modules UI/icons de pos-web) que estaba fuera del sprint-47 pero ya está en `main`; preservarlo, no revertir.

## Referencias

| Tema | Dónde |
|---|---|
| Contrato de sprint | `docs/roadmap/fase-6f.md` (Sprint 47) |
| Reglas LPDP | Arquitectura §5.3 regla 32a (registry §0.4) |
| ADR | `docs/adr/ADR-0031-lpdp-privacy.md` |
| Backend | `packages/domain-customers/`, `packages/adapters-d1/src/customer-repository.ts`, `apps/worker-api/src/customers/` |
| Patrón QG | `docs/ops/s46-forecasting-qg.md` |
| Runbook template | `docs/runbooks/TEMPLATE.md` |
| Claims/privacidad | `docs/GTM.md` (GTM-09, §5.7 Legal) |
| Ledger | última entrada `0319` (prev_hash para la 0320) |
| Skills | `kipus-task`, `kipus-quality-gate`, `kipus-changelog`, `kipus-verify` |
