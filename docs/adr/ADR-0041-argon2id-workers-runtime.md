---
doc_id: adr-0041
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0041 — Argon2id estático en Workers y sesión de caja verificada

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-09-16 |
| Decisores | Usuario solicitante · Staff de implementación |
| Consultados | Seguridad · POS · QA |
| Informados | Escuadrón |
| Relaciona | ADR-0034 · Arquitectura §3 (auth) · SEC-01 · SEC-03 · SEC-11 |

## Contexto

ADR-0034 dejó Argon2id como deuda porque el runtime de PIN usaba WASM embebido
que se compila desde bytes. Workers bloquea esa compilación dinámica. Además,
el bootstrap de terminal omitía el `cash_register_session_id` de la sesión
activa, por lo que el checkout no podía asociar su operación con la caja
verificada por el servidor.

## Decisión

El Worker carga Argon2id desde un módulo WASM estático del bundle. La creación
de hashes nuevos falla cerrada si Argon2id no está disponible; nunca degrada a
SHA-256. Los hashes SHA-256 legados se siguen verificando y se re-hashean a
Argon2id tras una autenticación válida, comparando el hash leído para no
sobrescribir una rotación concurrente. La indisponibilidad del runtime Argon2
se distingue de un PIN incorrecto y falla cerrada sin incrementar el lockout.
`GET /api/auth/session` expone el
`cashRegisterSessionId` de la sesión terminal ACTIVE verificada, y el POS lo
prefiere al dato de claim al registrar el checkout.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Degradar a SHA-256 cuando falla WASM | Repite hashes débiles para credenciales nuevas y oculta una configuración inválida. |
| Compilar el buffer WASM en ejecución | Workers lo bloquea por su modelo de seguridad. |
| Tomar `cashRegisterSessionId` únicamente del claim del navegador | No es la sesión terminal ACTIVE verificada por `GET /api/auth/session`. |

## Consecuencias

- **Gana:** PIN Argon2id verificable en Workerd, re-hash sin pisar rotaciones concurrentes y asociación de ventas con una sesión de caja server-verified.
- **Paga:** el bundle incorpora un módulo WASM estático; actualizar el vendor requiere regenerar ese módulo con `scripts/extract-argon2-wasm.mjs`.
- **Invariantes tocadas:** SEC-01/03/11 y offline-first; la UI aporta contexto de caja verificado, pero el servidor conserva la autoridad transaccional.
- **Activación:** inmediata en runtime local; la activación remota queda fuera del alcance y requiere el gate de staging autorizado.

## Evidencia de cierre

- Tests / checks: `test:pin-crypto:workerd`, pruebas unitarias PIN y sesión, `scripts/verify.sh` pendientes de gate integral.
- Ledger: pendiente de commit con evidencia RED/GREEN y revisión independiente R2.
- Firmas RACI: pendientes; no se declara Quality Gate aprobado.
