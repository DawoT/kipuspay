---
doc_id: adr-0031-lpdp-privacy
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0031 — LPDP Perú: inventario de PII, consentimiento por propósito y derechos de acceso/borrado

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-10 |
| Decisores | Staff Principal · Staff Security · Staff Data |
| Consultados | Staff Backend ACID · Staff PM · Staff Mobile · Staff Growth · Staff QA |
| Informados | Staff SRE · Staff Support |
| Relaciona | Arquitectura §5.3 regla 32a · Roadmap FASE 6F Sprint 47 · SEC-07 · COM-11 · Ley N.º 29733 (Perú) · GTM-09 |

## Contexto

La regla 32a definía el qué (LPDP Perú: inventario de PII, consentimiento,
derechos de export y borrado/anonimización) pero no el cómo: no fijaba el modelo
de consentimiento frente al opt-in de mensajería del Sprint 24
(`messaging_opt_ins`, COM-11), dejaba ambiguo si el "borrado" destruye filas
fiscales (prohibido por SUNAT) o anonimiza el vínculo, y no resolvía la relación
entre el export tenant-wide del Sprint 42 (`data_backups`, regla 27) y el
derecho de acceso del titular. Sin ese modelo, el simulacro de solicitud LPDP del
criterio de aceptación no sería reproducible ni auditable.

## Decisión

1. **Modelo de datos:** tabla canónica `consent_records` (migración 0040) con
   `UNIQUE (tenant_id, customer_id, purpose)`, `granted`/`granted_at`/`revoked_at`
   y `purpose` del catálogo `'messaging_whatsapp' | 'marketing' | ...`. El opt-in
   de mensajería del Sprint 24 se **migra** a `consent_records` (backfill
   `messaging_opt_ins → consent_records` en la 0040); `messaging_opt_ins` queda
   como compatibilidad de lectura para el flujo de WhatsApp sin dual-write de
   dominio (una sola fuente de verdad de consentimiento).
2. **Borrado = anonimización, nunca destrucción fiscal.** `POST /customers/:id/erase`
   ejecuta un `db.batch([...])`: `customers.pii_erased=1`, `erased_at` sellado,
   `name/email/phone/address = NULL`; los snapshots fiscales (`sales.client_name`,
   `sales.client_document_*`) se **anonimizan** a `'[ANONYMIZED]'`/`'00000000'`
   (placeholder ya contemplado en la migración 0001) y los CPE/XML enviados a
   SUNAT se **retienen intactos** (~5 años, obligación fiscal). El audit
   `LPDP_ERASE` registra la solicitud y su ejecutor. El motor ACID (§6) ya
   bloquea la re-materialización con `LPDP_ERASE_BLOCK` (SEC-07) — se reutiliza,
   no se reinventa.
3. **Derecho de acceso/export:** `GET /customers/:id/export` devuelve la PII del
   cliente (perfil + consentimientos + ventas vinculadas) como ejercicio del
   derecho del titular; el export **tenant-wide** sigue siendo Sprint 42
   (`data_backups`, regla 27). Ambos son exportación de datos del cliente, sin
   tocar arqueo ni facturación.
4. **Aislamiento multi-tenant (LPDP-04):** toda lectura/escritura PII fuerza
   `tenant_id` del JWT verificado (nunca del payload); 0 fugas entre tenants.
5. **Dominio:** nuevo package puro `packages/domain-customers` (inventario de PII,
   consentimiento, derechos, anonimización) sin imports de Hono/D1/Svelte;
   cobertura de dominio ≥95% (CAL-03). El panel de clientes en pos-web consume
   la API sin lógica de negocio.
6. **Capability:** `compliance.lpdp` se habilita por flag (ADR-ARCH-002), sin fork
   por vertical; la UI queda tras el gate de Staff Security + Staff Principal.
7. Sprint 47 inicia con gobernanza y contrato RED; migración, dominio, adapters,
   API, UI, chaos y cierre se implementan en un ciclo GREEN posterior.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Borrado físico de filas (`DELETE`) | Viola la retención fiscal SUNAT (~5 años); el DDL 0001 ya modela `pii_erased` + placeholder `[ANONYMIZED]`, no destrucción |
| Reusar `messaging_opt_ins` como consentimiento canónico | Solo cubre el canal WhatsApp y una dimensión booleana; LPDP exige propósito explícito y revocación con sello |
| Solo export tenant-wide (S42) para el derecho de acceso | No cumple el derecho del titular a sus datos por cliente; el criterio de aceptación pide export que incluya PII del cliente |
| Domain-customers dentro de domain-sales (crm-lww) | Mezcla dominio de venta con privacidad; viola la separación por capas y complica la cobertura CAL-03 |

## Consecuencias

- **Gana:** simulacro LPDP reproducible (inventario + consentimiento + erase + export auditable); doc fiscales intocables; 0 re-materialización PII garantizada por el guard existente; aislamiento tenant por construcción.
- **Paga:** el backfill de `messaging_opt_ins` a `consent_records` debe ejecutarse con la migración 0040; el panel de clientes es superficie nueva en pos-web; la anonimización de snapshots fiscales históricos es una escritura batch que debe respetar `tenant_data_epochs`.
- **Invariantes tocadas:** dinero en `INTEGER cents` (sin columnas nuevas monetarias); atomicidad `db.batch` en erase; capability por flag sin fork vertical; D1 única calculadora.
- **Activación:** Sprint 47 / migración 0040 / flag `compliance.lpdp`.

## Evidencia de cierre

- Tests / checks: `consent_records` test migración up/down; dominio `domain-customers` ≥95%; API multi-tenant 0 fugas; test de integridad fiscal post-erase; chaos simulacro LPDP; `verify.sh` SUITE GREEN.
- Ledger: `id: 0320`
- Firmas RACI: `R` Staff Security · `A` Staff Principal · `V` Staff QA (independiente)
