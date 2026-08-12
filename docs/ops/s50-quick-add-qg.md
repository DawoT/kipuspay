---
doc_id: ops-s50-quick-add-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 50 — Alta rápida de catálogo (catalog.quick_add + sales.quick_line) — Quality Gate

**Estado software:** GREEN local  
**Estado claim:** "sube tu catálogo con la cámara" descongelada (GTM §4.1, FASE 6G); producción/piloto NO-GO  
**Capabilities:** `catalog.quick_add`, `sales.quick_line`, default-off (`FEATURE_CATALOG_QUICK_ADD`)  
**Spec:** Arquitectura §5.3 regla 34 (edges 1A/2A) · Roadmap FASE 6G

El gate automatizado demuestra el contrato en entorno local: clasificación de escaneo
por namespace (edge 1A: `EMP-` → vendedor, dígitos → producto, 0 falsos positivos en
500 escaneos mixtos), upsert por barcode sin duplicar (índice único 0042), alta de
producto en ~3s con audit `QUICK_ADD`, venta rápida genérica (edge 2A: `manualPriceCents`
≤ umbral sin authz, IGV default del tenant, `GENERIC_LINE` en audit, 0 descuento de
stock, línea marcada pendiente de catalogar) y lector compartido zero-dependency.
No existe staging Cloudflare real: producción y piloto NO-GO.

## Evidencia RED→GREEN

| Hito | Run ID | Evidencia |
|---|---|---|
| RED migración | `run-red-s50-schema` | 0042 ausente (tests de schema fallaron) |
| RED dominio | `run-red-s50-domain` | scan-classifier + línea genérica ausentes (tests fallaron por import) |
| GREEN migración | `run-green-s50-schema` | quick-add-schema 4/4 + down total 41/41 |
| GREEN dominio | `run-green-s50-domain` | domain-catalog 5/5 (100% cobertura, edge 1A 500 escaneos); domain-sales 245 (línea genérica 4) |
| GREEN motor | `run-green-s50-motor` | integración edge 2A 2/2 (GENERIC_LINE, sin stock, umbral) |
| GREEN rutas | `run-green-s50-routes` | quick-add-routes 7/7 (flag/403/422/upsert/201/scan) |
| GREEN UI+E2E | `run-green-s50-ui` | pos-web 176 unit + E2E 30/30 (quick-sale 2/2) |

## Resultado local exacto

| Suite/check | Resultado observado |
|---|---|
| Domain catalog | **5 tests, 100% stmts/branches/funcs/lines** (scan-classifier) |
| Domain sales | **245 tests GREEN** (línea genérica: shape, validación, IGV 18%, COGS 0, descuento) |
| Domain integrations | 29 tests GREEN (CatalogImporter rechaza `EMP-`) |
| Adapters D1 | **305 unit + 221 workerd** GREEN (edge 2A 2/2) |
| Worker API | **694 tests GREEN** (quick-add-routes 7/7) |
| POS web | **176 unit + E2E 30/30 GREEN** |
| `scripts/verify.sh` | `RESULT SUITE GREEN` (V-00..V-24) |

## Cobertura contractual

| Contrato | Evidencia local |
|---|---|
| Edge 1A (namespace) | `classifyScan`: `EMP-12345` → VENDOR_SCOPE; dígitos → PRODUCT_SCOPE; 500 escaneos mixtos → 0 falsos positivos; `isReservedBarcode` + índice único 0042 (`NOT LIKE 'EMP-%'`) + CatalogImporter (3 barreras) |
| Edge 2A (venta genérica offline) | Motor acepta `isUncatalogued=1` + `manualPriceCents` ≤ `max_amount_without_auth_cents` (regla 2/17, default S/20); `sale_items.product_id NULL`, `unit_cost 0`, IGV 18%; audit `GENERIC_LINE` con hash-chain; 0 cambios de stock; fuera del umbral → `GENERIC_LINE_PRICE_EXCEEDS_THRESHOLD` |
| Upsert por barcode | Índice único `(tenant_id, barcode)` parcial; ruta devuelve 200 (existente) / 201 (nuevo) sin duplicar |
| Audit | `QUICK_ADD` (ruta) y `GENERIC_LINE` (motor) en `audit_events` con cadena prev_hash/row_hash |
| Lector compartido | `barcode-scanner.ts` (BarcodeDetector + fallback manual, zero-dep); `GET /api/catalog/scan/:raw` resuelve producto o vendedor (badge_barcode 0042) |
| Pendiente de catalogar | La línea genérica queda `is_uncatalogued=1` (visible para catalogar después) |
| Gating | `FEATURE_CATALOG_QUICK_ADD` default-off (404) + rol owner/admin (403) |

Tests de trazabilidad:

- `packages/domain-catalog/src/scan-classifier.test.ts`.
- `packages/domain-sales/src/offline-sale.test.ts` (línea genérica).
- `packages/domain-integrations/src/catalog-import.test.ts`.
- `packages/adapters-d1/src/quick-add-schema.test.ts`,
  `packages/adapters-d1/src/process-offline-sale-atomic.integration.test.ts` (edge 2A).
- `apps/worker-api/src/catalog/quick-add-routes.test.ts`.
- `apps/pos-web/src/lib/quick-sale.red.test.ts`, `src/lib/scan/barcode-scanner.test.ts`,
  `tests/e2e/quick-sale.spec.ts`.

## Security Review

- `EMP-` reservado en 3 capas (dominio, DB, importador); el clasificador es
  fail-closed (UNKNOWN → 422, nunca se resuelve).
- Precio manual solo dentro del umbral sin authz; el servidor impone IGV y
  montos; la línea genérica jamás toca stock ni PMP.
- Tenancy: `tenant_id` del JWT en upsert/scan.

Esta revisión no equivale a pentest.

## Evidencia externa pendiente

| Evidencia requerida | Estado | Condición de cierre |
|---|---|---|
| Alta con cámara en <3s (gama baja) | PENDIENTE / NO-GO | QA humano con equipo físico |
| Staging Cloudflare real | PENDIENTE / NO-GO | Bindings, CSP y latencia real |
| QA humana + A/V independiente | PENDIENTE / NO-GO | Flujo de caja validado por humanos |

## RACI real

| Rol | Estado |
|---|---|
| Staff Backend ACID | Migración 0042 + motor edge 2A + rutas GREEN local |
| Staff Data | scan-classifier + línea genérica (dominio) GREEN local |
| Staff Frontend/Design | Lector + caja + panel catálogo + E2E GREEN local |
| Staff QA independiente | PENDIENTE (gama baja física) |
| Staff Principal V | Revisión del motor: 0 hallazgos medium+ |
| Staff Growth | Claim descongelada (GTM §4.1) |

## Veredicto

**SOFTWARE-GREEN-CLAIM-LIVE.** El software y el gate automatizado quedan GREEN local y
el claim **"sube tu catálogo con la cámara"** se descongela conforme al gate del
Sprint 50 (Roadmap FASE 6G), con copy acotado (alta ~3s, venta rápida genérica sin
stock y marcada para catalogar) y la capability default-off. Producción y piloto
siguen NO-GO hasta staging real y firmas A/V independientes.
