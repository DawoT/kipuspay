---
doc_id: adr-fiscal-001-v2
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-FISCAL-001 v2 — PSE KipusPay, guards y exclusiones (Sprint 5)


| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-04 |
| Decisores | Staff Fiscal, Staff Security, Staff Principal |
| Consultados | Staff SRE, Staff Backend ACID |
| Informados | Escuadrón |
| Relaciona | Arquitectura §5.1 · §5.2 · §8 · Roadmap Sprint 5 · GTM §3.3.1 |

## Contexto

Sprint 5 exige motor fiscal dual (NV + CPE) con decisiones cerradas antes del código.
La doctrina canónica vive en Arquitectura §5.1; este ADR materializa el archivo
exigido por DoD/kipus-task (ADR-first) y el Quality Gate del roadmap.

## Decisión

1. `INTERNAL_CONTROL` = solo NV (`sunat_status = NOT_APPLICABLE`).
2. `FORMALIZING` / `ELECTRONIC_ISSUER` = **PSE KipusPay** por defecto (`pse_mode = KIPUSPAY_PSE`); cert propio del tenant es opción avanzada.
3. Boletas → Resumen Diario (Sprint **5b**); Facturas → envío unitario XML (Sprint 5).
4. Plazos: factura **3 días calendario**; RC boletas **7 días** (5b); alertas T-24h (5b).
5. Guards: boleta ≥ S/ 700 ⇒ identificación; factura ⇒ RUC; NC/ND ⇒ origen `ACCEPTED` (salvo E-A).
6. Constantes legales (única fuente): `DOC_TOTAL_THRESHOLD_FOR_ID = 70000` cents; `NRUS_UNITARY_OMISSION_CENTS = 500`.
7. Series CPE por **branch**; correlativo autoritativo en servidor (`db.batch`).
8. GRE, percepciones, retenciones, detracciones = fuera de MVP v8.0.
9. Prohibido llamar “contingencia SUNAT” a la falta de `.pfx` (AGENTS invariante 8).

Claim comercial PSE permanece **congelado** hasta checklist SRE (secretos + CDR staging).

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Contingencia preimpresa como atajo | Viola invariante 8 / SUNAT |
| OSE third-party como default | Producto default = PSE KipusPay |
| Re-numerar NV históricas a boleta | Prohibido §5.1 |

## Consecuencias

- **Gana:** matriz régimen×modo verificable; cero copy de contingencia.
- **Paga:** RC/cron/alertas plazos diferidos a Sprint 5b.
- **Activación:** `FEATURE_FISCAL_CPE` (default `0`); package `@kipuspay/domain-fiscal-pe`.
- **Hot-path:** cobro NV permanece Sub-50ms; XML/firma CPE es post-cobro / worker (justificado: no bloquea caja).

## Checklist Quality Gate Sprint 5

| # | Criterio | Evidencia | Fiscal | Security | Principal | SRE |
|---|---|---|---|---|---|---|
| 1 | ADR-FISCAL-001 v2 archivo | este doc | Pendiente V | Pendiente V | Pendiente V | — |
| 2 | Guards RUC / ≥700 | domain-fiscal-pe tests | Pendiente V | Pendiente V | — | — |
| 3 | XML factura válido | fixtures UBL | Pendiente V | — | — | — |
| 4 | 0 NV a SUNAT | tests + outbox | Pendiente V | — | — | — |
| 5 | CDR staging + runbook PSE | runbook | — | — | — | Pendiente V |
| 6 | NC E-A/E-B | integration | Pendiente V | — | — | — |
| 7 | verify + quality GREEN | scripts | — | — | Pendiente V | — |

**Veredicto QG:** `EN REVISION` hasta firma `A` + `V` humana independiente (Proceso §8.1).
