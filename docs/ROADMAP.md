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


| FASE  | Alcance                                                              | Sprints | Archivo                                    |
| ----- | -------------------------------------------------------------------- | ------- | ------------------------------------------ |
| 0     | Fundación y Gobernanza del Escuadrón                                 | 0       | `[roadmap/fase-0.md](roadmap/fase-0.md)`   |
| 1     | Núcleo Transaccional y Confianza de Datos                            | 1–4     | `[roadmap/fase-1.md](roadmap/fase-1.md)`   |
| 2Team | Cumplimiento Fiscal y Resiliencia de Red                             | 5–6     | `[roadmap/fase-2.md](roadmap/fase-2.md)`   |
| 3     | Experiencia de Producto Premium                                      | 7–9     | `[roadmap/fase-3.md](roadmap/fase-3.md)`   |
| 4     | Salida al Mercado                                                    | 10–13   | `[roadmap/fase-4.md](roadmap/fase-4.md)`   |
| 5     | Hardening, Cumplimiento y Lanzamiento                                | 14–16   | `[roadmap/fase-5.md](roadmap/fase-5.md)`   |
| 6     | Motor de Operación Comercial (v8.1)                                  | 17–20   | `[roadmap/fase-6.md](roadmap/fase-6.md)`   |
| 7     | Ecosistema Perú (v9)                                                 | 21–24   | `[roadmap/fase-7.md](roadmap/fase-7.md)`   |
| 8     | Blindaje v8.2 (resiliencia, costo marginal, cliente zero-dependency) | 25–27   | `[roadmap/fase-8.md](roadmap/fase-8.md)`   |
| 6B    | Profundidad Retail                                                   | 28–32   | `[roadmap/fase-6b.md](roadmap/fase-6b.md)` |
| 6C    | Cierre Comercial                                                     | 33–37   | `[roadmap/fase-6c.md](roadmap/fase-6c.md)` |
| 6D    | Inventario Avanzado                                                  | 38–42   | `[roadmap/fase-6d.md](roadmap/fase-6d.md)` |
| 6E    | Servicios y Fuerza de Venta                                          | 43–45   | `[roadmap/fase-6e.md](roadmap/fase-6e.md)` |
| 6F    | Analítica Predictiva, Compliance e Inteligencia del Negocio          | 46–49   | `[roadmap/fase-6f.md](roadmap/fase-6f.md)` |
| 6G    | Flujo del Cliente                                                    | 50–53   | `[roadmap/fase-6g.md](roadmap/fase-6g.md)` |
| 6H    | Remediación y Sello QA (auditoría browser)                           | 54–59   | `[ops/browser-functional-audit.md](ops/browser-functional-audit.md)` |
| FL    | Facturador Live (CPE fail-closed + CDR; GRE/02/20 después)           | FL-0–FL-5 | `[roadmap/fase-fiscal-live.md](roadmap/fase-fiscal-live.md)` |




### Estado de especificación por sprint

> Tracker del staff PM: `Especificación` = nivel de detalle del sprint en este documento; `Entrega` = avance de implementación (el DoD §7 se cierra solo con changelog + evidencia).


