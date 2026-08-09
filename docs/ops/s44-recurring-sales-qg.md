---
doc_id: ops-s44-recurring-sales-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 44 — Ventas recurrentes y membresías — Quality Gate

**Estado software:** GREEN local  
**Estado claim/producción/rollout:** NO-GO condicionado  
**Capability:** `sales.recurring`, default-off  
**Spec:** Arquitectura §5.11 regla 29 · ADR-0028 · COM-10 · DAT-12 · SYN-12 · Roadmap FASE 6E

El gate automatizado demuestra el contrato de software en entorno local. No existe
evidencia de cron, staging o canary Cloudflare real ni QA humana y aprobación PM con
firmas A+V independientes. Por ello este documento no autoriza GTM-25 ni producción.
Sprint 44 no guarda tarjetas, no autocobra y no garantiza servicio recurrente después
de la gracia.

## Evidencia RED→GREEN

| Hito | Run ID | Commit completo | Evidencia |
|---|---|---|---|
| RED contractual | `run-red-s44-recurring-sales-edd2a3a` | `edd2a3a5e24134c936a43a98251d29d9b75a2996` | Contratos de dominio, DDL 0037, settlement/workerd, Worker, POS y chaos fallaban por ausencia de implementación productiva |
| GREEN + hardening | `run-green-s44-security-quality-991ba97` | `991ba979af68d2b97dd32186b2e5c0a27e44943d` | Implementación completa local, corrección de cron y remediación de dos hallazgos MEDIUM con tests negativos |

Ancestría verificada:
`edd2a3a5e24134c936a43a98251d29d9b75a2996` →
`991ba979af68d2b97dd32186b2e5c0a27e44943d` → `HEAD`.
Los commits concurrentes `d84bb5476a013694d8227550eadebe7faf217e4f` y
`c6f9255933bc8afa5c090013ba04f1e4fb2742a8` entre RED y GREEN son auditorías ajenas
a la implementación de Sprint 44; no invalidan la ancestría ni se atribuyen al sprint.

**Expected failure RED:** faltaban migración/down 0037, dominio calendario y
FIXED/CURRENT, settlement atómico, scheduler/lease, rutas/RPC privado, Admin, E2E y
chaos que resolvieran ocurrencias idempotentes sin bloquear el POS.

## Resultado local exacto

| Suite/check | Resultado observado |
|---|---|
| Worker API | 586 tests |
| Adapters D1 | 271 unit + 194 workerd integration |
| POS web | 135 tests |
| Chaos harness | 99 tests |
| Domain regression | 234 tests |
| Dominio recurring puro | 32 tests; 100% líneas / 95.87% ramas |
| Chaos recurrente | 500 ciclos locales deterministas y balanceados, PASS |
| Playwright recurrente con Chrome del sistema | 5/5 passed |
| Playwright completo | 11/16; 5 fallos legacy no relacionados |
| POS bundle | 136.67 kB gzip, dentro del presupuesto |
| `scripts/quality.sh` | exit 0; `Quality Gate OK` |

Los cinco fallos del E2E completo son locators legacy de home, checkout y etiquetas de
precio; no pertenecen a ventas recurrentes. Se divulgan como regresión pendiente:
este documento no afirma que el E2E completo esté GREEN.

La ejecución de quality actualizó
`docs/ops/bench-sub50ms-sprint14.md`: es evidencia generada del microbenchmark local
CPU-only general, no latencia D1, Worker, cron o red. Se conserva el diff y no se usa
como SLO de producción.

## Cobertura contractual

| Contrato | Evidencia local |
|---|---|
| DDL 0037 / DAT-12 | Cinco tablas con tenant obligatorio y FKs compuestas; down aborta con datos; registry KPBK1 y epochs incluidos |
| Calendario Lima | Períodos semiabiertos, ancla mensual 28/29/30/31 y último día, límites civil→UTC, catch-up ordenado y acotado |
| FIXED/CURRENT | FIXED conserva snapshot versionado; CURRENT resuelve catálogo servidor por ocurrencia; cliente no aporta dinero |
| Atomicidad | Un `db.batch` indivisible crea venta, CPE/NV, una CxC, usage, stock físico, ocurrencia, next-run y auditoría |
| Stock | Servicios no mutan stock; insuficiencia física deja cero efectos parciales y período reintentable |
| Lease/idempotencia | CAS, TTL y scope tenant+plan+versión; takeover solo al expirar; unicidad período evita dobles |
| Gracia | Mora no bloquea checkout; política post-gracia solo pausa futuras ejecuciones del plan |
| Prorrateo | Half-up entero por días civiles; cancelación inmediata crea NC/NV_RETURN idempotente sin mutar origen |
| Control privado | Scheduler vía cron y soporte por Worker RPC privado; ruta pública de soporte responde 404 |
| Cron coexistente | `0 8 * * *` mantiene rollup diario y `*/5 * * * *` ejecuta recurrentes; dispatch exacto sin solapamiento |
| Disponibilidad POS | Fallos de plan, lease, fiscalidad, stock, CxC o usage no interceptan venta ordinaria/offline |

Tests de trazabilidad que resuelven en el monorepo:

