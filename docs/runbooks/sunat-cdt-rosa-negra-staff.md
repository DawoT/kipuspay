---
doc_id: runbook-sunat-cdt-rosa-negra-staff
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Runbook — CDT Rosa Negra (staff, staging)

| Campo | Valor |
|---|---|
| Severidad tipica | SEV-2 (piloto interno) |
| Owner on-call | Staff Fiscal + Staff Security |
| Ultima ensayada | 2026-08-21 (S11–S16 WAIT documentado; e-beta software GREEN; GTM-08 abierto) |
| Relaciona | Arquitectura §5.2 · §5.4 · ADR-FISCAL-006 · ADR-FISCAL-007 · docs/ops/xades-bes-qg.md |

## Sintomas

Piloto interno del RUC `20612913251` (ROSA NEGRA DIGITAL SOLUCIONES S.A.C.):
falta tenant distinto de `tenant_stg_phase0_001`, falta fila
`tenant_certificates`, o el producer deja XML sin `ds:Signature`.

## Impacto

No hay emisión legal. Default de producto `KIPUSPAY_PSE` no cambia. GTM-08
sigue congelado (`go-live-sunat` estado `AGENDADO_AL_FINAL`, `firmas_av` vacías).
Software+beta (SOAP e-beta, XAdES Worker) es GREEN; no equivale a GTM-08.

## Diagnóstico rápido (<5 min)

1. D1: `SELECT id, ruc, formalization_mode, pse_mode FROM tenants WHERE id = 'tenant_stg_rosa_negra_001'`.
2. Confirmar `ELECTRONIC_ISSUER` + `TENANT_CERT` (no `INTERNAL_CONTROL`).
3. `SELECT alias, private_key_kms_ref, fingerprint_sha256 FROM tenant_certificates WHERE tenant_id = 'tenant_stg_rosa_negra_001'` — la privada no debe aparecer.
4. R2 `fiscal-xml/{tenant}/{sale}.xml` contiene `ds:Signature`. Matriz beta
   (no reenviar): F001-8/10/11, FD01-1/2/3, FC01-1/2, B001-1/2, RC-002/003.

PIN de caja del fixture: `246810` (no es la pass del CDT). `FEATURE_AUTH_CASHIER_LOGIN`
puede estar off; JWT staff con `AUTH_JWT_HS_SECRET`.

## Mitigación

1. Seed: `scripts/staff/seed-rosa-negra-staging.sql` (wrangler D1 + TENANT_KV).
2. **Camino dueño (S7):** Configuración POS → Certificado digital → `.p12`/`.pfx`
   + pass one-shot. El Worker parsea PKCS#12 (sin npm en el cliente), wrapDek
   `backupId=tenant-cert:SUNAT`, JWT owner/admin. Nunca `x-platform-staff-token`.
3. **Break-glass staff:** `scripts/staff/extract-cdt-p12.sh` +
   `scripts/staff/wrap-tenant-cert.mjs` (`PLATFORM_STAFF_TOKEN`).
   `sign-only-cpe.mjs` queda break-glass.
4. S6: ligar boletas ACCEPTED huérfanas con
   `scripts/staff/link-accepted-boletas-to-rc.sql`. El complementary RC no
   re-lista `sunat_status=ACCEPTED` con `daily_summary_id` NULL.
5. Homologación beta (ADR-FISCAL-007): secretos SOL + flags runtime (nunca
   `FEATURE_*=1` en git). Canal default e-beta. **No** cerrar `go-live-sunat`
   ni GTM-08. Rollback: `FEATURE_FISCAL_CPE=0`.

## S8 / S9 / S11–S16 (WAIT hasta A)

- **S11 UI .p12 live:** software listo. Falta pass CDT en sesión + `01` nuevo
  e-beta ACCEPTED tras upload (hash R2 ≠ sign-only). No brute-force.
- **S12 drain:** software acepta `FEATURE_FISCAL_CPE` (git `0`). Runtime A+V.
- **S13 PSE HTTP:** hace falta URL de homologación/sandbox ≠ `.invalid` y cert
  de **plataforma** distinto del CDT Rosa Negra. Sin eso el gap queda WAIT.
  Un tenant `KIPUSPAY_PSE` no debe llevar SOL del piloto (SOL fuerza SOAP).
- **S14 T6:** hace falta autorización escrita a `e-factura.sunat.gob.pe`, SOL
  prod y correlativos **nuevos**. Override `SUNAT_BILL_ENDPOINT_URL` solamente.
  El default de código no es e-factura.
- **S15 NC/ND:** CDR en canal acreditado (S13 o S14 GO). e-beta no basta.
- **S16 pack GTM-08:** staff no pone `go-live-sunat: CERRADO` ni descongela copy
  GTM sin A+V. `firmas_av` vacías está bien.

## Rollback

No commitear `FEATURE_*=1`. No reutilizar este CDT como cert de plataforma PSE.
Borrar el secret `TENANT_CERT_ENVELOPE` y dejar `sunat_certificate_status`
en `PENDING_UPLOAD` si hay compromiso.
