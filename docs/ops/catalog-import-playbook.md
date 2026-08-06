---
doc_id: ops-catalog-import-playbook
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Playbook "Cambiarse en un día" — Migración de catálogo (Sprint 21)

| Campo | Valor |
|---|---|
| Fuente técnica | Arquitectura §5.4 regla 1 · Roadmap Sprint 21 |
| Owner | Staff Growth · Staff Content · Staff Backend Datos |
| Gate | Sprint 21 cerrado (ledger 0263/0268/0269); no prometer antes del gate |

Este playbook habilita la objeción GTM §8 "Ya tengo un sistema, cambiar es mucho trabajo" con el claim público **"importamos tu catálogo y clientes desde Bsale/Alegra (o CSV) en un día, con dry-run antes de tocar tu caja"**.

## Qué promete el claim

- Importar **productos** y **clientes** desde Bsale/Alegra (o CSV enriquecido) a KipusPay.
- **Dry-run primero**: el vendedor ve el plan (creates, skips, conflictos) **sin escribir nada** en la base; solo después de aprobar se hace el commit.
- **Idempotencia**: re-importar no duplica; cada `(source, entity_type, external_id)` mapea a un solo registro interno.
- Impuestos mapeados a `taxes`/`product_taxes` de KipusPay; **jamás** se copian reglas fiscales del competidor.

## Qué NO promete

- Siigo: **no** hay adapter explícito → solo CSV o sprint follow-up (fase-7 backlog).
- Venta rápida con cámara: es FASE 6G Sprint 50, no se anuncia (GTM-06).
- Que el negocio quede "migrado" si el commit reporta conflictos: el dry-run muestra los conflictos para corregir el origen (documentos fiscales faltantes, impuestos no configurados, precios sin definir).

## Proceso operativo (para ventas y soporte)

1. El cliente exporta su catálogo desde Bsale/Alegra (o arma el CSV con la plantilla de `docs/ops/`).
2. El vendedor sube el archivo y ejecuta `preview` (`POST /api/integrations/catalog-import` con `mode: preview`).
3. Revisar el reporte: `created`, `skipped` (ya existían) y `conflicts`.
   - Un cliente sin documento fiscal aparece como conflicto "cliente requiere número de documento" → pedir el dato al cliente antes de commitear.
   - Un producto sin precio aparece como conflicto "producto requiere precio" → definir el precio en origen.
   - Un impuesto no configurado en el tenant → configurar la tax antes (o el producto se importa sin `product_taxes`).
4. Resolver conflictos y re-ejecutar el preview hasta que el reporte esté limpio.
5. Ejecutar `commit` con el mismo `tenant_id`; el servidor re-planifica y **rechaza con 422** si entre preview y commit aparecieron conflictos (no se escribe nada).
6. Verificar en POS que productos/clientes/series quedaron listos para cobrar el mismo día.

## Trazabilidad

- Capability: `integrations.catalog_import` (flag `FEATURE_CATALOG_IMPORT`, default off → 404).
- Tabla: `external_entity_map` (Arquitectura §5.4, migración 0013).
- Regla de import: Arquitectura §5.4 regla 1.
- Gate comercial: GTM §8 objeción #1.
