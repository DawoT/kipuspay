---
doc_id: adr-0025-price-label-snapshot-transport
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0025 — Snapshot autoritativo para etiquetas de precio

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-08 |
| Decisores | Staff Principal · Staff Frontend · Staff Hardware · Staff Data · Staff Security |
| Consultados | Staff Backend ACID · Staff QA |
| Informados | Staff PM · Staff Growth · Staff SRE |
| Relaciona | Arquitectura §5.8 regla 26 · §7.5 · Roadmap Sprint 41 · CAL-06 · DAT-12 |

## Contexto

Sprint 41 debe imprimir lotes mientras catálogo, precios y conectividad pueden cambiar,
sin aceptar precio del navegador ni convertir una falla periférica en bloqueo de caja.
El bosquejo previo solo modelaba una plantilla mutable y no definía autoridad,
idempotencia, ACK parcial, seguridad del DSL ni semántica de retry/reimpresión.

## Decisión

1. El Worker resuelve una lista explícita de productos con lista explícita o fallback
   default de sucursal, sin contexto de cliente.
2. Cada batch persiste un snapshot coherente, ordenado, inmutable y hasheado de
   catálogo, precio, barcode y versión de plantilla. El precio de cliente no es fuente
   de verdad.
3. Retry conserva batch y snapshot; reimpresión explícita crea batch nuevo, refresca
   datos vigentes y audita `PRICE_LABEL_REPRINT`.
4. El ACK es por ítem y la outbox genérica IndexedDB es no bloqueante para venta y
   cierre Z, incluso tras F5 o presión de cuota.
5. El DSL `PRICE_LABEL_V1` es declarativo, versionado y allowlisted. EAN-8, EAN-13 y
   CODE128 se validan/renderizan con Web Platform APIs y código zero-dependency.
6. `PrinterTransport` de esta entrega usa WebUSB con cleanup garantizado y WSS
   paired/allowlisted con ACK, timeout y reconnect explícito.
7. Offline solo reintenta snapshots existentes. Crear o reimprimir requiere autoridad
   online. Flags Worker/POS quedan default-off.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Resolver precio al imprimir cada ítem | Puede producir un lote con dos precios para el mismo instante lógico |
| Confiar precio o lista del POS | Permite manipulación y fuga cross-tenant |
| Retry que refresca precio | Hace no determinista una recuperación técnica |
| Plantilla HTML/JS libre | Amplía superficie XSS/red y rompe render determinista |
| Una fila por batch sin ACK de ítem | Obliga a repetir etiquetas ya impresas |
| Outbox específica que bloquea caja | Duplica infraestructura y acopla periféricos al cierre financiero |
| Crear lotes offline | No puede demostrar precio vigente server-side |

## Consecuencias

- **Gana:** impresión reproducible, autoridad server-side, retry seguro y degradación
  periférica sin impacto financiero.
- **Paga:** futura migración 0034, snapshot storage, compilador DSL/barcode, outbox
  genérica y dos adapters de transporte.
- **Invariantes tocadas:** INTEGER cents, DAT-12, `db.batch`, zero-dependency,
  capability flags, fail-closed cross-tenant y offline-first sin autoridad local.
- **Activación:** contratos RED en Sprint 41; implementación posterior bajo
  `FEATURE_CATALOG_PRICE_LABELS` y `PUBLIC_FEATURE_CATALOG_PRICE_LABELS`, default-off.

## Evidencia de cierre

- Tests/checks: dominio/golden/barcode, schema up/down, D1 batch/precio, HTTP/RBAC,
  outbox/transporte/UI y chaos de 500 ciclos.
- Ledger: pendiente del GREEN y Quality Gate de Sprint 41.
- Firmas RACI: `R` Staff Frontend/Hardware/Data · `A` Staff Principal ·
  `V` Staff QA independiente/Staff Security.
