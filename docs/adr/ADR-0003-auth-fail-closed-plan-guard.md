---
doc_id: adr-0003
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0003 — Auth fail-closed y Plan Guard sin 402 en cobro

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-04 |
| Decisores | Staff Principal, Staff Security |
| Consultados | Staff SRE, Staff PM |
| Informados | Escuadrón |
| Relaciona | Arquitectura §3 · GTM §4.1 · §4.3 · Roadmap Sprint 2 · Ledger 0193 · AGENTS invariante 5 |

## Contexto

Sprint 2 exige `tenantAndAuthMiddleware` con (1) fail-closed si no se puede
verificar revocación y (2) Plan Guard que nunca apague cobro/caja/emisión con
HTTP 402. La regla canónica vive en Arquitectura §3; GTM §4.1 la promete
comercialmente.

## Decisión

1. La decisión de gate es una función pura `decideAuthGate` en
   `apps/worker-api/src/auth/` (sin Hono en el núcleo de la decisión).
2. Si `checkRevocation` no está disponible → HTTP **503**
   (`REVOCATION_CHECK_UNAVAILABLE`), nunca permitir por omisión.
3. `isCheckoutCriticalRoute` excluye cobro/caja/emisión de `isPremiumFeatureRoute`;
   402 solo aplica a premium (Modo Dueño, reportes avanzados, insights, multi-caja).
4. Slice 2: `TENANT_KV` + `TenantState` DO (`TENANT_STATE_DO`) cableados vía
   `createAuthDepsFromEnv` / `isTenantRevokedCached` (KV solo acelera
   `revocation:{id}=1`; miss → DO; DO caído → 503). `verifyJwt` WebCrypto
   queda para slice 3.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Fail-open si KV/DO cae | Viola invariante 5 (revocación fail-closed) |
| 402 global en past_due | Viola GTM §4.1 ("el POS que no se cae") |
| Lógica solo dentro del middleware Hono | Dificulta tests unitarios y viola aislamiento de dominio |

## Consecuencias

- **Gana:** tests negativos demuestran 503 y no-402 en cobro sin DO real.
- **Paga:** deps inyectables hasta cablear TENANT_KV / TENANT_STATE_DO.
- **Invariantes:** 5 (fail-closed), 9 (DRY — cita §3, no reescribe).
- **Activación:** Sprint 2 slice 1.

## Evidencia de cierre

- Tests: `auth-decide.test.ts`, `tenant-auth-middleware.test.ts`, `control-plane.test.ts`.
- Ledger: `id: 0193`–`0197` (cierre Sprint 2) · ASVS L2 en ADR-0004.
- Firmas RACI: `R` Staff Security · `A` Staff Principal · `V` Staff SRE + Staff PM.
