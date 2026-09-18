---
doc_id: roadmap-fase-6h
alias: Roadmap
authority: normativa
owner: "@DawoT"
fase: "6H"
sprints: "54–59"
---

### FASE 6H — Remediación y Sello QA (KipusPay v8.1, sprints 54–59)

> Auditoría funcional en navegador y sello QA. Detalle operativo en `docs/ops/browser-functional-audit.md`. **Capabilities, no forks** (ADR-ARCH-002).

> **Quality Gate referencia:** `Proceso §3 DoD` + `§8.1 RACI` — ver `docs/PROCESS.md` Anexo A (R/A/V) y `§4` Matriz. `SUITE GREEN` necesario pero no suficiente; requiere firma `A+V` independiente (sin `V` = `NO-GO`).

#### Sprint 54–59 — Remediación y Sello QA
**Referencia:** `docs/ops/browser-functional-audit.md` · **Agentes:** Staff Frontend + Staff QA/Chaos + Staff SRE (R), Staff Principal (A), Staff QA/Chaos + Staff Security (V)

**Criterios:** `docs/ops/browser-functional-audit.md` + `docs/ops/6h-remediation-qg.md` — 0 `switch(vertical)`, bundle y jerga validados, `SUITE GREEN` + evidencia browser.

**Quality Gate:** Staff Principal (A) + Staff QA/Chaos + Staff Security (V) — ver `docs/ops/6h-remediation-qg.md`.

#### Subtrack Grifos — capabilities `fuel.dispatch` / `fuel.island_shift`

La vertical Grifos se registra como bundle comercial de capabilities, no como
`vertical === 'grifos'`. El catálogo, precios, tasas fiscales, stock y volumen
son autoritativos del servidor; el POS solo calcula previews sobre un snapshot
validado. `fuel.dispatch` cubre despacho idempotente/offline reconciliable,
descuento de stock y vínculo ACID con venta/caja. `fuel.island_shift` cubre el
reporte reproducible por isla/manguera enlazado al handoff y arqueo ciego.

**Gate específico:** pruebas de idempotencia, no doble descuento, política
fiscal configurable, cambio de precio, factura empresarial, conciliación de
volumen/medidor y reporte de turno; sin claim comercial hasta evidencia de
staging y piloto operativo.
