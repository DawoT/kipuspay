---
doc_id: adr-0028-recurring-sales-settlement
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0028 — Membresías con liquidación periódica server-authoritative

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-08 |
| Decisores | Staff Principal · Staff Backend ACID · Staff Product |
| Consultados | Staff Data · Staff Fiscal · Staff Frontend · Staff Security · Staff QA |
| Informados | Staff Growth · Staff Support |
| Relaciona | Arquitectura §5.11 regla 29 · Roadmap Sprint 44 · COM-10 · DAT-12 · SYN-12 · GTM-25 |

## Contexto

El borrador de Regla 29 guardaba ítems JSON con precio aportado por cliente, no
distinguía membresía de billing SaaS, cuotas, apartados o pedidos, y no fijaba
calendario, concurrencia, deuda, cancelación ni prorrateo. Esa ambigüedad podía
duplicar ventas, saltar períodos, mutar historia o convertir la mora de una
membresía en bloqueo de la caja ordinaria.

## Decisión

1. El contrato canónico, DDL objetivo 0037 y fronteras de Sprint 44 viven únicamente
   en Arquitectura §5.11; §5.3 conserva solo el puntero.
2. Cada versión selecciona `FIXED` (default, snapshot servidor) o `CURRENT`
   (resolución servidor por ocurrencia). La ocurrencia siempre persiste el snapshot
   aplicado y ningún cliente envía autoridad monetaria.
3. Cada período de Lima genera exactamente una venta normal, NV/CPE y una CxC en un
   solo batch D1. Sprint 44 no almacena credenciales de tarjeta ni autocobra.
4. La mora entra a gracia y jamás bloquea POS/fiscal ordinario. Tras la gracia, una
   política explícita puede pausar solo futuras ejecuciones de esa membresía.
5. Cancelar al fin del período no acredita; cancelar de inmediato acredita días
   completos no usados con racional entero half-up y crea NC/NV_RETURN mediante el
   motor normal de devoluciones, sin mutar la venta original.
6. Sprint 44 empieza con gobernanza y tests RED. Producción y GTM-25 requieren ciclo
   GREEN posterior, workerd/staging, chaos 500 y Quality Gate firmado.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Reusar billing de KipusPay | Cobra la suscripción SaaS del tenant, no ventas del tenant a sus clientes |
| Reusar cuotas | Las cuotas dividen una CxC existente; no crean venta por período |
| Reusar apartados | El apartado recibe anticipos y reserva antes de convertir |
| Reusar pedidos de cliente | El pedido reserva sin venta/CPE al crearse |
| Precio siempre vigente | Impide contratos comerciales de precio fijo |
| Precio enviado por Admin/POS | Convierte al cliente en autoridad monetaria |
| Autocobrar tarjeta | Amplía PCI/consentimiento y no pertenece a Sprint 44 |
| Marcar ocurrencia antes de vender | Un crash puede dejar período consumido sin venta |
| Suspender toda la caja por mora | Viola offline-first y la promesa de cobro/fiscal continuo |
| Prorratear por horas o float | Introduce ambigüedad temporal y redondeo monetario no determinista |

## Consecuencias

- **Gana:** semántica no ambigua, historia de precio reproducible, calendario
  determinista, exactly-once físico y checkout independiente.
- **Paga:** versiones append-only, cinco tablas normalizadas, leases/retries y
  coordinación con venta, fiscal, CxC, stock, uso, auditoría y devoluciones.
- **Invariantes tocadas:** dinero INTEGER cents, cantidades INTEGER microunits,
  DAT-12, `db.batch([...])`, servidor autoritativo, capability model y offline-first.
- **Activación:** baseline contractual RED en Sprint 44; capability default-off y
  GTM-25 congelado hasta GREEN, staging, chaos 500 y firmas RACI.

## Evidencia de cierre

- Tests/checks: contratos RED de dominio, schema/workerd, scheduler/atomicidad,
  Worker scheduled/RBAC, POS Admin/cliente y chaos 500; `scripts/verify.sh`.
- Ledger: pendiente de implementación GREEN; este baseline no agrega entrada.
- Firmas RACI: `R` Staff Backend ACID/Data · `A` Staff Principal/PM ·
  `V` Staff QA/Security independiente.
