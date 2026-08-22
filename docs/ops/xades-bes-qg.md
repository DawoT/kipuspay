---
doc_id: ops-xades-bes-qg
alias: "—"
authority: derivada
owner: "@DawoT"
---

# XAdES-BES (FIS-T2) — Quality Gate local

**Estado software:** GREEN local (tests de dominio + producer + wrapDek + RC XAdES)  
**Estado homologación / GTM-08 / producción SUNAT:** NO-GO (T6 `e-factura`).
Matriz **beta** Rosa Negra: `01` F001-8 y **F001-12** (2026-08-21, sign-only
SOAP e-beta, CDR `accepted` / `cdrCode` 0), `08` FD01-1, `07` FC01-1,
**FC01-11** (anula F001-9) y **FC01-13** (anula F001-12) ACCEPTED e-beta
(`cdrCode` 0). UBL NC: `CustomizationID` 2.0, `cbc:Description` en
DiscrepancyResponse, sin `PaymentTerms` Contado (3246), montos unsigned (2999).
Correlativos quemados no reutilizados: FC01-3..10 y FC01-12 (HTTP 401).
RC-20260821-002 (boleta B001-1). Loop POS Worker-firma (S1–S4): wrapDek KMS +
produceMissing F001-9, caja F001-11, ND FD01-3, NC FC01-2, boleta B001-2 via
RC-20260821-003 COMPLEMENTARY. **S11 WAIT:** CDR e-beta de un `01` *después* de
upload UI (sin scripts staff) exige pass CDT en sesión. F001-12 / FC01-11/13 no
descongelan GTM-08 ni cierran `go-live-sunat`. `sign-only-cpe.mjs` /
`send-beta-cpe.mjs` quedan break-glass. FASE FL-1 S12 WAIT flags runtime.  
**Capability:** firma Edge `TENANT_CERT` (ADR-FISCAL-006); default producto
`KIPUSPAY_PSE` intacto  
**Spec:** Arquitectura §5.2 · §5.4 · ADR-FISCAL-006

El gate demuestra XML con `ds:Signature` verificable con WebCrypto (digest C14N
1.0). No afirma CDR, no descongela GTM-08 y no autoriza `FEATURE_FISCAL_*=1` en
el repo.

Staging sign-only (FIS-T3): objeto R2
`fiscal-xml/tenant_stg_rosa_negra_001/sale_stg_rn_signonly_001.xml` con XAdES.
Outbox puede quedar PENDING. **No** es evidencia de CDR.

## Evidencia RED→GREEN

| Hito | Run ID | Evidencia |
|---|---|---|
| RED | `run-red-xades-bes` | `assertSignedCpeXml` rechaza UBL sin `ds:Signature` |
| GREEN | `run-green-xades-bes` | factura/NC/ND firmadas; producer `TENANT_CERT` fail-closed |

## Resultado local

Ver `pnpm --filter @kipuspay/domain-fiscal-pe test` y
`pnpm --filter @kipuspay/adapters-d1 test:unit` (tenant-certificates + producer).

## No cubierto (T4–T6)

URL homologación / producción SUNAT, credenciales SOL prod, series autorizadas en
SOL prod, CDR `accepted===true` en **producción**. La matriz beta (e-beta) no cierra
el tracker `go-live-sunat`. S8 (PSE HTTP) y S9 (T6 e-factura) están WAIT hasta
URL/autorización de A. Staff no pone `go-live-sunat: CERRADO` sin `firmas_av`.
