---
doc_id: adr-fiscal-004
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-FISCAL-004 — Guía de Remisión Electrónica (GRE `31`) — Backlog v10 P1b

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-12 |
| Decisores | Staff Fiscal, Staff Backend ACID, Staff Principal |
| Consultados | Staff Inventory, Staff Frontend |
| Informados | Escuadrón |
| Relaciona | Arquitectura §5.1 · §5.2 · §5.3 · §6 · ADR-FISCAL-001 v2 · Ledger 0164 |

## Contexto

El transporte de mercadería entre establecimientos, hacia clientes o hacia
terceros exige la Guía de Remisión Electrónica (documento `31`, serie `T…`)
comunicada a SUNAT **el día del traslado**. El Backlog v10 P1 la trae al
producto como capability de **Cadena/Enterprise** (market-matrix GTM §4.1),
manteniendo el resto de la matriz §5.1 intacta.

## Decisión

1. **Dominio** `remission-guide.ts`: motivos de traslado del **catálogo 18**
   (subconjunto cerrado: `01` venta, `02` compra, `04` venta con entrega a
   terceros, `08` importación, `13` devolución, `14` exportación, `16`
   transformación) y modalidad de transporte (catálogo 18 transporte: `01`
   público, `02` privado). Fecha/hora de inicio del traslado obligatoria
   (hora Lima), puntos de origen/destino (ubigeo + dirección), documento
   relacionado opcional (factura/OC).
2. **DDL 0046** `remission_guides`: cabecera (tenant, branch, serie T, número,
   motivo, modalidad, vehículo/transportista, origen/destino, inicio_traslado,
   documento_relacionado, sunat_status) + `remission_guide_items` (producto,
   cantidad microunits, UOM, lote opcional). `sales.document_type` CHECK NO se
   amplía: la GRE no es una venta (tabla propia).
3. **Motor** `process-remission-guide-atomic`: correlativo server-side por
   `branch_document_series` (`document_type_code = '31'`, serie `T…`) con
   guardState anti-doble; 0 impacto en stock/ventas (la GRE no mueve saldos
   monetarios: solo declara el traslado); audit `REMISSION_GUIDE`.
4. **Fiscal:** la GRE se comunica el día del traslado; sin staging SUNAT real
   → `sunat_status = PENDING` y producción/piloto NO-GO (invariante 8).
5. **Gating:** `FEATURE_GRE` default-off; claim **Cadena/Enterprise** (GTM)
   solo tras el gate.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| GRE como `sales.document_type` | La GRE no es un comprobante de pago ni toca AR/impuestos; una tabla propia evita ensuciar el motor de ventas y el RC |
| Enviar GRE solo al cerrar el traslado | SUNAT exige la comunicación ANTES de iniciar el traslado |
| Motivos del catálogo 18 completos | Subconjunto cerrado por producto; los demás motivos (zona primaria, almacenamiento) son nicho y se agregan por regla nueva si un tenant lo exige |

## Consecuencias

- **Gana:** parity de traslado para Cadena/Enterprise; cero re-numeración;
  la GRE no interfiere con el hot-path de cobro.
- **Paga:** migración 0046 + registry de backup; la serie T se administra en
  `branch_document_series` como los demás documentos.
- **Activación:** `FEATURE_GRE` (default `0`); package `@kipuspay/domain-fiscal-pe`
  + `@kipuspay/adapters-d1`.

## Checklist Quality Gate P1b

| # | Criterio | Evidencia | Fiscal | Backend ACID | Principal |
|---|---|---|---|---|---|
| 1 | Motivos catálogo 18 + modalidad cerrados | `remission-guide` tests | Pendiente V | — | — |
| 2 | Correlativo serie T server-side + idempotencia | `process-remission-guide-atomic` + integración D1 | — | Pendiente V | — |
| 3 | 0 impacto en stock/ventas | integración | Pendiente V | — | — |
| 4 | Fecha/hora inicio de traslado obligatoria | dominio + integración | Pendiente V | — | — |
| 5 | verify + quality GREEN | scripts | — | — | Pendiente V |

**Veredicto QG:** `EN REVISION` hasta firma `A` + `V` humana independiente.
