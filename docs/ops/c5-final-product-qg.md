---
doc_id: ops-c5-final-product-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint C5 — Sello final del producto completo v1.0 (cierre del proyecto)

**Estado:** CERRADO (ledger 0439) · go-live externo AGENDADO_AL_FINAL (`pending-batches.yaml` bloque `go-live-*`)

## Alcance

El producto final v1.0 (catálogo contractual de `legal_and_sales_guide.md`) queda
implementado internamente con software GREEN local. Los claims se alinearon al
producto final (Sprint C1) y las capabilities congeladas pendientes se
implementaron y sellaron reales: KDS/comandas/salón/split (C2) y LPDP ARCO
self-serve del titular (C3); DR/BCP ensayado (C4). El staging externo
(Cloudflare real, sandbox SUNAT, Android físico, FCM/VAPID, impresoras) cierra
los gates de producción NO-GO y queda agendado como fase final.

## Evidencia del sello final (Sprint C5)

| Suite | Resultado |
|---|---|
| e2e pos-web | **121/121** (incluye KDS/salón/split, LPDP titular, todos los sellos A–J) |
| e2e marketing-web | **19/19** |
| unit pos-web | 395/395 |
| unit worker-api | 1175/1175 |
| unit worker-fiscal | 22/22 |
| unit worker-kms | 28/28 |
| unit adapters-d1 | 390/390 |
| integration adapters-d1 | 294/294 (incluye dr-restore 6/6, paridad de stock, crédito tienda, CxC) |
| chaos-harness | 120/120 (incluye dr-failover 5/5 con 500 ciclos) |
| Bench Sub-50ms | GREEN (p95 0.0039 ms vs presupuesto 50 ms) |
| quality.sh | OK |
| verify.sh | SUITE GREEN (V-00..V-30) |

## Claims descongelados durante el cierre

- FEFO/lotes y merma entre locales (GTM-16/GTM-13): live en guía, pricing y
  `PUBLIC_CLAIMS`.
- Comandas/KDS + salón + split (claim de verticales): UI completa sobre el
  motor existente (replay kds-pending, split con correlativo secuencial,
  catálogo real, mappers F-5).
- LPDP ARCO self-serve del titular (GTM-09): verify por datos + token de
  titular (scope `lpdp_titular`) + export/consents/erase con doble confirmación.
- DR/BCP (GTM-18): contrato ensayado (restore→RPO/RTO→replay→`DR_SIMULATION`).

## Go-live externo (agendado al final)

| Bloque | Requiere | Gate |
|---|---|---|
| `go-live-staging` | Cloudflare real (R2/Workflow/Secrets/KMS, cron/canary) | s41–s49 |
| `go-live-sunat` | Certificación SUNAT/OSE real (pipeline GREEN local, batch I) | GTM-08 |
| `go-live-hardware` | Android físico gama baja + impresoras/perfiles | GTM-26, S41 |
| `go-live-fcm` | Web Push VAPID + FCM HTTP v1 staging real | GTM-26 |

Matriz completa: `docs/ops/claims-go-live.md`.

## Cierre

El tracker `docs/ops/pending-batches.yaml` queda COMPLETADO: batches A–J
(ledgers 0419–0434) y sprints de cierre C1–C5 (ledgers 0435–0439); el bloque
`go-live-*` permanece AGENDADO_AL_FINAL.
