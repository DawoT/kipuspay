---
doc_id: ops-s45-mobile-push-pos-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 45 — Push móvil y caja PWA Android — Quality Gate

**Estado software:** GREEN local  
**Estado claim/producción/piloto:** NO-GO condicionado  
**Capabilities:** `mobile.push`, `client.mobile_pos`, default-off  
**Spec:** Arquitectura §5.12 regla 30 · ADR-0029 · COM-11 · DAT-12 · Roadmap FASE 6E

El gate automatizado demuestra software local, bindings simulados y navegador
emulado. No demuestra entrega Web Push/FCM real ni comportamiento de un Android
físico. Sin staging real y firmas Mobile+QA+Security A+V independientes, este
documento no autoriza GTM-26, producción, piloto ni una certificación externa.

## Evidencia RED→GREEN

| Hito | Run ID | Commit completo | Evidencia |
|---|---|---|---|
| RED contractual | `run-red-s45-mobile-push-pos-76744aa` | `76744aae9b7a91b235784d9fe896602bc8f9fe23` | Contratos de DDL/down 0038, outbox/dispatcher, workerd, VAPID/FCM/KMS, rutas/RBAC/ACK, PWA/SW, caja móvil y chaos fallaban por implementación productiva ausente |
| GREEN local | `run-green-s45-mobile-push-pos-7e6b367` | `7e6b367219897276b1573e5c7357262c5ceca8b2` | Implementación local de 0038, atomicidad, transporte aislado, API, PWA/SW, polling, low-end emulado y chaos |

Ancestría verificada:
`76744aae9b7a91b235784d9fe896602bc8f9fe23` →
`7e6b367219897276b1573e5c7357262c5ceca8b2` → `HEAD`.

**Expected failure RED:** faltaban migración/down 0038, atomicidad y workerd,
consentimiento/revocación, provider/KMS, rutas y ACK, artefacto PWA/SW, persistencia
de 500 ventas offline y chaos que preservara privacidad, aislamiento e idempotencia.

## Resultado local exacto

| Suite/check | Resultado observado |
|---|---|
| Worker API | 606 tests en la suite actual; satisface el requisito de 604 o posterior |
| Worker KMS | 28 tests |
| Adapters D1 unit | 281 tests |
| Adapters D1 workerd | 200 tests GREEN; migración/atomicidad/replay/revocación/concurrencia/ACK/privacidad |
| POS web unit | 144 tests |
| Chaos harness | 101 tests |
| Chaos móvil | 500 ciclos deterministas; seed 1170276334; p95 simulado 4412 ms; PASS |
| PWA a11y | Playwright 2/2 a 360 px y 375 px, sin violaciones critical/serious y targets >=48 px |
| Low-end | Playwright 1/1; 500 ventas offline exactas tras reload/upgrade SW/reconnect, en harness emulado |
| POS bundle | 142.32 kB gzip, dentro del presupuesto |
| `scripts/verify.sh` | `RESULT SUITE GREEN` |
| `scripts/quality.sh` | `Quality Gate OK` |
| Security Review final | 0 hallazgos medium+ |

Los conteos pertenecen al monorepo en GREEN/HEAD y pueden aumentar con suites
posteriores; no se reducen para presentar un número histórico.

## Cobertura contractual

| Contrato | Evidencia local |
|---|---|
| DDL 0038 / DAT-12 | Cuatro tablas tenant-scoped, FKs compuestas, índices, epochs/KPBK1 y down protegido |
| Consentimiento | Grant por usuario/propósito/dispositivo; revocación desactiva suscripciones; ausencia falla cerrada |
| Privacidad | `REDACTED` default; montos requieren doble control; payload/deep link no aceptan PII, fiscal, endpoint, token o secreto |
| Transporte | Web Push VAPID y FCM HTTP v1 detrás de Worker RPC + `PUSH_KMS`; FCM legacy prohibido; módulo web vendorizado lazy con licencia/hash/SBOM |
| Entrega/ACK | `ACCEPTED` separado de `DISPLAYED`; receipt opaco, firmado, one-shot y <=300 s; replay/tarde/scope incorrecto no muta |
| Dispatcher | Lease CAS, TTL, collapse, `Retry-After`, backoff+jitter, fairness tenant; 404/410/stale invalida y 429/5xx reintenta |
| Disponibilidad | Fallo provider/KMS/SW degrada a polling/banner; no revierte ni bloquea operación origen |
| PWA móvil | Un SW, manifest/offline, mismo RBAC/sesión/cola/reconciliación del POS y capabilities sin fork vertical |
| Recuperación | Runbook cubre kill switches global/provider, revocación masiva, rotación, backlog/lease, SW/caché, PII y validación |

Tests de trazabilidad que resuelven en el monorepo:

- `packages/domain-integrations/src/mobile-push.red.test.ts` y
  `packages/domain-integrations/src/mobile-push.test.ts`.
- `packages/domain-contracts-sync/src/mobile-push-outbox.red.test.ts` y
  `packages/domain-contracts-sync/src/mobile-push-outbox.test.ts`.
