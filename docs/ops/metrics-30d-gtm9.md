---
doc_id: ops-metrics-30d-gtm9
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Informe 30 días — métricas GTM §9 (Sprint 16)

| Campo | Valor |
|---|---|
| Ventana | Día 0 Go → Día 30 |
| Fuentes | D1 `growth_events` · Owner dashboard · bench P95 |
| Relaciona | GTM §9 · Sprint 12 metrics · Roadmap Sprint 16 |

## Metas vs real

| Métrica | Meta | Real (30d) | Delta |
|---|---|---|---|
| TTFS p80 | &lt; 5 min | _pendiente ops_ | |
| Upgrade formalización 90d | — | _pendiente_ | |
| Trial → paid | — | _pendiente_ | |
| NRR proxy | — | n/d o medido | |
| K-factor | — | _pendiente_ | |
| P95 hot-path | &lt; 50 ms | Ver último `bench-sub50ms-sprint14.md` + staging | |

## Backlog priorizado (impacto medido)

1. Completar telemetría server-side TTFS en todos los tenants (no solo sessionStorage).
2. Cerrar A+V humanos del inventario ADR-0010.
3. Shard-DR game-day (Sprint 26) si error budget lo exige.
4. `/ayuda` centro de ayuda (stub residual).

## Decisión de cierre Sprint 16

- [ ] Staff PM + Staff SRE revisaron este informe y el postmortem.
- [ ] Backlog priorizado aceptado como input FASE 6+.
- Fecha decisión: ________
