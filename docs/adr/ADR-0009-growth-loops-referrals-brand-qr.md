---
doc_id: adr-0009-growth-loops-referrals-brand-qr
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0009 — Growth loops: referidos 1+1, brand QR y métricas §9

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-05 |
| Decisores | Staff Principal (plan Sprint 12) |
| Consultados | Staff Growth, Staff Data, Staff Fiscal, Staff Frontend |
| Informados | Dirección de Producto |
| Relaciona | GTM §7 · GTM §9 · Roadmap Sprint 12 · Ledger (S12) · ADR-ARCH-002 |

## Contexto

Sprint 12 exige tres loops (referidos, marca en POS, contenido) más instrumentación GTM §9.
Hay tensión entre GTM §7.2 (“si el tenant lo habilita”) y el criterio de aceptación del roadmap
(“QR de marca en 100% de comprobantes emitidos”). También hay que elegir cómo aplicar
“un mes gratis” sin cupones Stripe complejos antes del Sprint 27.

## Decisión

1. **Atribución:** tablas `referral_codes` (1 código por tenant) y `referral_attributions`
   (`captured` → `qualified` → `credited`). Captura solo en signup (`/empezar?ref=` → bootstrap).
   Qualifying event = primera venta emitida del referred. Crédito bilateral **+30 días** sobre
   `trial_ends_at` (o extensión equivalente del periodo activo) vía `db.batch`, **idempotente**
   por `referral_attributions.id`. Anti-fraude: no self-ref; un referred no se re-atribuye.
2. **Brand QR:** flag tenant `brand_qr_enabled` default `1` (opt-out en Admin Config). CA “100%”
   = 100% de comprobantes emitidos con el flag on. Pie *"Emitido con KipusPay"* + URL
   `{MARKETING_ORIGIN}/empezar?ref={code}` **después** de leyendas fiscales (GTM-07 intacto).
   QR zero-dep (payload texto / ESC/POS nativo); sin npm QR.
3. **Dashboard §9:** SoT en D1 / funciones puras de agregación; superficie Owner (negocio).
   Analytics Engine solo si ya hay patrón de muestreo — no es SoT de dinero ni de K-factor.
4. **Capabilities:** `marketing.referrals`, `marketing.content`, `pos.brand_qr`,
   `analytics.growth_metrics` (sin forks por vertical).

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Cupones Stripe por referido | Complejidad billing antes de S27; GTM pide mes gratis simple |
| Brand QR default off (opt-in estricto) | Choca con CA “100% de comprobantes”; default-on + opt-out cumple ambos |
| Ruta marketing `/referidos` | No está en IA GTM §3.1; captura es `?ref=` + Owner |
| Testimonios sintéticos como claim vivo | Viola GTM-12 |

## Consecuencias

- **Gana:** loops medibles, atribución E2E sin gaps, tickets con marca sin riesgo fiscal.
- **Paga:** créditos = días de trial/periodo, no ledger de dinero de suscripción Stripe.
- **Invariantes:** zero-dep cliente; D1 batch; ledger append-only; ADR-ARCH-002.
- **Activación:** Sprint 12; evidencia en ledger de implementación.

## Evidencia de cierre

- Tests: referrals, print brand footer, growth metrics, marketing cases/blog.
- Checks: `scripts/verify.sh` + `scripts/quality.sh`.
- Firmas RACI: Staff Data (§9) · Content (casos) · Growth (loops) · Fiscal (leyendas).
