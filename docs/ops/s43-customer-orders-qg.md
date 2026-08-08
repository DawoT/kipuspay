---
doc_id: ops-s43-customer-orders-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 43 — Pedidos de cliente con retiro — Quality Gate

**Estado software:** GREEN local  
**Estado claim/producción/piloto:** NO-GO condicionado  
**Capability:** `orders.customer_orders`, default-off  
**Spec:** Arquitectura §5.10 regla 28 · ADR-0027 · COM-05 · COM-09 · DAT-12 · SYN-12 · Roadmap FASE 6E

El gate automatizado demuestra el contrato de software en entorno local. No existe
evidencia de staging ni entrega externa de WhatsApp, y Web Push permanece en Sprint
45. Tampoco existen firmas humanas independientes de Staff QA y Staff PM como A+V.
Por ello este documento no autoriza activación en producción, piloto de entrega ni el
claim GTM-24.

## Evidencia RED→GREEN

| Hito | Run ID | Commit completo | Evidencia |
|---|---|---|---|
| RED contractual | `run-red-s43-customer-orders-7487298` | `748729800881accfdbe02b76673bf5217225fb23` | Contratos de dominio, DDL 0036, ACID/workerd, Worker, POS/offline y chaos definidos; fallaban por ausencia explícita de implementación productiva |
| GREEN + hardening | `run-green-s43-security-quality-1957d05` | `1957d05a8c1bf42c0cc5be91119b22cc8592d1d6` | Implementación, E2E local y remediación de tres hallazgos MEDIUM con tests negativos |

Ancestría verificada:
`748729800881accfdbe02b76673bf5217225fb23` →
`1957d05a8c1bf42c0cc5be91119b22cc8592d1d6` → `HEAD`.

**Expected failure RED:** no existían migración/down 0036, dominio, plan ACID D1,
rutas, UI, cola offline ni chaos productivos que resolvieran reservas conservativas,
fulfillment idempotente, expiración/aviso y aislamiento de tenant/sucursal/terminal.

## Resultado local exacto

| Suite/check | Resultado observado |
|---|---|
| Worker API | 565 tests |
| Adapters D1 | 261 unit + 176 workerd integration |
| POS web | 127 tests |
| Chaos harness | 95 tests |
| Domain sales | 201 tests; 99.86% líneas / 96.30% ramas |
| Chaos de pedidos | 500 ciclos locales balanceados, PASS |
| Benchmark específico | p95 1.55 ms; máximo 3.99 ms; ambos < 50 ms |
| Playwright con `/usr/bin/google-chrome` | 5/5 passed |
| POS bundle | 129.5 kB gzip, dentro del presupuesto |
| `scripts/quality.sh` | `Quality Gate OK` en rerun |

La primera ejecución de `scripts/quality.sh` encontró un timeout en un test de reportes
no relacionado. El retry enfocado pasó y el rerun completo terminó `Quality Gate OK`;
no se presenta el timeout inicial como defecto de pedidos ni se oculta la repetición.
Toda esta evidencia es local; no equivale a staging o entrega externa.

La ejecución de quality también actualizó
`docs/ops/bench-sub50ms-sprint14.md`: es el microbenchmark general CPU-only de Sprint
14 (200 iteraciones, p95 0.0017 ms, máximo 0.0278 ms), no el benchmark específico de
pedidos indicado arriba. Se conserva como salida generada y no se usa para afirmar
latencia de red o staging.

## Cobertura contractual

| Contrato | Evidencia local |
|---|---|
| DDL 0036 / DAT-12 | Tablas de pedidos, ítems, fulfillments y avisos con tenant obligatorio, FKs compuestas e índices; down protegido aborta si existen datos |
| ACID D1 | Crear, fulfill, cancel y expire usan guard/versionado e idempotencia en `db.batch`; una carrera tiene un único ganador |
| Conservación | `requested = fulfilled + released + reserved`; no hay segundo descuento al cumplir ni doble liberación al cerrar |
| Dimensiones de stock | Agregado de sucursal y producto/lote/ubicación/serie/UOM se reservan, cumplen o liberan de forma consistente |
| Precio y pago | Crear genera cero venta, pago o CPE; snapshot vigente gana; pedido expirado exige nueva venta a pricing actual y autorización acotada |
| Offline | Lease server-minted, firmado, one-shot y acotado a tenant/pedido/ítem/sucursal/terminal/TTL; F5/replay es idempotente y conflicto expirado no crea venta |
| Aviso y expiración | Intención `EXPIRY_WARNING` durable antes del release; fallo de transporte queda observable y nunca bloquea caja |
| Disponibilidad POS | Checkout ordinario y offline no requieren pedido y permanecen disponibles ante fallo de reserva, lease o aviso |
| RBAC y aislamiento | Tenant desde auth; lectura y mutación cross-tenant/cross-branch opacas; owner solo lectura; caja exige terminal con sesión activa |

