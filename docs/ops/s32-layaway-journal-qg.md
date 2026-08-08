---
doc_id: ops-s32-layaway-journal-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 32 — Apartados y diario contable — Quality Gate

**Estado:** GOV-APROBADO (firma A+V)  
**Capabilities:** `sales.layaway`, `ledger.chart_of_accounts`  
**Spec:** Arquitectura §5.3 regla 17 · ADR-0016 · GTM-14 · GTM-17 (slice apartados) · Roadmap FASE 6B

## Evidencia

| Check | Resultado |
|---|---|
| ADR-0016 (fiscal sin CPE, reserva microunits, GL S23+2101, journal SoT) | GREEN |
| Regla 17 + fence DDL DAT-12 / INTEGER microunits | GREEN |
| Mig 0025 `sale_deposits*` + `chart_of_accounts` + `journal_*` + seed | GREEN |
| Dominio layaway + journal + arqueo `SALE_REFUND`/`LAYAWAY_*` | GREEN |
| ACID create/deposit/convert/cancel + posting hot paths | GREEN |
| Export flag-off derivado; flag-on `journal_lines` ≡ S23 C4 | GREEN |
| Flags default off + caja/Owner/Admin GET-only diario | GREEN |
| Audit `LAYAWAY_CANCEL` / `JOURNAL_POST` | GREEN |
| Chaos `layaway-convert-cancel` + `journal-balance-export` 500 | GREEN |
| GTM-14 + GTM-17 apartados + FAQ/marketing/playbook | GREEN |
| `scripts/verify.sh` | SUITE GREEN |
| `scripts/quality.sh` | Quality Gate OK |

## Evidencia RED→GREEN

- RED dominio: `layaway.ts` / `journal.ts` inexistentes; arqueo no conocía `SALE_REFUND`.
- GREEN dominio: layaway + journal + blind-z.
- RED migración: `0025_sprint32_layaway_journal.sql` inexistente.
- GREEN migración/schema integration.
- RED ACID/API: orquestadores y flags ausentes.
- GREEN ACID/API/UI + chaos 500/0.

## RACI

| Rol | Quién | Firma |
|---|---|---|
| R | Staff Backend ACID + Frontend + Data | OK |
| A | Staff Principal | OK |
| V | Staff QA + Staff PM + Staff Growth | OK |

## Residuales

- Cotizaciones → Sprint 33 (cerrado: `docs/ops/s33-quotes-qg.md`).
- Store credit / cuotas / comisiones → Sprints 35–37.
- Ubicaciones / series / balanza / etiquetas → Sprints 38–42.
