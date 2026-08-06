---
doc_id: roadmap
alias: Roadmap
authority: normativa
owner: "@DawoT"
---

## 10. Roadmap de Sprints

### Mapa de fases

> Una tarea de sprint abre **una** fase. El estado de especificación de cada sprint
> está más abajo; el puntero sprint → archivo también vive en `INDEX.md`.

| FASE | Alcance | Sprints | Archivo |
|---|---|---|---|
| 0 | Fundación y Gobernanza del Escuadrón | 0 | [`roadmap/fase-0.md`](roadmap/fase-0.md) |
| 1 | Núcleo Transaccional y Confianza de Datos | 1–4 | [`roadmap/fase-1.md`](roadmap/fase-1.md) |
| 2 | Cumplimiento Fiscal y Resiliencia de Red | 5–6 | [`roadmap/fase-2.md`](roadmap/fase-2.md) |
| 3 | Experiencia de Producto Premium | 7–9 | [`roadmap/fase-3.md`](roadmap/fase-3.md) |
| 4 | Salida al Mercado | 10–13 | [`roadmap/fase-4.md`](roadmap/fase-4.md) |
| 5 | Hardening, Cumplimiento y Lanzamiento | 14–16 | [`roadmap/fase-5.md`](roadmap/fase-5.md) |
| 6 | Motor de Operación Comercial (v8.1) | 17–20 | [`roadmap/fase-6.md`](roadmap/fase-6.md) |
| 7 | Ecosistema Perú (v9) | 21–24 | [`roadmap/fase-7.md`](roadmap/fase-7.md) |
| 8 | Blindaje v8.2 (resiliencia, costo marginal, cliente zero-dependency) | 25–27 | [`roadmap/fase-8.md`](roadmap/fase-8.md) |
| 6B | Profundidad Retail | 28–32 | [`roadmap/fase-6b.md`](roadmap/fase-6b.md) |
| 6C | Cierre Comercial | 33–37 | [`roadmap/fase-6c.md`](roadmap/fase-6c.md) |
| 6D | Inventario Avanzado | 38–42 | [`roadmap/fase-6d.md`](roadmap/fase-6d.md) |
| 6E | Servicios y Fuerza de Venta | 43–45 | [`roadmap/fase-6e.md`](roadmap/fase-6e.md) |
| 6F | Analítica Predictiva, Compliance e Inteligencia del Negocio | 46–49 | [`roadmap/fase-6f.md`](roadmap/fase-6f.md) |
| 6G | Flujo del Cliente | 50–53 | [`roadmap/fase-6g.md`](roadmap/fase-6g.md) |

### Estado de especificación por sprint

> Tracker del staff PM: `Especificación` = nivel de detalle del sprint en este documento; `Entrega` = avance de implementación (el DoD §7 se cierra solo con changelog + evidencia).

| Sprint | FASE | Especificación | Entrega |
|---|---|---|---|
| 0 | 0 | Actualizada (ADR-0001, CAL-01..08, monorepo, D1 humo) | Cerrado |
| 1 | 1 | Actualizada (M1 dinero cents, §5.0 / §5.5 migraciones) | Cerrado |
| 2 | 1 | Actualizada (auth fail-closed, plan guard, IdP — §3) | Cerrado |
| 3 | 1 | Actualizada (webhooks pasarela + invalidación — §4) | Cerrado |
| 4 | 1 | Actualizada (motor ACID + reconciliación — §6) | Cerrado |
| 5 | 2 | Actualizada (Motor Fiscal Dual + ADR-FISCAL-001 v2) | Cerrado |
| 5b | 2 | Actualizada (Resumen Diario, plazos, baja y alertas) | Cerrado |
| 6 | 2 | Actualizada (P4 CRM LWW + dedup SYN-11 enmendada + edge D rollup) | Cerrado |
| 7 | 3 | Actualizada (caja por modo + plantillas CPE/NV + Vitrina + print 58/80) | Cerrado |
| 8 | 3 | Actualizada (ledger CxC/CxP/OC/egresos + Modo Dueño + offline rollup + owner.push_alerts; GTM-03/11 freeze) | Cerrado |
| 9 | 3 | Actualizada (M3 rollups §9 + cron multi-shard + catálogo CSV + GTM-03/11 unfreeze) | Cerrado |
| 10 | 4 | Actualizada (sitio marketing + 5 landings + /comparar + claim-gate GTM) | Cerrado |
| 11 | 4 | Actualizada (precios §4.1 + onboarding §6.2 + Admin Config §3.3.1 + primera venta) | Cerrado |
| 12 | 4 | Actualizada (referidos §7.1 + marca POS §7.2 + casos/blog §7.3 + métricas §9) | Cerrado |
| 13 | 4 | Actualizada (seguridad §5.7.1 + guion §8 + support_sla_enterprise / GTM-02) | Cerrado |
| 14 | 5 | Actualizada (carga + caos evidencia + auditoría seguridad) | Cerrado |
| 15 | 5 | Actualizada (WCAG AA + marca + rollback + Go/No-Go) | Cerrado |
| 16 | 5 | Actualizada (estabilización 30d + métricas reales GTM §9) | En progreso |
| 17 | 6 | Actualizada (M6/M7 caja dura + audit) | Cerrado |
| 18 | 6 | Actualizada (M2/M4/M5 PMP + stock) | Cerrado |
| 19 | 6 | Actualizada (comandas / KDS / split bill) | Cerrado |
| 20 | 6 | Actualizada (transferencias + recepción OC parcial) | Cerrado |
| 21 | 7 | Actualizada (importadores Bsale/Alegra/CSV, dry-run→commit idempotente, external_entity_map) | Cerrado |
| 22 | 7 | Actualizada (cobro local Yape/Plin/MP/Culqi/Niubiz) | Cerrado |
| 23–24 | 7 | Base (API/export + WhatsApp/loyalty) | Planificado |
| 25 | 8 | Actualizada (P3 print outbox §7.5 + pos_terminals config 58/80mm) | Planificado |
| 26 | 8 | Actualizada (P1 breaker §8.1) | Planificado |
| 27 | 8 | Actualizada (P2 cupo §4.1) | Planificado |
| 28–32 | 6B | Actualizada (FASE 6B reglas 13–17 + COM pricing) | Planificado |
| 33–37 | 6C | Actualizada (FASE 6C reglas 18–22 + COM-05 pricing congelado) | Planificado |
| 38–42 | 6D | Actualizada (FASE 6D reglas 23–27) | Planificado |
| 43–45 | 6E | Actualizada (FASE 6E reglas 28–30 + COM-05 reserva/pricing) | Planificado |
| 46–48 | 6F | Actualizada (FASE 6F reglas 31–32) | Planificado |
| 49 | 6F | Actualizada (Sprint 49 regla 33 — agentic insights + PERF-12 réplica) | Planificado |
| 50–53 | 6G | Actualizada (FASE 6G reglas 34–37 — flujo del cliente) | Planificado |

---

