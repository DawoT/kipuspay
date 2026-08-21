---
doc_id: adr-fiscal-006-xades-bes-edge
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-FISCAL-006 — XAdES-BES en el Edge (WebCrypto)

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-20 |
| Decisores | Staff Principal, Staff Fiscal, Staff Security |
| Consultados | Staff Backend ACID, Staff SRE |
| Informados | Staff Verifier |
| Relaciona | Arquitectura §5.2 · §5.4 · ADR-FISCAL-001 · Ledger 0454 |

## Contexto

El pipeline C6 persistía UBL con `hashUblXml` (SHA-256) y no insertaba
`ds:Signature`. Homologación SUNAT / `pse_mode=TENANT_CERT` exige XAdES-BES
antes del PUT a R2. El default de producto sigue `KIPUSPAY_PSE`
(ADR-FISCAL-001); este canal es el del contribuyente con CDT propio.

## Decisión

El Worker firma CPE unitarios (`01`/`07`/`08`) con XAdES-BES (C14N, RSA-SHA256,
`ext:UBLExtensions`) usando WebCrypto y código vendorizado en
`@kipuspay/domain-fiscal-pe`. `sunat_xml_hash` es el SHA-256 del XML **firmado**.
La privada vive en Secrets Store + wrap KMS (`private_key_kms_ref`); jamás en
D1/KV/R2/git. Sin material, `TENANT_CERT` no produce XML (`MISSING_SIGNER`).

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| npm xml-crypto / xadesjs en el Worker | Viola invariante 10 y CAL-06 |
| Firma en el POS | La UI no es autoridad; zero-dep cliente |
| Hash SHA-256 como “firma” | No es XMLDSig; SUNAT lo rechaza |

## Consecuencias

- **Gana:** CPE TENANT_CERT firmados verificables localmente; PSE default intacto.
- **Paga:** homologación/producción siguen exigiendo URL + CDR + A+V (no este ADR).
- **Invariantes:** 8 (no afirmar CDR), 10 (Edge firma), SEC-03 (kms_ref).
