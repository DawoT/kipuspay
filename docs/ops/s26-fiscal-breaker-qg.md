---
doc_id: ops-s26-fiscal-breaker-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 26 — Fiscal breaker + FiscalTransport — Quality Gate

**Estado:** GOV-APROBADO (firma A+V)  
**Capabilities:** `fiscal.transport_plugins`, `fiscal.circuit_breaker`  
**Spec:** Arquitectura §8.1; ADR-FISCAL-002; Roadmap FASE 8

## Evidencia

| Check | Resultado |
|---|---|
| ADR-FISCAL-002 en disco + registry §8.1 | GREEN |
| Taxonomía 10×5xx abren / 10×4xx no | GREEN — domain FSM + chaos |
| DO ≤10 lecturas/s ventana 60s (hot-path sin DO) | GREEN — shard-do-failure |
| FIFO `must_submit_by` + R2 pointer mig 0019 | GREEN — drain + schema |
| E-A 100 ciclos + confirmación | GREEN — owner-ea |
| Flags default off | GREEN |
| `scripts/verify.sh` | SUITE GREEN |
| `scripts/quality.sh` | Quality Gate OK |

## Auditoría FASE 8 — hallazgos cerrados (Ledger 0377/0379)

| Hallazgo | Fix | Evidencia |
|---|---|---|
| S26-H1 | **Caída total de SUNAT sin cobertura**: solo breaker parcial existía; nuevo chaos de `drainFiscalOutbox` — transporte rechazando 100% → 0 XML marcados `SENT` (fail-closed), todo queda retryable, y post-recovery el MISMO XML se reenvía y se acepta (0 pérdida) | `fiscal-drain.test.ts` 5/5 (RED→GREEN) |
| S26-H1 | **Verificado (sin cambio)**: CDR como única confirmación (`cdrVerdict`), breaker stale→fail-closed, half-open con probe, poison→quarantine, claim atómico B4; el enqueue de `fiscal_outbox` vive dentro del batch atómico de la venta (la venta nunca se cae por fiscal, invariante 7/8) | `worker-fiscal` 19/19 |

## RACI

| Rol | Quién | Firma |
|---|---|---|
| R | Fiscal + SRE + Backend ACID | OK |
| A | Staff Principal | OK |
| V | Fiscal + SRE + QA/Chaos | OK |

## Residuales

- Credenciales SUNAT staging reales → runbook PSE
- Cupo/Stripe → **Cerrado Sprint 27** (`docs/ops/s27-usage-overage-qg.md`)
- Emparejamiento OSE producción tras suite contrato + flag
