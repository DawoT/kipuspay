---
doc_id: adr-0035-owner-full-access-plan-guard
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0035 — Acceso total del owner a los módulos de su negocio, limitado por Plan Guard

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-23 |
| Decisores | Owner (KipusPay) · Staff Principal |
| Consultados | Staff Security · Staff Mobile · Staff SRE |
| Informados | Staff PM · Staff QA |
| Relaciona | Arquitectura §5.12 (COM-11) · §5.7 · §1.1 (ADR-ARCH-002) · Proceso §4 · ADR-0034 · Ledger 0013 (staff) |

## Contexto

El drill H4 (Ledger staff 0013) expuso una contradicción estructural: la página
`/mobile` exige `terminal.verified` para activar notificaciones con purpose
`OWNER_ALERTS`, pero `session-route` devuelve `terminal: null` para roles
owner/admin **por diseño** — las terminales (`pos_terminals` +
`pos_terminal_sessions`) son el modelo de accountability de caja de cajeros
(ADR-0034, §5.7): vinculan hardware ↔ cajero ↔ sesión de arqueo. Resultado: el
dueño jamás puede activar las alertas de su propio negocio desde el navegador.

El owner decide el principio rector: **el dueño tiene acceso total a los
módulos de su negocio; el límite es el plan adquirido (Plan Guard via
`tenant_capabilities`), nunca un candado de terminal**.

## Decisión

El ancla de autorización del dueño es **capability del tenant + consentimiento
LPDP**, no la sesión de terminal. El modelo de terminales queda intacto y
sigue significando accountability de caja de cajeros. Concretamente:

1. `session-route` NO cambia: owner/admin siguen sin contexto de terminal
   (no operan gaveta).
2. La puerta de suscripción push (`/mobile` → `registerBrowserPush`) acepta
   owner/admin sin terminal: `canRegister = mobilePushOn && (terminal?.verified
   || role ∈ {owner, admin})`. El servidor ya autoriza así
   (`OWNER_ROLES` → purpose `OWNER_ALERTS`, capability `mobile.push` +
   `consent_records`); el cambio es alinear el gate cliente con el contrato
   server que ya existía.
3. El límite real de "acceso total" sigue siendo Plan Guard: cada módulo
   consulta su capability (`tenant_capabilities`); sin capability, fail-closed
   (invariante 5). El rol owner no otorga nada que la capability no otorgue.

Verificable por: test de autorización negativa (cajero de otro tenant y owner
sin capability → 403; owner con capability+consent → 200) + drill E2E de
suscripción y push.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| (a) Otorgar contexto de terminal a owner/admin | Diluye el modelo: la terminal dejaría de significar "estación de cobro con arqueo" y rompería la trazabilidad de accountability de caja (§5.7). |
| (c) Endpoint/página owner dedicada de suscripción | Duplica superficie (consent + subscribe + revoke ya existen en `/api/push/*` y `/mobile`) contra DRY (invariante 9); más código que mantener para el mismo contrato. |

## Consecuencias

- **Gana:** el dueño activa sus alertas sin depender del modelo de cajeros;
  el límite de acceso es único y explícito (Plan Guard/capabilities); se cierra
  el gap `owner-push-subscribe-blocked`.
- **Paga:** la página `/mobile` muestra el flujo de activación con dos ramas
  (terminal para cajero, consent para owner) — un poco más de lógica cliente;
  los tests de autorización negativa deben cubrir la matriz rol×capability.
- **Invariantes tocadas:** ninguna — invariante 5 (fail-closed) se respeta
  (sin capability → 403); ADR-ARCH-002 se refuerza (capability como único
  límite); LPDP-01 se mantiene (consentimiento explícito por propósito).
