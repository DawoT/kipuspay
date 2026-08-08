---
doc_id: adr-0027-customer-order-reservation
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0027 — Reserva y fulfillment de pedidos de cliente

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-08 |
| Decisores | Staff Principal · Staff Backend ACID · Staff Product |
| Consultados | Staff Inventory · Staff Fiscal · Staff Frontend · Staff Mobile · Staff Security · Staff QA |
| Informados | Staff Growth · Staff Support |
| Relaciona | Arquitectura §5.10 regla 28 · Roadmap Sprint 43 · COM-05 · COM-09 · DAT-12 · SYN-12 |

## Contexto

El borrador de Regla 28 confundía un pedido con comanda, cotización, apartado y venta,
usaba cantidades `REAL`, permitía una sola venta por pedido y no definía concurrencia,
aviso previo, fulfillment offline ni aislamiento tenant completo. También podía
interpretarse “tenant requiere pedido” como un bloqueo al checkout ordinario, contrario
al invariante offline-first.

## Decisión

1. El pedido de cliente reserva stock sin pago, venta ni CPE; su contrato canónico,
   DDL objetivo 0036, transiciones ACID, avisos y envelope offline viven únicamente en
   Arquitectura §5.10.
2. Crear, cumplir, cancelar y expirar son batches D1 idempotentes con conservación
   exacta `requested = fulfilled + released + reserved`; cumplir reutiliza la reserva
   y nunca descuenta stock dos veces.
3. El precio snapshot vigente gana. Un pedido expirado libera primero y solo permite
   una venta nueva a precio actual con autorización de supervisor.
4. La liberación automática exige intención durable/auditable de aviso, no entrega
   confirmada. WhatsApp es opcional por capability, in-app es fallback operativo y
   push garantizado pertenece a Sprint 45.
5. La política de pedido obligatorio se limita al flujo de retiro. Venta ordinaria y
   offline sobreviven fallos de pedido, aviso, lease y reconciliación.
6. Sprint 43 comienza con gobernanza y tests RED; producción y activación requieren un
   ciclo GREEN posterior, evidencia runtime y Quality Gate.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Reusar `orders.lifecycle` | Es comanda food-service y no expresa reserva, expiración ni precio snapshot |
| Reusar cotizaciones | Una quote no reserva stock |
| Reusar apartados | Layaway registra pagos; el pedido no |
| Descontar stock al fulfill | Duplica el descuento ya realizado al reservar |
| Esperar confirmación del transporte para expirar | Una caída externa retendría stock indefinidamente y podría bloquear caja |
| Exigir pedido a toda venta | Rompe venta ordinaria/offline y el invariante “la venta nunca se cae” |
| Autoridad de precio/envelope en cliente | Permite replay, cross-tenant y manipulación de monto o inventario |

## Consecuencias

- **Gana:** semántica no ambigua, conservación verificable, parciales múltiples,
  aislamiento tenant, avisos observables y checkout independiente.
- **Paga:** cuatro tablas nuevas, guard/versionado, leases server-minted, coordinación
  con stock granular y una cola de aviso durable.
- **Invariantes tocadas:** dinero INTEGER cents, cantidades INTEGER microunits,
  DAT-12, `db.batch([...])`, capability model, offline-first y fiscal outbox.
- **Activación:** baseline contractual RED en Sprint 43; capability default-off hasta
  GREEN, chaos 500, evidencia workerd/staging y firmas RACI.

## Evidencia de cierre

- Tests/checks: contratos RED de dominio, D1/migración/atomicidad/workerd, Worker,
  POS/UI/offline y chaos 500; `scripts/verify.sh`.
- Ledger: pendiente de implementación GREEN; este baseline no agrega entrada.
- Firmas RACI: `R` Staff Backend ACID/Product · `A` Staff Principal ·
  `V` Staff QA/Security independiente.
