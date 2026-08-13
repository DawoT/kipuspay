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

## Auditoría FASE 7 — hallazgos cerrados (Ledger 0374/0375)

| Hallazgo | Fix | Evidencia |
|---|---|---|
| S21-H1a | **CSV formula injection**: `toCents` silenciaba `=SUM(1,2)` → 120 cents con `replace`; ahora rechaza prefijos `= + @ tab` y valores no numéricos en price (fail-closed), y `hasFormulaPrefix` valida name/email/barcode/sku en el dominio (defensa en profundidad, no solo CSV) | `csv.test.ts` 14/14 + `catalog-import.test.ts` 35/35 (RED→GREEN) |
| S21-H1b | **Sin límite de lote**: archivo gigante = DoS/memoria; `MAX_IMPORT_ROWS=5000` con guard en la ruta HTTP (400 `BAD_REQUEST`) y re-check en `planCatalogImport` | `catalog-import-routes.test.ts` 11/11 (RED→GREEN) |
| S21-H2 | **Import sin guard de rol**: cualquier usuario autenticado (cajero/vendedor) modificaba el catálogo maestro; ahora admin/owner only → `403 FORBIDDEN_ADMIN`, rol propagado desde el JWT en `/api/integrations/catalog-import` | `catalog-import-routes.test.ts` 11/11 (RED→GREEN) |
| F7-C | Commit atómico D1: lote con violación de integridad en una fila → **0 filas persistidas** (antes solo happy path probado); aislamiento de tenant (mismo externalId en otro tenant no es duplicado, DAT-12) | `catalog-importer.integration.test.ts` 7/7 en D1 real (2 nuevos) |

## Firmas RACI

| Rol | Firma |
|---|---|
| R Backend Datos | OK |
| V QA | OK |
| V Security (secrets API keys de terceros) | OK |
| V Growth (objeción GTM §8 actualizada) | OK |
| A Staff Principal | OK (auditoría FASE 7, ledger 0374/0375/0376) |

## Residuales

- Siigo: solo CSV o sprint follow-up (no adapter explícito hasta decisión).
- `sale_payments.payment_method_id` vs `payment_captures` → resuelto en Sprint 22 (ambos; ver `docs/ops/s22-payments-local-qg.md`).
