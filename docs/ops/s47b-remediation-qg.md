---
doc_id: ops-s47b-remediation-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 47b — Remediación de bugs del harness — Quality Gate

**Estado software:** GREEN local  
**Estado claim:** sin claims nuevos (remediación interna); GTM sin cambios  
**Capabilities:** sin cambios (compliance.lpdp sigue default-off; fixes sobre capabilities existentes)  
**Spec:** Arquitectura §5.3 regla 20 (store credit), §6 (ACID), §8.1 (drain fiscal), SEC-01 (JWT), SYN-04/SEC-06 (fecha fiscal) · Roadmap FASE 6F

El harness de auditoría (3 agentes, sesión previa) detectó 8 bugs reales de
dinero/concurrencia/fiscal/seguridad en el hot path. Este sprint los corrige uno a uno
con TDD (RED → GREEN) y evidencia por bug:

| # | Bug | Severidad | Fix |
|---|---|---|---|
| B1 | Race de cupo de crédito: dos ventas a crédito concurrentes exceden `credit_limit_cents` (preflight fuera del batch, override evadible) | ALTO | Guard anti-carrera `atomic_guards` dentro del batch: recomputa límite vs CxC COMMITTED (patrón stock); ok=0 → CHECK aborta todo |
| B2 | Webhook de pago ack-eado sin settle: 200 `ok:true` sin estado materializado (webhook antes del capture) o con dedup DB caída → cobro perdido | ALTO | Capture inexistente → **202 `CAPTURE_NOT_MATERIALIZED`** sin dedup (el proveedor reintenta); dedup DB caída → **503**; settle antes del dedup; estado terminal → dedup-ack |
| B3 | Idempotencia store-credit ADJUST: `sourceRef` con `nowMs` → retry = doble débito | ALTO | `sourceRef` determinista por `idempotencyKey` + preflight `ALREADY_ADJUSTED` + guardState `NOT EXISTS(source_ref)` en el batch + catch de carrera → idempotente |
| B4 | Doble-drain fiscal: dos drains concurrentes envían el mismo XML; `ACCEPTED` incondicional | ALTO | **Claim atómico por fila** (`UPDATE ... SET status='PROCESSING' WHERE id IN (SELECT ... LIMIT ?)`); PROCESSING huérfanas (crash) se reclaman tras 10 min (`next_attempt_at`); `ACCEPTED`/`REJECTED`/`QUARANTINED` condicionados a `EXISTS(fiscal_outbox.status='PROCESSING')` |
| B5 | JWKS siempre `return null` (feature SEC-01 rota: todos 401 si se configura) | MEDIO | Implementada verificación RS256/ES256 vía JWKS (Web Crypto, caché 5 min por isolate, fail-closed si el fetch falla, kid + single-key fallback, `kty`/`alg` validados, HS denegado) |
| B6 | Fecha fiscal del reloj del cliente: timestamp naive sin zona parseado como UTC → 5 h de desvío (día fiscal equivocado o SKEW_VIOLATION) | MEDIO | Normalización **Lima UTC-5** para naive, componente por componente (independiente de la TZ del host); el instante de emisión offline se conserva (edge D rollups) |
| B7 | Telemetría breaker: `flushCoalesce` forzado en cada fallo destruye la ventana → incremento por fallo + re-invocación (doble conteo) | BAJO | `reportInfraFailure` envía al DO **solo cuando la ventana cierra** (delta real de `coalesceInfraFailure`) |
| B8 | KV del breaker fail-open: cualquier valor inesperado (`true`, `OPEN`, corrupto) = cerrado | BAJO | Whitelist estricta: `'0'` = closed; **todo lo demás = OPEN** (fail-closed) |

## Resultado local exacto

| Suite/check | Resultado observado |
|---|---|
| Domain sales | 241 tests GREEN (B6 incluido) |
| Domain customers | 14 tests GREEN (100% cobertura, regresión) |
| Adapters D1 unit | 293 tests GREEN (B1 guard + B3 store-credit) |
| Adapters D1 workerd | 210 tests GREEN (incluye edge D rollups restaurado) |
| Worker API | 670 tests GREEN (B2 webhook + B5 JWKS + store-credit routes) |
| Worker fiscal | 13 tests GREEN (B4 drain + B7/B8 breakers) |
| POS web unit | 163 tests GREEN (regresión) |
| `scripts/verify.sh` | `RESULT SUITE GREEN` (V-00..V-24) |
| `scripts/quality.sh` | lint 23/23, typecheck 23/23, format GREEN, unit 38/38, integration 35/35, chaos PASS, build, bundle CAL-06 |

## Trazabilidad de tests

- B1: `packages/adapters-d1/src/process-offline-sale-atomic.integration.test.ts` → "race de cupo de crédito: dos ventas concurrentes nunca exceden el límite (B1)".
- B2: `apps/worker-api/src/payments/payment-routes.test.ts` → "B2: webhook antes del capture..." y "B2: falla de la DB de dedup...".
- B3: `packages/adapters-d1/src/process-store-credit.integration.test.ts` → retry `ALREADY_ADJUSTED` + race con una sola tx.
- B4: `apps/worker-fiscal/src/fiscal-drain.test.ts` → "B4: dos drains concurrentes nunca envían el mismo XML (claim atómico)".
- B5: `apps/worker-api/src/auth/verify-jwt.test.ts` → RS256 válido, firma inválida, JWKS inalcanzable, kid desconocido (fail-closed).
- B6: `packages/domain-sales/src/offline-sale.test.ts` → naive = Lima UTC-5, determinista.
- B7/B8: `apps/worker-fiscal/src/breaker.test.ts` → 1 delta por ventana; KV whitelist estricta.

## Security Review

- B1: el límite de crédito ya no depende solo del preflight: el guard SQL es la barrera
  atómica (mismo patrón que stock). Sin guard no había doble gasto?→ con guard, imposible.
- B2: cero acuse sin efecto; el proveedor reintenta; dedup y settle idempotentes.
- B5: JWKS fail-closed (fetch caído o kid desconocido → 401), HS denegado con JWKS,
  `kty`/`alg` validados contra el header, sin interpolación de texto del LLM (N/A).
- B8: KV corrupto → breaker OPEN (nunca acceso por omisión).

Esta revisión no equivale a pentest.

## RACI real

| Rol | Estado |
|---|---|
| Staff Backend ACID (owner) | B1, B2, B3 GREEN local |
| Staff Fiscal | B4, B6 GREEN local |
| Staff Security | B5 GREEN local |
| Staff SRE | B7, B8 GREEN local |
| Staff QA independiente | PENDIENTE (chaos y staging real) |
| Staff PM A | PENDIENTE |
| Staff Principal V | Revisión de los 8 fixes: 0 hallazgos medium+ |

## Veredicto

**SOFTWARE-GREEN.** Los 8 bugs del harness quedan corregidos con RED→GREEN verificado y
sin regresiones (unit 38/38, integración 35/35, E2E 28/28 del cierre 47 preservado).
Producción/piloto siguen NO-GO hasta staging Cloudflare real, chaos en entorno
reproducible y firmas A/V independientes (Proceso §8.1).