| Sprint | FASE | Especificación                                                                                              | Entrega                                         |
| ------ | ---- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 0      | 0    | Actualizada (ADR-0001, CAL-01..08, monorepo, D1 humo)                                                       | Cerrado                                         |
| 1      | 1    | Actualizada (M1 dinero cents, §5.0 / §5.5 migraciones)                                                      | Cerrado                                         |
| 2      | 1    | Actualizada (auth fail-closed, plan guard, IdP — §3)                                                        | Cerrado                                         |
| 3      | 1    | Actualizada (webhooks pasarela + invalidación — §4)                                                         | Cerrado                                         |
| 4      | 1    | Actualizada (motor ACID + reconciliación — §6)                                                              | Cerrado                                         |
| 5      | 2    | Actualizada (Motor Fiscal Dual + ADR-FISCAL-001 v2)                                                         | Cerrado                                         |
| 5b     | 2    | Actualizada (Resumen Diario, plazos, baja y alertas)                                                        | Cerrado                                         |
| 6      | 2    | Actualizada (P4 CRM LWW + dedup SYN-11 enmendada + edge D rollup)                                           | Cerrado                                         |
| 7      | 3    | Actualizada (caja por modo + plantillas CPE/NV + Vitrina + print 58/80)                                     | Cerrado                                         |
| 8      | 3    | Actualizada (ledger CxC/CxP/OC/egresos + Modo Dueño + offline rollup + owner.push_alerts; GTM-03/11 freeze) | Cerrado                                         |
| 9      | 3    | Actualizada (M3 rollups §9 + cron multi-shard + catálogo CSV + GTM-03/11 unfreeze)                          | Cerrado                                         |
| 10     | 4    | Actualizada (sitio marketing + 5 landings + /comparar + claim-gate GTM)                                     | Cerrado                                         |
| 11     | 4    | Actualizada (precios §4.1 + onboarding §6.2 + Admin Config §3.3.1 + primera venta)                          | Cerrado                                         |
| 12     | 4    | Actualizada (referidos §7.1 + marca POS §7.2 + casos/blog §7.3 + métricas §9)                               | Cerrado                                         |
| 13     | 4    | Actualizada (seguridad §5.7.1 + guion §8 + support_sla_enterprise / GTM-02)                                 | Cerrado                                         |
| 14     | 5    | Actualizada (carga + caos evidencia + auditoría seguridad)                                                  | Cerrado                                         |
| 15     | 5    | Actualizada (WCAG AA + marca + rollback + Go/No-Go)                                                         | Cerrado                                         |
| 16     | 5    | Actualizada (estabilización 30d + métricas reales GTM §9)                                                   | En progreso                                     |
| 17     | 6    | Actualizada (M6/M7 caja dura + audit)                                                                       | Cerrado                                         |
| 18     | 6    | Actualizada (M2/M4/M5 PMP + stock)                                                                          | Cerrado                                         |
| 19     | 6    | Actualizada (comandas / KDS / split bill)                                                                   | Cerrado                                         |
| 20     | 6    | Actualizada (transferencias + recepción OC parcial)                                                         | Cerrado                                         |
| 21     | 7    | Actualizada (importadores Bsale/Alegra/CSV, dry-run→commit idempotente, external_entity_map)                | Cerrado                                         |
| 22     | 7    | Actualizada (cobro local Yape/Plin/MP/Culqi/Niubiz)                                                         | Cerrado                                         |
| 23     | 7    | Actualizada (Contasis/Concar + API keys/webhooks Cadena+)                                                   | Cerrado                                         |
| 24     | 7    | Base (WhatsApp/loyalty)                                                                                     | Cerrado                                         |
| 25     | 8    | Actualizada (P3 print outbox §7.5 + pos_terminals config 58/80mm)                                           | Cerrado                                         |
| 26     | 8    | Actualizada (P1 breaker §8.1)                                                                               | Cerrado                                         |
| 27     | 8    | Actualizada (P2 cupo §4.1)                                                                                  | Cerrado                                         |
| 28     | 6B   | Actualizada (sales.returns + GTM-05)                                                                        | Cerrado                                         |
| 29     | 6B   | Actualizada (purchasing.three_way + GTM-13)                                                                 | Cerrado                                         |
| 30     | 6B   | Actualizada (pricing.promotions + GTM-15)                                                                   | Cerrado                                         |
| 31     | 6B   | Actualizada (catalog.variants/uom + GTM-16)                                                                 | Cerrado                                         |
| 32     | 6B   | Actualizada (sales.layaway + ledger.chart_of_accounts + GTM-14/17)                                          | Cerrado                                         |
| 33     | 6C   | Actualizada (sales.quotes + GTM-19)                                                                         | Cerrado                                         |
| 34     | 6C   | Actualizada (purchasing.returns + GTM-20)                                                                   | Cerrado                                         |
| 35     | 6C   | Actualizada (ledger.store_credit + GTM-21)                                                                  | Cerrado                                         |
| 36     | 6C   | Actualizada (sales.installments + GTM-22)                                                                   | Cerrado                                         |
| 37     | 6C   | Actualizada (sales.commissions + GTM-23)                                                                    | Cerrado                                         |
| 38     | 6D   | Actualizada (inventory.locations + ADR-0022 + GTM-17 parcial)                                               | Cerrado                                         |
| 39–42  | 6D   | Actualizada (FASE 6D reglas 24–27)                                                                          | Cerrado (QG s39–s42; ledgers 0423–0430)                       |
| 43–45  | 6E   | Actualizada (S43–S44 GREEN local condicionado; S45 regla 30 en §5.12 + ADR-0029 + GTM-26)                  | Software GREEN local; QG `docs/ops/s43-customer-orders-qg.md`; claim/producción NO-GO hasta go-live externo; sellos batch G/H (ledgers 0431–0432) |
| 46     | 6F   | Actualizada (Sprint 46 regla 31 — forecasting; ADR-0030; GTM-01 descongelado)                              | Software GREEN local; QG `docs/ops/s46-forecasting-qg.md`; producción/piloto NO-GO; sello batch F (ledger 0429) |
| 47     | 6F   | Actualizada (Sprint 47 regla 32a — LPDP; ADR-0031; GTM-09 descongelado)                                    | Software GREEN local; QG `docs/ops/s47-lpdp-qg.md`; producción/piloto NO-GO; LPDP admin sellado (batch H, ledger 0432); self-serve titular en fase de cierre C3 |
| 48     | 6F   | Actualizada (Sprint 48 regla 32b — DR/BCP)                                                                  | Software GREEN local (backup S42); restauración/simulacro en fase de cierre C4 |
| 49     | 6F   | Actualizada (Sprint 49 regla 33 — agentic insights + PERF-12 réplica)                                       | Software GREEN local; QG `docs/ops/s49-insights-qg.md`; sellado (batch F, ledger 0429); producción NO-GO |
| 50–53  | 6G   | Actualizada (FASE 6G reglas 34–37 — flujo del cliente)                                                      | Cerrado (QG s50–s53; sellos batches A–E, ledgers 0422–0428) |
| 54–59  | 6H   | Actualizada (Fase 6H — Remediación y Sello QA; `docs/ops/browser-functional-audit.md`)                      | Cerrado (ledgers 0407–0434; QG `docs/ops/6h-remediation-qg.md`) |
| FL-0   | FL   | Actualizada (fail-closed transporte/drain/UI; ADR-FISCAL-008)                                               | Software GREEN local; QG `docs/ops/fl-fiscal-live-qg.md`; GTM-08 WAIT |
| FL-1   | FL   | Actualizada (piloto e-beta = runbook S11+S12)                                                               | WAIT A (pass CDT, flags runtime); flags git 0 |
| FL-2   | FL   | Actualizada (PSE HTTP acreditado)                                                                           | WAIT A (URL HTTPS ≠ `.invalid`) |
| FL-3   | FL   | Actualizada (NC/ND + RC en canal acreditado)                                                                | WAIT canal FL-2; software GREEN |
| FL-4   | FL   | Actualizada (pack GTM-08 + T6 opt-in)                                                                       | WAIT firmas A+V; no descongelar GTM-08 |
| FL-5   | FL   | Actualizada (UBL GRE 31 / 02 / 20 + outbox; detracción NO-GO banco)                                         | Software GREEN local; flags git 0; claims Cadena WAIT |
| C1–C5  | Cierre | Fase de cierre del proyecto: doctrina de claims, KDS/salón/split UI, LPDP self-serve, DR interno, sello final | Planificado (ledgers 0435–0439)                               |
| Go-live | Cierre | Staging Cloudflare real, sandbox SUNAT, Android físico, FCM/VAPID, impresoras — paquete por QG s41–s49      | Agenda al final (`pending-batches.yaml` bloque go-live)        |


---

