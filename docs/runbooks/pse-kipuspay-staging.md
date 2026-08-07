---
doc_id: runbook-pse-kipuspay-staging
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Runbook — PSE KipusPay staging / CDR (Sprint 5)


| Campo | Valor |
|---|---|
| Severidad tipica | SEV-2 (emisión) / SEV-1 (CDR perdido) |
| Owner on-call | Staff SRE + Staff Fiscal |
| Ultima ensayada | 2026-08-07 (Sprint 26 breaker + mock PSE) |
| Relaciona | ADR-FISCAL-001 · ADR-FISCAL-002 · Arquitectura §5.2 · §8.1 · Roadmap Sprint 5/26 |

## Sintomas

- CPE queda `PENDING` / `QUARANTINED` sin CDR.
- Worker-fiscal `/cdr` no responde o mock falla.
- Claim comercial PSE aún **congelado** (esperado hasta checklist).

## Checklist readiness (claim descongelado)

1. Secrets en Workers (nunca en git): endpoint PSE, client id/secret.
2. `FiscalTransport` mode `KIPUSPAY_PSE_DIRECT` en staging real.
3. CDR de prueba ACCEPTED archivado (ticket + sale_id).
4. Firma RACI SRE en ledger de cierre.

## Sprint 26 — breaker

- Flags: `FEATURE_FISCAL_CIRCUIT_BREAKER` / `FEATURE_FISCAL_TRANSPORT_PLUGINS` (default off).
- Hot-path submit: isolate→KV only; DO write coalesced.
- Drain: `POST /v1/fiscal/drain` en worker-fiscal; FIFO `must_submit_by`; XML en R2.
- Dueño: `/api/fiscal/owner-backlog` + `POST /api/fiscal/credit-note-ea` (confirmación obligatoria).

## Mitigación staging

1. Usar `createMockPseTransport()` (`MOCK_STAGING`) detrás de flag.
2. Requeue `fiscal_outbox` PENDING; no borrar ventas.
3. Feature `FEATURE_FISCAL_CPE=0` rollback inmediato.

## Ensayo

- Mock submit → ACCEPTED; queryCdr → código 0.
- 0 NV en `fiscal_outbox`.

## Postmortem

- Ledger id: ____
