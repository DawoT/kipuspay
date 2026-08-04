---
doc_id: adr-0005
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0005 — Webhooks Stripe con WebCrypto nativo (sin SDK)

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-04 |
| Decisores | Staff Security, Staff Principal |
| Consultados | Staff SRE |
| Informados | Escuadrón |
| Relaciona | Arquitectura §4 · SEC-08 · AGENTS invariante 6 · Roadmap Sprint 3 · Ledger 0199 |

## Contexto

Sprint 3 exige `verifyStripeSignature` con anti-replay ≤ 300 s e invalidación
KV+DO. El edge es zero-dependency runtime (AGENTS invariante 10 / CAL-06): no se
añade el SDK `stripe` al Worker.

## Decisión

1. Implementar verificación HMAC-SHA256 con **WebCrypto** en
   `apps/worker-api/src/webhooks/verify-stripe-signature.ts`.
2. Ventana anti-replay con cota inferior y superior: `0 ≤ ageSeconds ≤ 300`.
3. Comparación de firmas en **tiempo constante** sobre bytes (XOR), no `===` de strings.
4. Secret solo vía `STRIPE_WEBHOOK_SECRET` (Workers Secret); 0 hardcoded.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| `stripe` npm en el Worker | Viola zero-dep edge / presupuesto de bundle |
| Solo validar timestamp sin HMAC | Viola invariante 6 |

## Consecuencias

- **Gana:** gate SEC-08 testeable (fuzz + replay) sin dependencia runtime.
- **Paga:** mint de firmas de test es código propio (solo `*.test.ts`).
- **Activación:** Sprint 3.

## Evidencia de cierre

- Tests: `verify-stripe-signature.test.ts` (fuzz ≥50); `handle-stripe-webhook.test.ts`
  (dedup, revoke, past_due, 503, timing).
- Runbook: [`docs/runbooks/stripe-webhook-failure.md`](../runbooks/stripe-webhook-failure.md) (ensayo = suite).
- Ledger: `id: 0199` (slice 1) · `0200` (ruta) · `0201` (cierre QG).
- Firmas RACI: `R` Staff Security · `A` Staff Principal · `V` Staff SRE.

## Checklist Quality Gate Sprint 3

| # | Criterio | Evidencia | Security | SRE |
|---|---|---|---|---|
| 1 | 100% firmas inválidas rechazadas (fuzz ≥50) | `verify-stripe-signature.test.ts` | Firmado | Firmado |
| 2 | Replay/dedup bloquea re-efecto (PROCESSED → 200) | `handle-stripe-webhook.test.ts` | Firmado | Firmado |
| 3 | Anti-replay `0 ≤ age ≤ 300` s | SEC-08 / verifyStripeSignature | Firmado | — |
| 4 | Invalidación E2E medida (unit <100 ms; staging en runbook) | timed test + runbook | Firmado | Firmado |
| 5 | past_due sin revoke DO (gracia) | test payment_failed | Firmado | Firmado |
| 6 | Runbook fallo webhook / secret / storm ensayado | [`docs/runbooks/stripe-webhook-failure.md`](../runbooks/stripe-webhook-failure.md) | Firmado | Firmado |
| 7 | 0 secretos en repo; `STRIPE_WEBHOOK_SECRET` solo binding | gitleaks / wrangler | Firmado | Firmado |
| 8 | `verify.sh` SUITE + `quality.sh` GREEN | CAL-01..08 | — | Firmado |

**Veredicto QG:** GO — revisión cruzada Staff Security + Staff SRE (2026-08-04).
