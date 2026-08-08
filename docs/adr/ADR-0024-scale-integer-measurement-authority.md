---
doc_id: adr-0024-scale-integer-measurement-authority
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0024 — Peso entero y medición autoritativa

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-08 |
| Decisores | Staff Principal · Staff Frontend · Staff Hardware · Staff Backend ACID · Staff Security |
| Consultados | Staff Backend Datos · Staff QA · Staff PM |
| Informados | Staff Growth · Staff SRE |
| Relaciona | Arquitectura §5.7 regla 25 · Roadmap Sprint 40 · ADR-0015 · ADR-0022 · SEC-02 · SYN-13 |

## Contexto

Sprint 40 debe aceptar balanzas con protocolos y unidades diferentes, venta manual y
operación offline sin permitir que un `REAL`, un subtotal calculado por el navegador o
una desconexión convertida silenciosamente en cero entren al motor ACID. El bosquejo
previo mezclaba `sale_items.quantity REAL` con `weight REAL`, no identificaba cada
medición ni delimitaba la autorización de un peso manual.

## Decisión

1. Toda masa física se normaliza a `INTEGER weight_microunits`; una unidad base equivale
   a `1_000_000` microunidades. `WEIGH` es un tipo de producto físico con stock.
2. El servidor calcula centavos con aritmética entera y half-up:
   `floor((unit_price_per_base_cents * weight_microunits + 500_000) / 1_000_000)`.
3. WebHID, Web Serial y WebUSB solo producen un DTO local normalizado. El HTTP DTO
   confiable no acepta bytes, unidad, precio ni subtotal aportados por el dispositivo.
4. Una lectura queda stale a los `2_000 ms`; desconexión o heartbeat stale obliga a
   peso manual y jamás produce un peso cero.
5. El umbral manual del tenant es `0` por defecto. Superarlo exige un token
   `WEIGHT_OVERRIDE`, de un uso, ligado a tenant, terminal, venta, línea y medición,
   con vigencia máxima de 90 segundos.
6. La política vive en `tenant_weight_policies`, no como columna de `tenants`.
   `scale_devices` registra protocolo, fingerprint, configuración y estado con scope
   compuesto tenant+terminal.
7. Cada línea `WEIGH` tiene exactamente una medición persistida. Líneas distintas del
   mismo producto conservan identidades de medición distintas.
8. La venta offline conserva medición e identidad, pero el servidor vuelve a resolver
   producto, precio, autorización, cantidad, stock y total antes de confirmar.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| `REAL` en peso o cantidad | Introduce drift y contradice el modelo canónico de microunidades |
| Confiar subtotal del POS | Permite manipulación y rompe reconciliación autoritativa |
| WebUSB como único transporte | Excluye balanzas HID y seriales sin razón de dominio |
| Mantener el último peso al desconectar | Presenta una lectura stale como vigente |
| Columna de política en `tenants` | Acopla configuración operativa de hardware al agregado raíz |
| Dispositivo solo en configuración local | Impide revocación, auditoría y scope tenant+terminal server-side |
| Token general de supervisor | Permite replay en otra línea, terminal o venta |
| Agrupar por producto | Confunde dos pesadas del mismo SKU y pierde trazabilidad |

## Consecuencias

- **Gana:** paridad exacta online/offline, trazabilidad por línea y degradación visible.
- **Paga:** migración 0033 con políticas/dispositivos/mediciones, parsers de tres
  transportes, heartbeat y cutover ACID.
- **Invariantes tocadas:** INTEGER microunits/cents, DAT-12, `db.batch`, offline-first,
  revocación fail-closed y capability flags sin forks por vertical.
- **Activación:** contratos RED en Sprint 40; implementación posterior bajo
  `FEATURE_INVENTORY_SCALE` default off.

## Evidencia de cierre

- Tests/checks: dominio, schema up/down, ACID, HTTP/RBAC, cliente multi-protocolo y
  chaos heartbeat de 500 ciclos.
- Ledger: pendiente del GREEN y Quality Gate de Sprint 40.
- Firmas RACI: `R` Staff Frontend/Hardware · `A` Staff Principal/Backend ACID ·
  `V` Staff QA independiente/Staff Security.
