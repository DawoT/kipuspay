---
doc_id: runbook-pos-checkout-print-vitrina
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Runbook — POS checkout, plantillas CPE/NV y Vitrina

| Campo | Valor |
|---|---|
| Severidad tipica | SEV-2 (caja bloqueada por flag/guard) / SEV-3 (print preview) |
| Owner on-call | Staff Frontend |
| Ultima ensayada | 2026-08-04 (local quality) |
| Relaciona | Arquitectura §10 · §5.2 · GTM §6.5 · Sprint 7 |

## Sintomas

- Home muestra "Caja desactivada (FEATURE_POS_CHECKOUT off)".
- Cobro bloqueado con `BOLETA_ID_REQUIRED` / `CPE_BLOCKED_INTERNAL_CONTROL`.
- Vitrina en `/vitrina` sin updates.
- Chaos `low-end-device` RED en quality 4e.
- Ticket sin leyenda NV/CPE o ancho incorrecto.

## Impacto

Sin checkout no hay cobro UI (cola offline S6 sigue disponible vía API). Print/Vitrina son superficies; no tumba sync.

## Diagnóstico rápido (<5 min)

1. Flags: `FEATURE_POS_CHECKOUT`, `FEATURE_PRINT_TEMPLATES`, `FEATURE_VITRINA` (Worker vars + `PUBLIC_*` en pos-web build). Default `0`.
2. Guards: dominio `assertEmissionAllowed` — boleta ≥ S/700 exige DNI+nombre; INTERNAL_CONTROL bloquea CPE.
3. Cola: IndexedDB `offline/{offlineSaleId}` tras cobro (cero spinner de red).
4. Print: `resolveLineWidth(58)=32`, `(80)=48`; leyendas en `@kipuspay/print-templates`.
5. Vitrina: canal `kipuspay-vitrina` (BroadcastChannel).
6. Correlativo: reserva local tentativa; número server gana en reconcile.

## Mitigación

1. Activar flags solo en canary.
2. Si bloqueo ≥700: pedir documento al cajero — no bypass.
3. Print fallido: reintentar `window.print` / HTML; ladder USB/WSS = Sprint 25.
4. Low-end: liberar memoria/cuota (S6 guardian); no borrar cola.

## Rollback

1. `FEATURE_POS_CHECKOUT=0` (y PUBLIC_*) → UI demo.
2. `FEATURE_VITRINA=0` / `FEATURE_PRINT_TEMPLATES=0`.
3. Verificar: `scripts/verify.sh` + `scripts/quality.sh` (step 4e).

## Escalamiento

| Condición | Escalar a |
|---|---|
| Leyendas fiscales incorrectas | Staff Fiscal |
| Pérdida cola under low-end | Staff QA/Chaos + Frontend Offline-First |
| Bypass de guards en UI | Staff Fiscal + Backend ACID |

## Checklist QG GTM §6.5 (Design)

- [ ] Cobro crítico sin spinner bloqueante de red
- [ ] Banner formalización visible
- [ ] Mensajes de error accionables (boleta ≥700, CPE bloqueado)
- [ ] Empty cart / blocked states claros
- [ ] Vitrina no bloquea caja

## Postmortem

- Entrada de ledger (cierre QG): `id: 0222`
- Frontera: print ladder/outbox → Sprint 25
