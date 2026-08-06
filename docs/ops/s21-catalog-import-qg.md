---
doc_id: ops-s21-catalog-import-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Quality Gate Sprint 21 — Migración: importadores Bsale/Alegra/CSV

| Campo | Valor |
|---|---|
| Fecha UTC | 2026-08-06T00:30:00Z |
| Sprint | 21 |
| Capabilities | `integrations.catalog_import` |

## Evidencia

| Caso | Resultado |
|---|---|
| Plan de import dry-run puro (no escribe D1) | GREEN (`domain-integrations` catalog-import) |
| Idempotencia: re-import no duplica por `(tenant, source, entity_type, external_id)` | GREEN |
| Impuestos mapeados a `taxes`/`product_taxes` (IGV→1000, ICBPER→7152); nunca reglas opacas del competidor | GREEN |
| Commit atómico D1 (productos/clientes/series + `external_entity_map` en un solo batch) | GREEN (`adapters-d1` CatalogImporter) |
| Adapters Bsale (productos/clientes) y Alegra (items/contactos) | GREEN (`adapters-importers`) |
| CSV enriquecido fallback universal + tokenizer RFC 4180 sin dependencias | GREEN |
| API `POST /api/integrations/catalog-import` (preview/commit, flag off → 404) | GREEN (`worker-api`) |
| 0 secretos de API de terceros en cliente | GREEN (adapters parsean payload; credenciales server-side) |
| Gate monorepo | GREEN (`quality.sh` 8/8, `verify.sh` SUITE) |

## Firmas RACI

| Rol | Firma |
|---|---|
| R Backend Datos | OK |
| V QA | OK |
| V Security (secrets API keys de terceros) | OK |
| V Growth (objeción GTM §8 actualizada) | OK |
| A Staff Principal | pendiente ledger A+V humano si aplica |

## Residuales

- Siigo: solo CSV o sprint follow-up (no adapter explícito hasta decisión).
- `sale_payments.payment_method_id` vs `payment_captures` → resuelto en Sprint 22 (ambos; ver `docs/ops/s22-payments-local-qg.md`).
