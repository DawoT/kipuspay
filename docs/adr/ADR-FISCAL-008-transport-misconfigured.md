---
doc_id: adr-fiscal-008-transport-misconfigured
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-FISCAL-008 — Transporte MISCONFIGURED ≠ mock ACCEPTED

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-21 |
| Decisores | Staff Fiscal, Staff Principal |
| Consultados | Staff SRE, Staff Security |
| Informados | Escuadrón |
| Relaciona | Arquitectura §5.2 · ADR-FISCAL-002 · ADR-FISCAL-007 · FASE FL-0 |

## Contexto

`selectFiscalTransport` con plugins on y sin SOL ni `FISCAL_PSE_ENDPOINT_URL`
caía a `createMockPseTransport()` (CDR `accepted: true`). El comentario decía
fail-closed; el comportamiento mentía `ACCEPTED` en staging/producción mal
configurados. Eso no es un facturador.

## Decisión

1. Nuevo modo `MISCONFIGURED`: `submit` → `unreachable`; `queryCdr.accepted`
   es `false`. El worker responde **503** `TRANSPORT_MISCONFIGURED`.
2. Plugins **off** → mock **solo** tests locales (`MOCK_STAGING`).
3. Plugins on + SOL → SOAP e-beta (ADR-FISCAL-007). Plugins on + URL PSE →
   HTTP JSON. Hostname `.invalid` no es canal acreditado.
4. HTTP 2xx sin `accepted===true` y `cdrCode` no vacío → `unreachable`.
5. Drain live: XML unitario sin `ds:Signature` + root UBL → `QUARANTINED`
   `MISSING_XADES`; 0 `ACCEPTED` desde mock en ese camino.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Seguir con mock ACCEPTED | Miente el claim SUNAT (invariante 8) |
| Fallar el process al arrancar | La venta debe seguir (invariante 7); outbox reintenta |
| Tratar `.invalid` como GREEN | No hay OSE; GTM-08 seguiría mentido |

## Consecuencias

- **Gana:** plugins mal cableados no afirman CDR.
- **Paga:** staging con flags on y sin secretos de A ve 503 hasta que A entregue
  SOL o URL PSE real.
- **Invariantes:** 8 (CDR), 7 (venta no se cae), 5 (fail-closed).
- **Activación:** FASE FL-0; flags git 0.

## Evidencia de cierre

- Tests: `select-transport.test.ts`, `fiscal-error.test.ts`, `fiscal-drain.test.ts`
- Ledger: `id: 0458`
- Firmas RACI: `R` Staff Fiscal · `A` pendiente · `V` pendiente
