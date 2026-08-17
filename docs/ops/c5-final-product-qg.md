---
doc_id: ops-c5-final-product-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint C5 — Cierre interno del software (no liberatorio)

**Estado:** CERRADO con **calificación** (ledger 0439; CORRIGE en 0441) · go-live externo
**AGENDADO_AL_FINAL** (`pending-batches.yaml` bloque `go-live-*`)

## Alcance

El catálogo contractual de `legal_and_sales_guide.md` queda **implementado en
software local** (suites internas). Eso **no** es go-live de producción ni sello
liberatorio “producto completo v1.0” frente a claims externos.

Los claims se alinearon al producto final (Sprint C1). Capabilities congeladas
pendientes se implementaron en código: KDS/comandas/salón/split (C2) y LPDP ARCO
self-serve del titular (C3). DR/BCP tiene contrato y suites de restore/failover
locales (C4); el ensayo Workflow/R2/`DR_SIMULATION` en Cloudflare staging sigue
abierto. El staging externo (Cloudflare real, sandbox SUNAT, Android físico,
FCM/VAPID, impresoras) cierra los gates de producción NO-GO y permanece agendado.

## Evidencia del cierre interno (Sprint C5) — conteos del repo

| Suite | Resultado (conteo en árbol / claim honesto) |
|---|---|
| e2e pos-web | **120** `test(` bajo `apps/pos-web/tests/e2e` (incl. KDS/salón/LPDP; mayormente mocks de contrato) |
| e2e marketing-web | **15** `test(` bajo `apps/marketing-web/tests/e2e` |
| unit / integration / chaos | Ver evidencia de CI/local del sprint; no re-afirmar totales históricos sin re-corrida citada |
| Bench Sub-50ms | Microbench CPU de dominio (no Edge/D1 end-to-end) |
| verify.sh | Condición necesaria documental (V-00..V-30) |

> CORRIGE 0439: los totales “121/121” y “19/19” no coincidían con el árbol; se
> sustituyen por conteos verificables arriba.

## Claims descongelados durante el cierre (software local)

- FEFO/lotes y merma entre locales (GTM-16/GTM-13): live en guía, pricing y
  `PUBLIC_CLAIMS`.
- Comandas/KDS + salón + split: UI sobre motor existente (replay kds-pending,
  split con correlativo, catálogo, mappers F-5).
- LPDP ARCO self-serve del titular (GTM-09): verify + token `lpdp_titular` +
  export/consents/erase (confirmación UI); endurecimiento anti-abuso en 0441+.
- DR/BCP (GTM-18): suites locales; staging Workflow pendiente.

## Go-live externo (agendado al final)

| Bloque | Requiere | Gate |
|---|---|---|
| `go-live-staging` | Cloudflare real (R2/Workflow/Secrets/KMS, cron/canary) | s41–s49 |
| `go-live-sunat` | Certificación SUNAT/OSE real | GTM-08 |
| `go-live-hardware` | Android físico gama baja + impresoras | GTM-26, S41 |
| `go-live-fcm` | Web Push VAPID + FCM HTTP v1 staging | GTM-26 |

Matriz: `docs/ops/claims-go-live.md`.

## Cierre

El tracker `docs/ops/pending-batches.yaml` marca A–J y C1–C5 como CERRADO en
software; el bloque `go-live-*` permanece **AGENDADO_AL_FINAL**. No usar este
documento como evidencia de aceptación en producción.
