---
doc_id: adr-fiscal-002-transport-breaker
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-FISCAL-002 — FiscalTransport + circuit breaker (Sprint 26)

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-07 |
| Decisores | Staff Fiscal, Staff SRE, Staff Principal |
| Consultados | Staff Backend ACID, Staff Security |
| Informados | Escuadrón |
| Relaciona | Arquitectura §8.1 · §5.2 · Roadmap Sprint 26 · ADR-FISCAL-001 · Ledger Sprint 26 |

## Contexto

ADR-FISCAL-001 cerró plazos, RC, guards RUC/700 y NC+CDR. El canal de envío
XML y la resiliencia bajo colapso SUNAT quedaban solo en prosa §8.1 sin archivo
ADR. Sprint 26 exige materializar la decisión (ADR-first) y el Quality Gate.

## Decisión

1. **No reabre** ADR-FISCAL-001 (plazos, RC, 700/RUC, NC+CDR, E-A).
2. Puerto `FiscalTransport` agnóstico: default **`KIPUSPAY_PSE_DIRECT`**; plugins
   `ose_*` / `pse_third_party` requieren suite de contrato GREEN antes de enable.
3. **R-01:** el transporte consume solo `CPEInvoiceDTO` / `CPESummaryDTO` — prohibido
   importar entidades retail.
4. Circuit breaker en **Durable Object** por `(transport, endpoint)` (`submit` /
   `cdr_query` / `rc_submit`); estados `closed → open → half-open` con `alarm()`.
5. Lectura: isolate (TTL 5–10s) → KV (~60s); **DO nunca en hot-path de lectura**.
6. Incrementos coalescidos (~5s / decimación) + jitter; 5xx/timeout abren breaker;
   4xx negocio → `QUARANTINED` sin abrir; deadline → `DEADLINE_EXCEEDED`.
7. XML en **R2**; D1 guarda puntero + `must_submit_by`; cola = `{ saleId, r2Key }`.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Breaker global único | Un endpoint sano no debe cerrar por otro enfermo |
| Contador en KV | Race y no serializa; DO es autoritativo |
| DO en hot-path read (como PERF-04 auth) | Thundering herd bajo colapso SUNAT |
| OSE third-party como default | Producto default = PSE KipusPay directo |

## Consecuencias

- **Gana:** canal pluginizable; anti thundering herd; FIFO por deadline.
- **Paga:** worker-fiscal gana DO/KV/R2/D1; flags default off.
- **Activación:** `FEATURE_FISCAL_CIRCUIT_BREAKER` / `FEATURE_FISCAL_TRANSPORT_PLUGINS`.
- **Claim PSE:** sigue runbook staging; no descongelar GTM sin A+V.

## Checklist Quality Gate Sprint 26

| # | Criterio | Evidencia |
|---|---|---|
| 1 | ADR-FISCAL-002 archivo | este doc |
| 2 | 10×5xx abren / 10×4xx no | chaos + unit |
| 3 | DO ≤10 lecturas/s ventana 60s | chaos shard-do-failure |
| 4 | FIFO `must_submit_by` + R2 | drain tests |
| 5 | E-A 100 ciclos + `CREDIT_NOTE_NO_CDR` | owner + chaos |
| 6 | verify/quality GREEN | scripts |
