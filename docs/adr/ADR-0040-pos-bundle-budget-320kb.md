---
doc_id: adr-0040-pos-bundle-budget-320kb
alias: "—"
authority: normativa
owner: "@DawoT"
title: Presupuesto gzip del POS en 320 kB
status: accepted
date: 2026-09-16
---

# ADR-0040 — Presupuesto gzip del POS en 320 kB

## Contexto

El POS sigue siendo zero-dependency para render y mantiene el control V-24 de
dependencias runtime. La migración de gates globales a capabilities por tenant,
los módulos de verticales y la resolución de sesión elevaron el artefacto real a
313.52 kB gzip. El límite anterior de 310 kB bloqueaba `scripts/quality.sh` aun
cuando no se añadió una dependencia runtime nueva.

## Decisión

Se re-baselinea el presupuesto de `apps/pos-web` a **320 kB gzip**. El módulo
puro `@kipuspay/domain-fuel` queda autorizado en el baseline para que el cliente
y el servidor compartan el cálculo de importes sin crear un motor vertical
paralelo; no introduce red, persistencia ni renderizado. El cambio no relaja la
exigencia de zero-dependency runtime para librerías externas.

## Justificación y control

320 kB deja 6.48 kB de margen sobre la medición actual y evita convertir cada
ajuste legítimo de capability/UI en una excepción manual. El límite se revisará
si el artefacto supera 90% del presupuesto (288 kB), o si se incorpora una
dependencia runtime; en ese caso se requiere otro ADR y evidencia de impacto.

Evidencia de activación:

- `apps/pos-web/size-limit.config.js` declara `320 kB`.
- `scripts/checks/bundle_budget.py` mide el artefacto gzip y mantiene el control
  de dependencias.
- `pnpm --filter @kipuspay/pos-web bundle` debe terminar GREEN.
