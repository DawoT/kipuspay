---
doc_id: adr-fiscal-005
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-FISCAL-005 — Percepciones / Retenciones / Detracciones — Backlog v10 P1c

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-13 |
| Decisores | Staff Fiscal, Staff Backend ACID, Staff Principal |
| Consultados | Staff Security, Staff Purchasing |
| Informados | Escuadrón |
| Relaciona | Arquitectura §5.1 · §5.2 · §6 · ADR-FISCAL-001 v2 · Ledger 0164 |

## Contexto

Los regímenes de pagos adelantados (percepción al vender a sujeto agente de
percepción, retención al pagar a proveedor sujeto, detracción en bienes/servicios
del anexo 2) son obligaciones frecuentes en operaciones con el Estado y cadenas.
El Backlog v10 P1 los trae al producto como capability **Cadena/Enterprise**.

## Decisión

1. **Percepción (documento `02`)** — al cobrar una venta a un cliente agente de
   percepción, el total a cobrar incluye la percepción; el documento `02` se
   emite como comprobante independiente encadenado a la venta. Tasas cerradas
   (catálogo de percepción): `0.02` venta de mercancías/combustibles, `0.005`
   resto.
2. **Retención (documento `20`)** — al pagar a un proveedor sujeto de
   retención, se retiene y emite el documento `20`. Tasas cerradas (catálogo de
   retención): `0.03` bienes, `0.06` servicios, `0.12` comisiones.
3. **Detracción** — operación sujeta (anexo 2) registrada con su tasa
   (`0.04`–`0.12` por categoría) y estado `PENDING_DEPOSIT` hasta el depósito
   bancario (sin staging bancario: NO-GO en producción).
4. **DDL 0047**: tablas propias `perceptions` y `retentions` (como la GRE
   `31`, sin recrear `sales`): cabecera con serie/número propia
   (`branch_document_series` con `document_type_code '02'/'20'`), monto base,
   tasa, monto retenido/percebido en cents, documento origen (venta/compra),
   `sunat_status PENDING`; + `withholding_parameters` (tasas por categoría,
   cerradas en CHECK de catálogo).
5. **Motor**: `process-perception-atomic` (documento `02` + cobro con
   percepción en el mismo batch) y `process-retention-atomic` (documento `20`
   + pago con retención); audit `PERCEPTION`/`RETENTION` con hash-chain;
   redondeo en cents (Math.round, server-side).
6. **Gating:** `FEATURE_FISCAL_WITHHOLDINGS` default-off; claims
   Cadena/Enterprise solo tras gate.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Percepción como línea de la venta | SUNAT exige documento `02` propio con serie/número; la percepción NO es IGV de la venta |
| Recrear el CHECK de `sales` (patrón 0044) | `sales` tiene muchas FKs entrantes e índices: recrearla es invasivo y arriesgado; tablas propias (patrón GRE 0046) aíslan el riesgo |
| Tasas editables por tenant | Catálogos SUNAT cerrados; parámetros por categoría en la tabla con CHECK |
| Depósito de detracción real | Sin staging bancario; queda `PENDING_DEPOSIT` documentado (NO-GO) |

## Consecuencias

- **Gana:** parity fiscal con facturadores (operaciones con el Estado y cadenas).
- **Paga:** migración 0047 (recreación del CHECK de `sales`) + parámetros.
- **Activación:** `FEATURE_FISCAL_WITHHOLDINGS` (default `0`).

## Checklist Quality Gate P1c

| # | Criterio | Evidencia | Fiscal | Backend ACID | Principal |
|---|---|---|---|---|---|
| 1 | Tasas cerradas por catálogo + redondeo cents | dominio tests | Pendiente V | — | — |
| 2 | Documento 02/20 + cobro/pago atómicos | motores + integración D1 | — | Pendiente V | — |
| 3 | Audit PERCEPTION/RETENTION | integración | Pendiente V | — | — |
| 4 | Detracción PENDING_DEPOSIT documentada | dominio + integración | Pendiente V | — | — |
| 5 | verify + quality GREEN | scripts | — | — | Pendiente V |

**Veredicto QG:** `EN REVISION` hasta firma `A` + `V` humana independiente.
