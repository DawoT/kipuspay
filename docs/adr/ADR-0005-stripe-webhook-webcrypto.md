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

- Tests: `verify-stripe-signature.test.ts` (fuzz ≥50).
- Ledger: `id: 0199` (slice 1) · cierre QG en `0201`.
- Firmas RACI: `R` Staff Security · `A` Staff Principal · `V` Staff SRE.
