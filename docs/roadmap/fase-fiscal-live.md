---
doc_id: roadmap-fase-fiscal-live
alias: Roadmap
authority: normativa
owner: "@DawoT"
fase: "FL"
sprints: "FL-0–FL-5"
---

### FASE FL — Facturador Live (staff)

No reabre Sprints 5 / 5b / 26 (Entrega Cerrado). Ejecuta el loop CPE con
transporte honesto y CDR; GRE/02/20 después. Flags `FEATURE_FISCAL_*=1`
**nunca en git**. e-beta ≠ GTM-08. Contingencia prohibida. Default de producto
`KIPUSPAY_PSE` (ADR-FISCAL-001 / 007 / 008). QG: [`docs/ops/fl-fiscal-live-qg.md`](../ops/fl-fiscal-live-qg.md).

#### Sprint FL-0 — Fail-closed del loop
**Entrega:** Software GREEN local (staff; sin secretos de A)
**Referencia:** Arquitectura §5.2 · ADR-FISCAL-008 · **Agentes:** Staff Fiscal

**Entregables:** plugins on sin SOL ni endpoint → `MISCONFIGURED` / 503, nunca
`ACCEPTED`; HTTP 2xx sin `accepted===true`+`cdrCode` → `unreachable`; `.invalid`
no es canal acreditado; drain CPE exige `ds:Signature` en canal live; RC no
re-lista boletas `ACCEPTED`; Dueño/ticket no dicen “aceptada” sin CDR.

**Criterios:** 0 camino producción/staging-plugins que escriba `ACCEPTED` desde
mock; 0 `sunat_status=ACCEPTED` sin CDR parseado en tests de drain live.

**Quality Gate:** `docs/ops/fl-fiscal-live-qg.md` FL-0. No cierra `go-live-sunat`.

#### Sprint FL-1 — Piloto TENANT_CERT e-beta (mapea S11+S12)
**Entrega:** WAIT A (pass CDT en sesión; SOL Secrets Store; flags runtime)
**Referencia:** Arquitectura §5.2 · ADR-FISCAL-006/007 · runbook
[`docs/runbooks/sunat-cdt-rosa-negra-staff.md`](../runbooks/sunat-cdt-rosa-negra-staff.md)

Pass software: UI `.p12` existe; cron `*/5` worker-fiscal existe; flags git 0.
Pass live: `01` nuevo e-beta `ACCEPTED` tras upload dueño (hash R2 ≠ sign-only);
un CPE sale por drain Cloudflare. **No** descongela GTM-08.

#### Sprint FL-2 — Canal producto PSE acreditado (mapea S13)
**Entrega:** WAIT A (URL HTTPS ≠ `.invalid` + contrato JSON + cert plataforma)
**Referencia:** Arquitectura §5.2 · ADR-FISCAL-002

Tenant `KIPUSPAY_PSE` **sin** SOL. `createHttpPseTransport` contra URL real;
CDR `accepted===true`. Sin URL de A este sprint permanece WAIT (no mock GREEN).

#### Sprint FL-3 — NC/ND + RC en canal acreditado (mapea S15)
**Entrega:** WAIT canal FL-2 o e-factura autorizada; builders UBL GREEN
**Referencia:** Arquitectura §5.2 · §8 · ADR-FISCAL-003

Pass: `07`/`08` + RC/baja E-C con CDR accepted fuera de e-beta.
`FEATURE_SALES_DEBIT_NOTE` runtime on, git 0.

#### Sprint FL-4 — Pack GTM-08 y T6 opt-in (mapea S16+S14)
**Entrega:** WAIT firmas A+V
**Referencia:** GTM-08 · [`docs/ops/claims-go-live.md`](../ops/claims-go-live.md) ·
ADR-FISCAL-007

Staff **no** pone `go-live-sunat: CERRADO` ni descongela GTM §4.1.1 sin A+V.
T6 `e-factura.sunat.gob.pe` solo con autorización escrita; default de librería
sigue e-beta. No es requisito si FL-2 ya cumple el pass GTM-08.

#### Sprint FL-5 — Emisión de no-pago (después del CPE)
**Entrega:** Software GREEN local; claims Cadena/Enterprise WAIT
**Referencia:** Arquitectura §5.2b · §5.2c · ADR-FISCAL-004 · ADR-FISCAL-005

UBL GRE `31` + percepción `02` / retención `20` + `fiscal_non_sale_outbox` +
drain + CDR. 0 stock en GRE. Flags `FEATURE_GRE` /
`FEATURE_FISCAL_WITHHOLDINGS` git 0. Detracción bancaria: NO-GO hasta staging
banco; no fingir CDR.
