---
doc_id: adr-0034
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0034 — Login local del POS con PIN de cajero (identidad local vs IdP externo)

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-13 |
| Decisores | Staff Backend ACID, Staff Security, Staff Frontend |
| Consultados | Staff Principal |
| Informados | Escuadrón |
| Relaciona | Arquitectura §3 (auth) · SEC-01 · SEC-03 · SEC-11 · §5.3 regla 36 · Ledger 0356 · Sprint C2 |

## Contexto

El POS abre su sesión administrativa únicamente con un JWT emitido por un **IdP
externo** (JWKS o `AUTH_JWT_HS_SECRET`); `GET /api/auth/session` solo bootstrapa
identidad + terminal sobre un Bearer ya presente. Los cajeros invitados por
`ops.team_invite` (regla 36) tienen `users.pin_hash` + `users.badge_barcode`
pero **no `external_auth_id`** (el INSERT de `processTeamInviteAtomic` no lo
puebla), por lo que el middleware `loadUserFromD1` (que matchea
`external_auth_id = ?`) jamás los carga. La pantalla `/login` es un placeholder
y no existe mint de sesión en producción. La spec manda: "Una sesión ausente o
revocada abre login" (§5.12) y SEC-11 (lockout PIN 5 fallos/15 min); SEC-03
pide PIN argon2id, pero la implementación existente (`hashPin` en
`domain-ops/shift-handoff.ts`) usa SHA-256 hex sin salt y **no existe runtime
argon2 en el worker** (grep 0 en lockfile/node_modules).

## Decisión

1. **Nuevo `POST /api/auth/cashier-login`** (flag `FEATURE_AUTH_CASHIER_LOGIN`):
   body `{ tenantId, identifier, pin }` — `identifier` = `users.id` o
   `badge_barcode EMP-…` — resuelve el usuario **dentro del tenant** y, si el
   PIN verifica, **mintea un JWT local HS256** con `AUTH_JWT_HS_SECRET`
   (claims: `sub = users.id`, `tenantId`, `role`, `branchId`, `auth_time`,
   `iat`/`nbf`/`exp` con TTL 12 h).
2. **Verificación del PIN** contra el formato existente (`sha256Hex(pin)`
   comparado en **tiempo constante**, byte a byte) para compatibilidad con los
   `pin_hash` emitidos por TEAM_INVITE. La migración a **argon2id (SEC-03)** es
   deuda normativa documentada: requiere runtime wasm nuevo y re-hashear los
   PIN existentes (los hashes SHA-256 no pueden verificarse con argon2).
3. **Lockout en memoria** del isolate, 5 fallos/15 min por
   `tenantId:identifier` (SEC-11), mismo patrón que el mint de
   `authorization_token` (deuda compartida: no sobrevive evictions; la tabla de
   lockout por-tenant es follow-up).
4. **Sin enumeración de usuarios**: identifier desconocido responde
   `403 PIN_INVALID` (idéntico al PIN incorrecto); `PIN_NOT_CONFIGURED` solo si
   el usuario existe sin `pin_hash`.
5. **Middleware**: `loadUserFromD1` pasa a matchear
   `(external_auth_id = ? OR id = ?)` — los JWT de IdP externo siguen
   resolviendo por `external_auth_id`; los locales por `id` (fallback por PK
   exacta, sin cambio de contrato).
6. **El login emite identidad, no ciclo de caja**: la sesión de terminal
   (`pos_terminal_sessions` ACTIVE + caja abierta) sigue viviendo en
   `GET /api/auth/session`; si falta, el cliente muestra el estado
   `TERMINAL_SESSION_REQUIRED` y guía al operador.
7. **Cliente**: el token se persiste en `localStorage['kipuspay_token']` y
   `app-shell-session` lo usa como `authorization` cuando no hay
   `PUBLIC_DEV_AUTH` (el layout lo recoge automáticamente); `/login` pasa a ser
   el formulario real (badge/userId + PIN, kit ui/*). Offline-first intacto:
   la venta rápida y la caja local no requieren sesión.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| A — Exigir IdP externo siempre | Los cajeros invitados localmente (regla 36) no tienen identidad en ningún IdP; el onboarding S51 emite PIN/badge como credencial nativa. |
| B — Migrar pin_hash a argon2id en este sprint | No existe runtime argon2 en el worker y los hashes SHA-256 existentes no son verificables con argon2; la migración (wasm + re-hash + rotación) es un sprint propio. Se documenta como deuda SEC-03. |
| C — Crear `pos_terminal_sessions` en el login | Requiere una `cash_register_sessions` abierta (NOT NULL); mezcla identidad con ciclo de caja. El bootstrap existente ya cubre la sesión de terminal. |
| D — Token en `sessionStorage` | La app ya lee `kipuspay_token` (localStorage) para el sync offline; persistir en localStorage es consistente con el flujo existente. |

## Consecuencias

- **Gana:** el cajero invitado abre el POS con badge/PIN sin IdP externo;
  `/login` deja de ser placeholder; el token local alimenta `app-shell-session`
  y el sync offline; sin enumeración de usuarios; lockout SEC-11.
- **Paga:** lockout por-isolate (deuda ya existente en authz-token); el mint
  HS256 depende de `AUTH_JWT_HS_SECRET` (Workers Secret, no hardcodeado);
  argon2id sigue pendiente (SEC-03).
- **Invariantes tocadas:** identidad solo desde claims verificados (SEC-01);
  revocación fail-closed intacta (el JWT local pasa por el mismo
  `decideAuthGate`); cero montos en el flujo (login sin dinero); zero-dependency
  cliente intacto (login usa el kit ui/*).
- **Activación:** flag `FEATURE_AUTH_CASHIER_LOGIN` (default-off), Sprint C2.

## Evidencia de cierre

- Tests / checks: `cashier-login-route.test.ts`, `cashier-login.test.ts`
  (cliente), roundtrip mint→verify, suite e2e pos-web, `verify.sh` SUITE GREEN.
- Ledger: `id: 0357`
- Firmas RACI: `R` Staff Backend ACID · `A` Staff Principal · `V` Staff Security
