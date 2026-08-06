---
doc_id: ops-s24-whatsapp-loyalty-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 24 — WhatsApp + loyalty light — Quality Gate

**Estado:** GOV-APROBADO (firma A+V)  
**Capabilities:** `messaging.whatsapp_receipt`, `loyalty.points`  
**Spec:** Arquitectura §5.4 reglas 5–6 + edge A; GTM Cadena fidelización light

## Evidencia

| Check | Resultado |
|---|---|
| 0 WhatsApp sin opt-in | GREEN — `assertWhatsAppOptIn` + `trySendWhatsAppReceipt` |
| Post-commit WA no revierte venta | GREEN — try/catch aislado en `offline-sale-route` |
| Loyalty Cadena+; Arranque 403 | GREEN — `PLAN_REQUIRES_CADENA` |
| Cobro nunca 402 por plan | GREEN — `/api/pos/*` checkout-critical |
| Canje authz + audit | GREEN — `LOYALTY_REDEEMED` / token S17 |
| Edge A EXPIRED on retry | GREEN — venta sin puntos + `LOYALTY_RESERVATION_EXPIRED` + push Dueño |
| Balance nunca negativo | GREEN — CHECK + atomic guard |
| Flags default off | GREEN — `FEATURE_MESSAGING_WHATSAPP` / `FEATURE_LOYALTY_POINTS` |
| Chaos / unit | GREEN — domain-integrations, adapters-d1, adapters-messaging, worker-api |
| `scripts/verify.sh` | SUITE GREEN |
| `scripts/quality.sh` | Quality Gate OK |

## RACI

| Rol | Quién | Firma |
|---|---|---|
| R | Backend ACID + Security (PII/WA) | OK |
| A | Staff Principal | OK |
| V | Security + PM + Growth (claim light) | OK |

## Copy Growth (descongelado)

- Cadena: **fidelización light** (puntos + canje con authz) live tras este QG
- FAQ: WhatsApp de comprobante con opt-in; no “motor de fidelización” completo
- Claim motor completo / tiers / campañas permanece congelado

## Residuales

- GRE ship → post-MVP ADR-FISCAL-001 (solo nota de diseño aquí)
- `consent_records` LPDP completo → Sprint 47 (`messaging_opt_ins` es puente)
- Loyalty locks / sobregiro → Sprint 27
- Secrets prod `WA_*` onboarding

## Hallazgos

| ID | Nota |
|---|---|
| GRE | Residual ops — no spike código en S24 |
| Opt-in | Tabla mínima hasta S47 |
