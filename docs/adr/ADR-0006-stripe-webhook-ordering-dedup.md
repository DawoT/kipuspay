---
doc_id: adr-0006
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0006 — Ordenamiento y claim atómico de webhooks Stripe

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-04 (aceptado 2026-08-12 en auditoría Sprint 3) |
| Decisores | Staff Principal |
| Consultados | Staff Security, Staff SRE |
| Informados | Escuadrón |
| Relaciona | Arquitectura §4 · SEC-08 · ADR-0005 · Ledger 0202 · Ledger 0329 |

## Contexto

La entrega de eventos Stripe es at-least-once y los retries pueden cruzar tipos
distintos. La implementación anterior permitía que un `customer.subscription.updated`
tardío des-revocara un tenant cancelado y usaba SELECT→INSERT para reclamar el
evento, dejando una ventana TOCTOU frente a redelivery concurrente.

## Decisión

1. Solo `invoice.paid` des-revoca. `customer.subscription.updated` es downgrade-only:
   `active`/`trialing`/desconocido no cambia estado; `past_due` conserva la gracia;
   estados no pagadores revocan fail-closed.
2. El claim SEC-08 usa `INSERT ... ON CONFLICT (source, event_id) DO NOTHING`.
   `changes=1` reclama; `changes=0` consulta el estado y reintenta solo eventos no
   `PROCESSED`.
3. Eventos externos sin tenant de suscripción usan la partición reservada `external`.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Des-revocar en cada `customer.subscription.updated` | Un evento atrasado puede restaurar acceso tras una cancelación. |
| SELECT→INSERT para dedup | TOCTOU y error UNIQUE no estructurado bajo concurrencia. |
| Rechazar todo `updated` | Perdería downgrades explícitos como `past_due` o `canceled`. |

## Consecuencias

- **Gana:** ordenamiento fail-closed y claim idempotente sin carrera SELECT→INSERT.
- **Paga:** una reactivación reflejada solo por `updated` espera un `invoice.paid` para des-revocar.
- **Invariantes tocadas:** AGENTS §2 (revocación fail-closed, webhooks HMAC/replay y D1 atómico); SEC-08.
- **Activación:** Sprint 3, corrección posterior al QG inicial.

## Evidencia de cierre

- Tests: `handle-stripe-webhook.test.ts` (updated stale, past_due, canceled, redelivery PROCESSING, external, replay re-firmado dentro/fuera de ventana) y `verify-stripe-signature.test.ts` (fuzz determinista seedable + adversarial: borde 300 s, hex truncado, `=` extra, multi-v1, mayúsculas).
- Checks: `@kipuspay/worker-api` GREEN (14/14 webhook), typecheck, lint, `scripts/verify.sh`
  SUITE GREEN y `scripts/quality.sh` Quality Gate OK.
- Ledger: `id: 0202` con evidencia RED/GREEN y SHAs verificables; auditoría Sprint 3 en `id: 0329`.
- Firmas RACI: `R` Staff Security · `A` Staff Principal · `V` Staff SRE (revisión cruzada Security + SRE, QG Sprint 3).
