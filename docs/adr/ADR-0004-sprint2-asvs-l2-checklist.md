---
doc_id: adr-0004
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0004 — Checklist OWASP ASVS L2 (Sprint 2 auth)

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-04 |
| Decisores | Staff Security, Staff Principal |
| Consultados | Staff SRE, Staff PM |
| Informados | Escuadrón |
| Relaciona | Arquitectura §3 · Roadmap Sprint 2 · ADR-0003 · GTM §4.1 · Proceso §8.1 |

## Contexto

El Quality Gate de Sprint 2 exige checklist OWASP ASVS Nivel 2 aprobado para el
middleware de auth, 0 secretos hardcoded, y firma PM de que el Plan Guard no
apaga el cobro (GTM §4.1).

## Decisión

Se cierra Sprint 2 con este checklist verificable por tests + gitleaks + RACI.
Ítems ASVS L2 aplicables al edge auth (no al POS offline completo):

| ID ASVS (área) | Control | Evidencia KipusPay |
|---|---|---|
| V2.1 / sesión | Identidad solo desde JWT verificado | `verifyJwt` + tests `verify-jwt` / `jwt-idp.http` |
| V2.2 | Rechazo de algoritmos inseguros (`none`) | denylist en `verifyJwt` |
| V2.3 | Expiración / nbf / iat | `timeClaimsOk` |
| V3.1 | Autorización fail-closed | `REVOCATION_CHECK_UNAVAILABLE` → 503; carga DO: 50 tenants concurrentes sin autorización por omisión y DO caído a mitad de carga → `unavailable` (tests `control-plane.test.ts` "Sprint 2: carga de revocación sobre DO") |
| V4.1 | Control de acceso por tenant | hint mismatch → 403; IdP user por tenant |
| V7.1 | Secretos no en repo | Workers Secret `AUTH_JWT_HS_SECRET`; gitleaks + `no-secrets` |
| V8.1 | Errores sin filtrar secretos | respuestas JSON con `code` estable, sin stack/secret |
| V14.1 (negocio) | Cobro no bloqueado por plan | Plan Guard: checkout-critical nunca 402 |

**Staff PM:** el enforcement degrada solo premium (`/api/owner/*`, reportes,
insights); cobro/caja/emisión permanecen fail-open respecto a plan/trial
(GTM §4.1 — “el POS que no se cae”).

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Cerrar Sprint 2 sin checklist escrito | Viola QG explícito de `docs/roadmap/fase-1.md` |
| ASVS L3 completo | Fuera de alcance MVP; L2 es la barra del Proceso §1 |

## Consecuencias

- **Gana:** gate de Sprint 2 auditable; RACI explícito.
- **Paga:** JWKS RS real y carga DO siguen evolucionando en ops/Sprint 3 webhooks.
- **Activación:** Sprint 2 Cerrado.

## Evidencia de cierre

- Tests: `verify-jwt`, `idp-user`, `jwt-idp.http`, `control-plane` (incl. carga de
  revocación DO: 50 tenants concurrentes, caída a mitad de carga, coalescing
  500→1 read), `tenant-auth-middleware`, `protected-routes` (paridad catálogo↔matriz:
  100% de rutas `/api/*` con 401/503).
- Gitleaks / CAL-05: 0 secretos en working tree.
- Ledger: `id: 0197` (actualizado en 0328).
- Firmas RACI: `R` Staff Security · `A` Staff Principal · `V` Staff SRE + Staff PM.
