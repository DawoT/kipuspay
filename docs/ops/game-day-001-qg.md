---
doc_id: ops-game-day-001-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Game Day 001 — Núcleo transaccional bajo caos + integridad de auditoría en vivo

**Estado software:** GREEN local + staging (solo lectura)
**Estado producción:** sin cambios; nada tocó producción ni e-beta SUNAT
**Capability:** transversal (motor ACID + auditoría)
**Spec:** Arquitectura §6 · §13.5 · Proceso §4 (fila Motor transaccional ACID) · §6

Primer game day formal del escuadrón: adversidad REAL contra el motor
`processOfflineSaleAtomic` (D1 real vía vitest-pool-workers) y caminata DAG de
`audit_events` EN VIVO contra la D1 `kipuspay-staging`
(`f23d7b8b-be71-483b-9489-2c7c4ebd73df`). Principio 2 aplicado: asserts duros,
cero maquillaje.

## Veredicto por escenario

| Escenario | Veredicto | Números clave |
|---|---|---|
| E1 — Concurrencia ventas offline | **PASS** | 8/8 SUCCESS; correlativos 1..8 únicos contiguos; totales 1180 ¢ exactos ×8; 0 escrituras parciales en sales/sale_items/sale_payments/stock/serie/guards |
| E2 — Fallo inyectado a mitad de operación | **PASS** | Wrapper lanza tras el 4º statement de un plan de 15 → error explícito, 0 filas residuales, stock/serie/auditoría intactos. CHECK violado a mitad del plan (16 statements) → rollback total verificado en 5 tablas + contadores |
| E3 — Integridad auditoría EN VIVO (staging) | **PASS** | phase0_001: 40 filas, 40/40 alcanzables desde génesis, 0 huérfanos, 1 fork histórico documentado, cabeza == rowid máx. rosa_negra_001: 6 filas, 6/6 alcanzables, 0 huérfanos, 0 forks, cabeza == rowid máx |

## E1 — Concurrencia de ventas offline (N=8)

**Cobertura preexistente citada** (`process-offline-sale-atomic.integration.test.ts`,
chaos concurrent-writers): ráfaga N=5 mismo SKU (stock coherente), sobre-demanda sin
stock negativo, doble-sync concurrente 1×SUCCESS+4×ALREADY_SYNCED. **Gap detectado:**
ningún escenario cubría correlativos únicos/sin saltos bajo ráfaga, totales exactos por
venta ni barrido completo de escrituras parciales → escenario nuevo RED→GREEN:

- Detectores/jueces: `chaos-harness/src/offline-sale-concurrency.ts` (puerto inyectado,
  el harness no depende de adapters-d1 — mismo estilo que sprint4-acid/audit-chain-fork).
- Contrato RED de detectores: `offline-sale-concurrency.test.ts` — cada juez FALLA por
  la aserción esperada ante fixture corrupto (silencio, duplicado, salto, total
  inexacto, items/pagos parciales, venta fantasma, serie desincronizada, guards
  residuales; aborto con filas residuales/correlativo consumido/auditoría mutada).
  Convención idéntica a `customer-orders.red.test.ts`: el motor ya es correcto, el RED
  demuestra que los detectores detectan (12/12 GREEN).
- Evidencia D1 real: `adapters-d1/src/offline-sale-game-day.integration.test.ts`.

Comando y salida (recortada):

```text
pnpm -F @kipuspay/adapters-d1 test:integration -- src/offline-sale-game-day.integration.test.ts
STATS_GD1_E1 {"judgement":{"verdict":"PASS","successes":8,"rejections":0,"failures":[]},
 "numbers":[1,2,3,4,5,6,7,8]}   # sales.number ORDER BY number
Test Files 1 passed (1) — Tests 3 passed (3)
```

Asserts duros ejecutados post-ráfaga: `COUNT(sales)=8`; `sale_items=8`;
`sale_payments=8`; `branch_product_stock.stock 10→2`; `branch_document_series
.current_number 0→8`; `atomic_guards=0` (auto-delete del batch); jamás silencio
(REJECTED exige `explicitError` no vacío — 0 casos).

## E2 — Fallo inyectado a mitad de operación