Tests de trazabilidad que resuelven en el monorepo:

- `packages/domain-sales/src/customer-orders.red.test.ts` y
  `packages/domain-sales/src/customer-orders.test.ts`.
- `packages/adapters-d1/src/customer-orders-schema.test.ts`,
  `packages/adapters-d1/src/customer-orders-schema.integration.test.ts` y
  `packages/adapters-d1/src/customer-orders-workerd.red.integration.test.ts`.
- `apps/worker-api/src/orders/customer-order-routes.red.test.ts` y
  `apps/worker-api/src/orders/customer-order-residuals.test.ts`.
- `apps/pos-web/src/lib/customer-orders/customer-order-page.red.test.ts`,
  `apps/pos-web/src/lib/offline-sync/customer-order-fulfillment.red.test.ts` y
  `apps/pos-web/tests/e2e/customer-orders.spec.ts`.
- `packages/chaos-harness/src/customer-orders.red.test.ts`.

## Playwright local — 5/5

El rerun autenticado usó `/usr/bin/google-chrome` y verificó:

1. cajero autenticado crea una reserva sin pago;
2. fulfillment parcial sobrevive offline, F5 y replay;
3. lease expirado produce conflicto recuperable y ninguna venta;
4. owner puede leer la cola y no ve controles operativos de caja;
5. superficie de 375 px conserva controles etiquetados de 44 px.

Esto verifica navegador local con fixtures; no sustituye QA humana ni staging.

## Chaos y rendimiento local

Los 500 ciclos balancean carreras fulfill-cancel-expire, parciales, fallos de
dimensiones, drift y autorización, aviso duplicado/fallido, replay offline y
disponibilidad de caja. Resultado: un único ganador idempotente, cero doble venta,
doble liberación, pérdida de conservación, fork de auditoría o bloqueo de checkout.
El benchmark específico observó p95 1.55 ms y máximo 3.99 ms, bajo el presupuesto
local de 50 ms; no incluye latencia de red ni constituye SLO de producción.

## Security Review y remediación

Una Security Review encontró **3 MEDIUM**:

1. lectura de pedidos cross-branch;
2. supervisor podía cancelar/expirar cross-branch;
3. terminal spoofed podía operar sin sesión activa.

`1957d05a8c1bf42c0cc5be91119b22cc8592d1d6` remedia los tres hallazgos con límites de
sucursal y sesión de terminal activos, más tests negativos. No se ejecutó una segunda
Security Review limpia. La evidencia afirma remediación implementada y suites GREEN,
no una certificación de seguridad independiente posterior.

## Limitaciones externas y condición de cierre

| Evidencia requerida | Estado | Condición de cierre |
|---|---|---|
| Staging real | PENDIENTE / NO-GO | Ejecutar creación, parciales, carreras, expiry y rollback con telemetría reproducible |
| Entrega externa WhatsApp | PENDIENTE / NO-GO | Piloto con opt-in, timeout/retry/escalado, dedup y evidencia de no bloqueo de caja |
| Web Push | FUERA DE S43 | Pertenece a Sprint 45; Sprint 43 no promete entrega push |
| QA humana | PENDIENTE / NO-GO | Staff QA valida flujo autenticado, offline/F5, conflictos, accesibilidad y regresión de caja |
| Aprobación PM | PENDIENTE / NO-GO | Staff PM acepta alcance, copy y residuales del piloto |
| Firma A+V independiente | PENDIENTE / NO-GO | Responsables humanos identificados firman evidencia de staging/piloto |

## RACI real

| Rol | Quién | Estado |
|---|---|---|
| R | Staff Frontend + Staff Backend ACID | Software local GREEN |
| Security | Staff Security Review | 3 MEDIUM remediados; segunda revisión limpia no realizada |
| A | Staff PM | PENDIENTE para claim, piloto y producción |
| V | Staff QA independiente | PENDIENTE; no existe evidencia humana independiente |
| Operación | Staff SRE | Runbook definido; staging/dispatcher externo pendiente |
| Claim | Staff Growth + Staff PM | NO-GO |

## Veredicto

**SOFTWARE-GREEN-CLAIM-NO-GO.** El software, suites, E2E y gate automatizado quedan
GREEN local. La capability permanece default-off. GTM-24, producción y rollout están
condicionados a QA humana, aprobación PM, firmas A+V y piloto externo de entrega. No
se promete WhatsApp ni push: WhatsApp carece de evidencia externa y push permanece
en Sprint 45.
