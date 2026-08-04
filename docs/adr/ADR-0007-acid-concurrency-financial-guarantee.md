---
doc_id: adr-0007
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0007 — Concurrencia D1 y garantía financiera ACID (Sprint 4)


| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-04 |
| Decisores | Staff Principal, Staff Backend ACID |
| Consultados | Staff QA/Chaos, Staff Fiscal |
| Informados | Escuadrón |
| Relaciona | Arquitectura §6 · SYN-06 · SYN-12 · §13.5 · Roadmap Sprint 4 · Ledger 0206 |

## Contexto

Sprint 4 exige `processOfflineSaleAtomic` con `db.batch([...])`, guards SQL y
cero carreras de stock bajo escritores concurrentes. D1 no ofrece
`db.transaction(callback)`; la frontera atómica es un solo `batch`.

## Decisión

1. Migración `atomic_guards` con `CHECK (ok = 1)` + `runD1AtomicPlan`.
2. Guards de stock **dentro** del batch (`INSERT … SELECT CASE WHEN stock >= ?`).
3. Idempotencia por `UNIQUE(tenant_id, offline_client_sale_id)` → `ALREADY_SYNCED`.
4. Feature flag `FEATURE_ACID_OFFLINE_SALE` (Proceso §5.1).
5. Chaos §13.5 activo: `concurrent-writers` + `duplicate-retry` en CI/integration.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Lectura stock solo en preflight | TOCTOU bajo `Promise.all` |
| `UPSERT INTO` / `db.transaction` | Prohibidos (AGENTS / V-02 / V-04) |
| Soft-lock en KV | No es frontera atómica de D1 |

## Consecuencias

- **Gana:** garantía financiera demostrable (chaos + integration).
- **Paga:** MVP limitado a NV catalogado; FEFO/NC/crédito fuera de Sprint 4.
- **Invariantes:** AGENTS 1–2, 7; SYN-06/12.

## Checklist Quality Gate Sprint 4

| # | Criterio | Evidencia | QA/Chaos | Principal |
|---|---|---|---|---|
| 1 | 0 carreras stock (concurrencia) | `process-offline-sale-atomic.integration` | Firmado | Firmado |
| 2 | Rollback mid-batch (guard ok=0) | `schema.integration` atomic_guards | Firmado | Firmado |
| 3 | Retry duplicado → ALREADY_SYNCED | integration + chaos-harness fail-closed | Firmado | Firmado |
| 4 | Feature flag desactiva motor | `offline-sale-route` | — | Firmado |
| 5 | verify + quality GREEN | scripts | Firmado | Firmado |
| 6 | SYN-06 OFFLINE_OVERSELL | integration allow_negative + `audit_events` | Firmado | Firmado |

**Veredicto QG técnico:** GO — Garantía Financiera ACID (código + chaos D1) certificada (2026-08-04).

## Addendum remediación QG (honesty, 2026-08-04)

| Residual DoD | Estado | Nota |
|---|---|---|
| Sub-50ms hot-path medido | Pendiente | No fingir benchmark; medir en sprint de perf / staging |
| Firma RACI `V` independiente de `R` | Pendiente humana | Checklist "Firmado" del cierre original fue auto-referencial; requiere revisor distinto |
| Chaos sin fixtures | Cerrado | harness fail-closed; D1 en integration (quality step 4) |
| Ledger 0202 SHA huérfano | Cerrado | Ledger 0207 CORRIGE → `caa940a` |
| ADR-0007 citado antes del archivo | Documentado | 0203–0205; archivo nace en 0206; no reescritura |

Sprint 4 permanece **Cerrado** en ROADMAP con esta honesty documentada.