- `packages/adapters-d1/src/mobile-push-schema.red.test.ts`,
  `packages/adapters-d1/src/mobile-push-atomic.test.ts` y
  `packages/adapters-d1/src/mobile-push-workerd.red.integration.test.ts`.
- `apps/worker-kms/src/mobile-push-transport.red.test.ts`,
  `apps/worker-kms/src/mobile-push-receipt.test.ts` y
  `apps/worker-kms/src/push-kms-core.test.ts`.
- `apps/worker-api/src/push/mobile-push-routes.red.test.ts`,
  `apps/worker-api/src/push/mobile-push-security.test.ts` y
  `apps/worker-api/src/push/mobile-push-dispatcher.test.ts`.
- `apps/pos-web/src/lib/mobile/mobile-push-pwa.red.test.ts`,
  `apps/pos-web/tests/e2e/mobile-pwa-a11y.spec.ts` y
  `apps/pos-web/tests/e2e/mobile-low-end-emulated.spec.ts`.
- `packages/chaos-harness/src/mobile-push.red.test.ts`.

## Chaos determinista local

`runMobilePushChaos(500)` usa seed decimal `1170276334` (`0x45c0ffee`) y cubre 19
fallas: duplicado, timeout/cuota/5xx/Retry-After, token FCM 404/410/stale, rotación
VAPID, offline, doze, upgrade SW, reload, cuota IndexedDB, terminal revocada, ACK
tardío/falso/replay y dispatch concurrente.

Resultado: p95 simulado de red normal 4412 ms y tasa mostrada 100% de muestras
elegibles. Quedaron en cero push sin consentimiento, PII/secreto, duplicados visibles,
ACK falsos, confusión `ACCEPTED`/`DISPLAYED`, cruces tenant, entregas a revocados,
ventas offline perdidas/duplicadas, operaciones origen bloqueadas y entradas de cola
perdidas. `OFFLINE` y `DOZE` se etiquetan y excluyen del denominador normal; no se
cuentan como entrega.

Es una simulación de software determinista. El p95 4412 ms no prueba el SLO de red,
provider, radio, doze ni dispositivo real.

## PWA y low-end emulado

Playwright verifica onboarding a 360/375 px, axe sin impacto critical/serious y
targets táctiles de al menos 48 px. El harness low-end escribe 500 IDs offline en
IndexedDB, recarga, solicita update del único SW y reconcilia exactamente 500 con
cola final cero; limita crecimiento de heap a 32 MiB e interacción p95 a 200 ms.

La palabra **emulado** es parte del resultado: no existe evidencia física de Android
de gama baja, Chrome/WebView del fabricante, presión real de storage, background
sync, radio intermitente, doze ni políticas OEM.

## Security Review

La revisión final del cambio reportó **0 hallazgos medium+**. Las suites negativas
cubren consentimiento/revocación fail-closed, scope tenant/user/branch/terminal,
payload/deep-link allowlisted, ACK firmado one-shot, respuestas provider opacas y
frontera `PUSH_KMS`.

Esta revisión de código y evidencia local no equivale a pentest, auditoría externa,
certificación LPDP ni validación de credenciales/provider reales. La firma humana
Staff Security V independiente permanece pendiente junto a Mobile y QA.

## Evidencia externa pendiente

| Evidencia requerida | Estado | Condición de cierre |
|---|---|---|
| Web Push VAPID staging real | PENDIENTE / NO-GO | Consentimiento, rotación/revocación, provider acceptance y ACK `DISPLAYED` con telemetría real |
| FCM HTTP v1 staging real | PENDIENTE / NO-GO | OAuth/service account en Secrets/KMS, token stale, cuotas/retry y ACK real sin FCM legacy |
| SLO real | PENDIENTE / NO-GO | p95 evento→display <10 s y `DISPLAYED` >=99% en matriz normal; offline/doze etiquetados |
| Android físico gama baja | PENDIENTE / NO-GO | 500 ventas exactas bajo reload/upgrade, storage pressure, background y doze sin pérdida/duplicado |
| Ensayo del runbook | PENDIENTE / NO-GO | Kill switches, polling, mass revoke, rotación, leases/backlog y rollback SW en staging |
| A+V independiente | PENDIENTE / NO-GO | Staff Mobile A + Staff QA V + Staff Security V independientes firman evidencia |

## RACI real

| Rol | Estado |
|---|---|
| Staff Backend/Data/Frontend | Software local GREEN |
| Staff Mobile | Implementación y emulación local GREEN; Android físico/staging y firma A pendientes |
| Staff SRE | Dispatcher/runbook local; providers y observabilidad staging pendientes |
| Staff Security | Revisión final sin medium+; firma V externa/independiente pendiente |
| Staff QA + Staff Hardware | Dispositivo físico, doze/storage/background y firma V pendientes |
| Staff Growth + Staff PM | GTM-26, producción y piloto NO-GO |

## Veredicto

**SOFTWARE-GREEN-CLAIM-NO-GO.** Las capabilities permanecen default-off. GTM-26,
producción y piloto siguen NO-GO hasta Web Push/FCM staging real, SLO observado,
Android físico de gama baja y firmas independientes Mobile+QA+Security A+V. No se
promete entrega offline/doze, compatibilidad Android universal ni certificación
externa.
