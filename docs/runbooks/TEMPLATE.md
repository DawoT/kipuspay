---
doc_id: runbook-template
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Runbook — Título del incidente o procedimiento

| Campo | Valor |
|---|---|
| Severidad tipica | SEV-1 / SEV-2 / SEV-3 |
| Owner on-call | Staff SRE / … |
| Ultima ensayada | YYYY-MM-DD (staging) |
| Relaciona | Arquitectura §N · ADR-… · Proceso §9.1 |

## Sintomas

Qué ve el operador o el dashboard (métrica, código HTTP, log).

## Impacto

Quién pierde qué (caja, CPE, Modo Dueño, billing). ¿La venta sigue abierta?

## Diagnóstico rápido (<5 min)

1. …
2. …

## Mitigación

Pasos ordenados y reversibles. Preferir feature flag / degradación antes que
deploy de emergencia.

1. …
2. …

## Rollback

Cómo volver al estado anterior y cómo verificar que volvió.

## Escalamiento

| Condición | Escalar a |
|---|---|
| … | Staff Principal + owner de dominio |

## Postmortem

- Entrada de ledger (tipo Corrección / incidente): `id: ____`
- Acción preventiva con sprint owner: …