- `packages/domain-sales/src/recurring-sales.red.test.ts` y
  `packages/domain-sales/src/recurring-sales.test.ts`.
- `packages/adapters-d1/src/recurring-sales-schema.test.ts`,
  `packages/adapters-d1/src/recurring-sales-schema.integration.test.ts`,
  `packages/adapters-d1/src/recurring-sales.red.test.ts`,
  `packages/adapters-d1/src/recurring-sales-workerd.red.integration.test.ts` y
  `packages/adapters-d1/src/recurring-sales-scheduler.integration.test.ts`.
- `apps/worker-api/src/sales/recurring-sales-routes.red.test.ts`,
  `apps/worker-api/src/sales/recurring-sales-manual-rpc.test.ts` y
  `apps/worker-api/src/worker-scheduled.test.ts`.
- `apps/pos-web/src/lib/recurring-sales/recurring-sales-client.red.test.ts`,
  `apps/pos-web/src/lib/recurring-sales/recurring-sales-admin.red.test.ts` y
  `apps/pos-web/tests/e2e/recurring-sales.spec.ts`.
- `packages/chaos-harness/src/recurring-sales.red.test.ts`.

## Playwright local

La suite recurrente 5/5 con Chrome del sistema verificó:

1. Admin crea FIXED sin autoridad de tenant, dinero ni pago;
2. CURRENT muestra calendario y precio servidor;
3. pausa/reanudación usa versión optimista;
4. cancelación inmediata exige preview servidor y confirmación para NC;
5. cajero falla cerrado y los controles Admin a 375 px conservan accesibilidad.

Esto verifica navegador local con fixtures; no sustituye QA humana ni staging. El
resultado completo 11/16 conserva cinco fallos legacy ya descritos.

## Chaos local

Los 500 ciclos deterministas balancean cron duplicado, timeout de shard, drift de
precio/stock, retry fuera de orden, cancel-vs-run, pause-vs-run, pago tardío, CDR
demorado, fallo de statement y límite de catch-up. Resultado: cero ocurrencias, ventas,
documentos, CxC o usage duplicados; cero períodos omitidos, commits/stock parciales,
inputs monetarios no autorizados, mutaciones de origen, devoluciones prorrateadas
duplicadas, bloqueos de checkout o forks de auditoría.

## Security Review y remediación

Una Security Review encontró **2 MEDIUM**:

1. un token acotado a un plan podía terminar ejecutando otro plan vencido;
2. existía una ruta pública de soporte operable solo con token.

`991ba979af68d2b97dd32186b2e5c0a27e44943d` remedia ambos: filtro exacto de plan sin
fallback y control manual exclusivamente por Worker RPC privado. Tests negativos
verifican `NOT_FOUND`/`NOT_DUE`, acciones separadas, límite wildcard explícito,
one-shot idempotente y 404 en la ruta pública. No se ejecutó una segunda Security
Review limpia; se afirma remediación implementada y suites GREEN, no certificación
independiente posterior.

## Regresión de cron corregida

Durante GREEN se detectó que agregar recurrentes podía reemplazar el trigger de
rollups. El fix conserva ambas expresiones y despacha por coincidencia exacta, incluso
cuando coinciden a las 08:00 UTC. Cron desconocido falla seguro sin invocar handlers.
La prueba es local; todavía no existe ejecución programada Cloudflare real.

## Evidencia externa pendiente

| Evidencia requerida | Estado | Condición de cierre |
|---|---|---|
| Cron Cloudflare real | PENDIENTE / NO-GO | Observar ambos triggers, lease, retry, catch-up y dispatch exacto con telemetría |
| Staging/canary | PENDIENTE / NO-GO | Ejecutar concurrencia, fiscal/CxC/usage/stock, rollback y runbook en bindings reales |
| QA humana | PENDIENTE / NO-GO | Staff QA valida Admin, calendario, gracia, prorrateo, accesibilidad y POS ordinario |
| Aprobación PM | PENDIENTE / NO-GO | Staff PM acepta alcance, copy acotado y residuales E2E |
| Firma A+V independiente | PENDIENTE / NO-GO | Humanos independientes firman evidencia de staging/canary |
| Security Review posterior | NO REALIZADA | Revisión limpia posterior a remediaciones; no sustituye A+V |

## RACI real

| Rol | Estado |
|---|---|
| Staff Backend ACID + Staff Data + Staff Frontend | Software local GREEN |
| Staff Security Review | 2 MEDIUM remediados; segunda revisión limpia no realizada |
| Staff SRE | Runbook y dispatch local definidos; cron/staging/canary real pendiente |
| Staff QA independiente | PENDIENTE |
| Staff PM A | PENDIENTE |
| Staff Growth + Staff PM | GTM-25 NO-GO |

## Veredicto

**SOFTWARE-GREEN-CLAIM-NO-GO.** El software y gate automatizado quedan GREEN local;
la capability permanece default-off. GTM-25, producción y rollout siguen NO-GO hasta
cron/staging/canary Cloudflare real, QA humana, aprobación PM y firmas A+V
independientes. No se promete autocobro, tarjeta/token guardado, push ni servicio
recurrente ininterrumpido después de la gracia; push permanece en Sprint 45.
