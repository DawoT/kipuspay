---
doc_id: ops-s33-quotes-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 33 — Cotizaciones / presupuestos — Quality Gate

**Estado:** GOV-APROBADO (firma A+V)  
**Capabilities:** `sales.quotes`  
**Spec:** Arquitectura §5.3 regla 18 · COM-05 · ADR-0017 · GTM-19 · Roadmap FASE 6C

## Evidencia

| Check | Resultado |
|---|---|
| ADR-0017 (COM-05 snapshot, 0 reserva, 0 CPE, DAT-12 microunits) | GREEN |
| Regla 18 + fence DDL DAT-12 / INTEGER microunits | GREEN |
| Mig 0026 `quotes` / `quote_items` + down + V-14 burn-down | GREEN |
| Dominio quotes + messaging `sendQuote` / `kipus_quote_v1` | GREEN |
| ACID create/send/approve/convert/cancel (convert sin skipStock) | GREEN |
| Flags default off + caja/Owner expired | GREEN |
| Audit `QUOTE_*` hash encadenado | GREEN |
| Chaos `quote-convert-expire` 500 | GREEN |
| GTM-19 + FAQ/marketing/playbook | GREEN |
| `scripts/verify.sh` | SUITE GREEN |
| `scripts/quality.sh` | Quality Gate OK |

## Evidencia RED→GREEN

- RED dominio: `quotes.ts` inexistente.
- GREEN dominio: máquina + COM-05 + expire 422.
- RED migración: `0026_sprint33_quotes.sql` inexistente.
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

- Devolución a proveedor → Sprint 34 (cerrado: `docs/ops/s34-supplier-returns-qg.md`).
- Store credit / cuotas / comisiones → Sprints 35–37.
- Email SMTP (stubs S24) fuera de alcance.
