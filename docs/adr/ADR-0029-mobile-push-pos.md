---
doc_id: adr-0029-mobile-push-pos
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0029 — Push aislado y caja móvil sobre el POS único

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-08 |
| Decisores | Staff Principal · Staff Mobile · Staff Security · Staff Product |
| Consultados | Staff Frontend · Staff Backend ACID · Staff SRE · Staff QA |
| Informados | Staff Growth · Staff Support · Staff Hardware |
| Relaciona | Arquitectura §5.12 regla 30 · Roadmap Sprint 45 · COM-11 · DAT-12 · SYN-07 · GTM-26 |

## Contexto

El borrador de regla 30 tenía una sola tabla con endpoint y credenciales en claro,
confundía aceptación del proveedor con visualización, delegaba el consentimiento de
usuarios a Sprint 47 y no fijaba la relación entre Modo Dueño, FCM, el Service
Worker y la caja móvil. Eso permitía filtrar PII en lockscreen, duplicar motores,
declarar entregas no observadas o bloquear flujos origen por una integración
best-effort.

## Decisión

1. El contrato canónico y DDL objetivo 0038 viven solo en Arquitectura §5.12; §5.3
   conserva el puntero. `mobile.push` es el motor, `owner.push_alerts` su alias
   legado y `client.mobile_pos` el cliente PWA del mismo POS.
2. Web Push VAPID y FCM HTTP v1 se ejecutan en un Worker aislado con `PUSH_KMS`.
   FCM web usa módulo vendorizado lazy, versión/licencia/SHA-256/SBOM fijados y cero
   dependencia npm runtime.
3. `REDACTED` es default. `AMOUNTS` exige política tenant y opt-in Owner. Lockscreen
   nunca contiene PII de cliente, contenido fiscal, endpoint, token ni secreto.
4. Provider `ACCEPTED` no es entrega. Solo el ACK firmado, opaco, one-shot y vigente
   hasta 300 s produce `DISPLAYED`; el SLO mide evento→display en red normal.
5. El consentimiento de usuario/empleado se resuelve en Sprint 45 y no depende del
   consentimiento de clientes de Sprint 47. Fallar push nunca bloquea el evento
   origen.
6. Un único Service Worker controla PWA, offline sync y push. Caja móvil reutiliza
   dominio, RBAC, terminal, revocación y cola offline; no crea rol ni fork vertical.
7. Sprint 45 inicia con gobernanza y contratos RED. Migración, transportes, rutas,
   Service Worker, UI, chaos y cierre se implementan en un ciclo GREEN posterior.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Solo Web Push | No cubre la matriz FCM requerida para Android/PWA |
| FCM legacy server key | Credencial amplia y protocolo deprecado; se exige HTTP v1 OAuth2 |
| SDK FCM npm runtime | Rompe presupuesto zero-dependency del cliente |
| Guardar endpoint/token en claro | Son identificadores secretos correlacionables |
| Considerar HTTP 201 como entrega | Prueba aceptación del proveedor, no visualización |
| Consentimiento solo en Sprint 47 | Permitiría push S45 sin base explícita del usuario/empleado |
| Mostrar detalle completo | Expone negocio y PII en lockscreen no autenticada |
| Un Service Worker por provider | Crea controladores rivales y riesgo de perder cola offline |
| App Android/domain fork | Viola capability model y duplica reglas de caja |

## Consecuencias

- **Gana:** privacidad conservadora, entrega observable, secreto aislado, transporte
  sustituible y paridad exacta entre caja fija/móvil.
- **Paga:** cuatro tablas, Worker RPC/KMS, ACK device-side, módulo vendorizado
  gobernado, certificación real de providers y dispositivo.
- **Invariantes tocadas:** DAT-12, revocación fail-closed, offline-first,
  zero-dependency cliente, capability model y DRY de dominio.
- **Activación:** Sprint 45, flags `FEATURE_MOBILE_PUSH` y
  `FEATURE_CLIENT_MOBILE_POS` default-off; `FEATURE_OWNER_PUSH` solo alias de
  transición. GTM-26 permanece congelado hasta Quality Gate firmado.

## Evidencia de cierre

- Tests/checks: contratos RED de dominio/contratos, schema/workerd/outbox,
  VAPID/FCM/KMS, API/RBAC/ACK, POS SW/PWA/móvil y chaos/gama baja; `scripts/verify.sh`.
- Ledger: no corresponde al baseline RED; no se cierra sprint ni se anexa entrada.
- Firmas RACI pendientes: `R` Staff Mobile · `A` Staff Product · `V` Staff QA y
  Staff Security independientes.
