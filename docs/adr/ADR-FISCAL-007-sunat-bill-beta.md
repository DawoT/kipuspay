---
doc_id: adr-fiscal-007-sunat-bill-beta
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-FISCAL-007 — billService SOAP SUNAT beta (`TENANT_CERT`)

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-21 |
| Decisores | Staff Principal, Staff Fiscal |
| Consultados | Staff SRE, Staff Security |
| Informados | Escuadrón |
| Relaciona | Arquitectura §5.2 · §8.1 · ADR-FISCAL-002 · ADR-FISCAL-006 |

## Contexto

ADR-FISCAL-002 define `FiscalTransport` con default `KIPUSPAY_PSE_DIRECT`
(POST HTTP JSON). Ese endpoint de producto no existe aún
(`FISCAL_PSE_ENDPOINT_URL` staging = `.invalid`). El piloto Rosa Negra
(`pse_mode=TENANT_CERT`, RUC `20612913251`) homologa contra SUNAT **beta**
directo (`billService`), no contra un PSE de terceros. Sin SOAP `sendBill` /
`sendSummary` no hay CDR.

## Decisión

1. Nuevo modo `sunat_bill_beta`: ZIP STORE del UBL + SOAP 1.1 UsernameToken
   (`SUNAT_SOL_USER` / `SUNAT_SOL_PASSWORD` solo Secrets Store).
2. `01`/`07`/`08` → `sendBill`; boleta `03` → Resumen Diario `sendSummary`
   (nunca XML unitario al OSE). CDR = ZIP `applicationResponse` /
   `getStatus`; `accepted` solo con `ResponseCode` 0.
3. 5xx/timeout/red → `unreachable` (breaker). SOAP Fault de negocio →
   `rejected` (cuarentena, sin abrir breaker). Nunca afirmar aceptación
   sin CDR.
4. Con plugins + SOL, **no** se usa el POST JSON de
   `FISCAL_PSE_ENDPOINT_URL`. Default de producto sigue `KIPUSPAY_PSE`.
5. URL de código: `https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService`.
   Producción `e-factura.sunat.gob.pe` **no** es default de librería ni de
   `selectFiscalTransport`. T6 es **opt-in de A**: solo override runtime
   `SUNAT_BILL_ENDPOINT_URL` + SOL de producción en Secrets Store, correlativos
   nuevos, RUC emisor de producción confirmado. Sin autorización escrita el
   sprint S9 queda WAIT (nunca GREEN mentido). Rollback: `FEATURE_FISCAL_CPE=0`.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Reusar POST JSON PSE | No hay API; URL `.invalid` |
| npm SOAP/SDK SUNAT | Worker Edge; invariante 10 / CAL-06 |
| Activar `e-factura` ahora | T6; A no autorizó producción; S9 WAIT |

## Consecuencias

- **Gana:** canal homologable TENANT_CERT sin PSE de terceros ni dominio propio.
- **Paga:** secretos SOL runtime; flags `FEATURE_FISCAL_*` siguen 0 en git;
  T6 no se habilita sin override explícito de A.
- **Invariantes:** 7 (venta no se cae; outbox reintenta), 8 (CDR), SEC-03 (SOL
  nunca en D1/git).