**Patrón preexistente citado:** `t-acid-midroll` ("fallo inyectado A MITAD del batch
revierte todo", misma suite Sprint 4) — valida venta/pagos/stock vía statement que
viola CHECK dentro del plan. Este game day lo formaliza y extiende:

- **(a) Wrapper del puerto D1** (`D1DatabaseLike` con `batch()` instrumentado): cuenta
  los statements del plan y lanza tras observar el k-ésimo (k=4, plan real=15) SIN
  ejecutar nada — fallo de transporte a mitad del envío. Nota honesta: con D1 atómico,
  "ejecutar parcialmente" NO es un modo de fallo real sino un artefacto del harness;
  la interrupción fiel es pre-commit. Salida: `Error:
  CHAOS_MIDBATCH_ABORT_AFTER_STATEMENT_4`; 0 filas de `off-gd-abort` en sales/
  sale_items/sale_payments; `audit_events` sin delta; stock 10 intacto; serie 0;
  guards 0.
- **(b) Abort server-side a mitad del plan**: statement intermedio con
  `document_type='XX'` viola CHECK → `D1_ERROR: ... SQLITE_CONSTRAINT_CHECK`;
  barrido completo extendido vs midroll original: + sale_items, + correlativo de serie
  sin consumir, + audit_events sin delta, + guards sin residuo. Tamaño real del plan
  observado por wrapper passthrough: 16 statements, k=15.

```text
STATS_GD1_E2A {"statementsInPlan":15,"observedError":"Error: CHAOS_MIDBATCH_ABORT_AFTER_STATEMENT_4"}
STATS_GD1_E2B {"statementsInPlan":16,"observedError":"Error: D1_ERROR: CHECK constraint failed:
 document_type IN ('NV','NV_RETURN','01','03','07','08','12'): SQLITE_CONSTRAINT ..."}
judgeOfflineSaleMidBatchAbort → PASS en ambos
```

## E3 — Integridad de auditoría EN VIVO (kipuspay-staging)

Solo lectura (SELECT). SQL cruda y resultados adjuntos en
`docs/ops/game-day-001-evidence/` (`e3-sql-queries.sql`, `e3-audit-events.raw.json`,
`e3-dag-walk.json`). Caminata DAG reimplementada como script efímero usando como
referencia la lógica de `verifyRestoreAuditChain` (adapters-d1 data-backup):
alcanzabilidad desde génesis (prev_hash NULL), conteo de forks, huérfanos, cabeza.

| Tenant | Filas | Alcanzables génesis | Forks | Huérfanos | Cabeza == rowid máx |
|---|---|---|---|---|---|
| tenant_stg_phase0_001 | 40 | 40/40 | **1** (esperado ≥1 histórico) | 0 | SÍ (`20e11242…`) |
| tenant_stg_rosa_negra_001 | 6 | 6/6 | 0 | 0 | SÍ (`d4ce2f75…`) |

Fork histórico caracterizado: `prev_hash 5154ce0a…` (rowid 21,
DR_SIMULATION_STARTED 2026-08-22 22:30:06) tiene DOS hijos — rowid 22
(DR_SIMULATION_FAILED, mismo segundo) y rowid 23 (BACKUP_REQUESTED siguiente, 22:32:33).
Dos escritores leyeron la cabeza antes de insertar: la carrera read-then-insert legacy
que el M1 anti-fork (CAS `audit_chain_heads` en el mismo batch, LEDGER anti-fork
estructural) eliminó estructuralmente. La fila permanece inmutable como evidencia
append-only; cero forks nuevos posteriores al fix.

Hallazgos de integridad: 0 ids duplicados, 0 row_hash no-hex, 0 filas desconectadas,
génesis único por tenant, `audit_chain_heads` consistente en ambos tenants.

## Calidad final

| Suite/check | Resultado |
|---|---|
| chaos-harness unit | 26 archivos / 132 tests (120 base + 12 nuevos) |
| adapters-d1 unit | 56 / 442 |
| adapters-d1 integration (D1 real) | 41 / 308 (incluye 3 nuevos Game Day) |
| worker-api | 107 / 1356 |
| eslint --max-warnings 0 + tsc (ambos packages) | limpio |
| prettier --check | limpio |
| `scripts/verify.sh` | RESULT SUITE GREEN |

## Hallazgos accionables

Ningún escenario abrió gap nuevo de producto (los tres PASS con asserts duros); no se
modifica `docs/ops/pending-batches.yaml`. Observaciones registradas:

1. El ángulo concurrente con correlativos/totales ahora es escenario permanente en el
   harness (detectores versionados) — queda disponible para nightly chaos runs.
2. La inyección server-side (CHECK) solo puede ubicarse donde el plan lo permite
   (bloque de escrituras); la posición no altera la semántica de rollback de un batch
   D1 (atómico completo). La variante transporte (E2a, k=4/15) cubre la interrupción
   temprana. Limitación documentada, no defecto.

## Desviaciones

- Sin commits (guardrail del game day): los SHAs de ancestría quedan pendientes del
  commit que integre este pack; run IDs = etiquetas de ejecución local con salida
  íntegra citada arriba.
- E1 usa stock 10 > N para aislar el ángulo correlativos/totales; el ángulo de
  contención de stock ya estaba cubierto por la cobertura citada (5 escritores,
  sobre-demanda).
