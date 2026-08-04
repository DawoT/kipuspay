---
doc_id: roadmap-fase-6f
alias: Roadmap
authority: normativa
owner: "@DawoT"
fase: "6F"
sprints: "46–49"
---

### FASE 6F — Analítica Predictiva + Compliance + Inteligencia del Negocio (KipusPay v8.1, sprints 46–49)

> Respalda técnicamente el claim Cadena de "analítica predictiva" (GTM §4.1), cierra las obligaciones de datos (LPDP Perú y DR/BCP) y añade la capa de inteligencia del negocio (agente de insights + Morning Briefing) con pipeline determinista sobre D1. Detalle de entidades: Arquitectura §5.3 reglas 31–33. **Capabilities, no forks** (ADR-ARCH-002).

#### Sprint 46 — Analítica predictiva
**Capabilities:** `analytics.forecasting`  
**Referencia:** Arquitectura §5.3 regla 31; GTM §4.1 claim Cadena (congelado hasta este gate) · **Agentes:** Staff Data (owner), Staff Backend ACID, Staff PM, Staff Growth (gating)

**Entregables:**
- Modelo sobre `daily_product_rollups` (D1, exacto) + features de Analytics Engine; forecast ventas por sucursal/producto y detección de quiebre.
- `forecast_outputs` versionados (`model_version`); salida = **sugerencias** al Dueño (reposición, alertas) — nunca decisiones automáticas de precio/stock.
- Gated a plan **Cadena**; disclaimer en UI ("estimación, no garantía").

**Criterios de aceptación:** forecast no muta D1 de ventas ni stock; 0 acción automática sobre precio/inventario; métricas de precisión (MAPE) publicadas; gating Cadena respetado (plan inferior = 402 sin tocar arqueo).

**Quality Gate:** Staff Data (métricas) + Staff PM; Staff Growth **descongela** claim "analítica predictiva" en GTM §4.1 solo tras este gate.

---

#### Sprint 47 — LPDP (datos personales)
**Capabilities:** `compliance.lpdp`  
**Referencia:** Arquitectura §5.3 regla 32a; Ley N.º 29733 (Perú) · **Agentes:** Staff Security (owner), Staff Data, Staff Mobile (push), Staff Growth (copy)

**Entregables:**
- Inventario de PII (clientes: nombre, email, teléfono, dirección, RUC/DNI); `consent_records` por propósito (reusa opt-in Sprint 24).
- Derechos: export (reusa Sprint 42) y **borrado/anonimización** (`customers.pii_erased`); los doc fiscales se retienen (SUNAT ~5 años) pero se **anonimizan** en su vínculo a persona.
- Runbook DPO y copy legal en GTM (no jerga).

**Criterios de aceptación:** 0 PII sin consentimiento donde aplica; borrado anonimiza vínculo sin romper integridad fiscal; export incluye PII del cliente; simulacro de solicitud LPDP completado.

**Quality Gate:** Staff Security + Staff Principal; Staff Growth publica política de privacidad solo tras gate.

---

#### Sprint 48 — DR/BCP
**Capabilities:** `platform.dr`  
**Referencia:** Arquitectura §5.3 regla 32b; Sprint 14 (caos) · **Agentes:** Staff SRE (owner), Staff Backend ACID, Staff Principal

**Entregables:**
- Objetivos: **RPO=0** en tx ACID comprometidas, **RPO≤1d** en rollups, **RTO** objetivo por shard con replay de colas.
- Backups versionados (Sprint 42) con **restauración probada**; multi-región; simulacro anual (`DR_SIMULATION` en audit).
- Runbook de recuperación ensayado en staging (extiende Sprint 14).

**Criterios de aceptación:** simulacro sin pérdida de tx comprometidas; restauración dentro del RTO declarado; colas replays sin duplicar efectos; 0 datos de rollup irreparables (>1d).

**Quality Gate:** Staff Principal + Staff SRE; runbook actualizado y firmado.

---

#### Sprint 49 — Inteligencia del negocio (Agente de insights + Morning Briefing)
**Capabilities:** `analytics.agentic_insights`  
**Referencia:** Arquitectura §5.3 regla 33; D1 como única calculadora (Principio 9); GTM §4.1 claim Cadena/Enterprise (congelado hasta este gate) · **Agentes:** Staff Data (owner), Staff Security, Staff Frontend (SSE/UI), Staff QA, Staff Growth (gating)

**Entregables:**
- **Pipeline determinista:** router de intención (LLM ligero, acciones whitelist) → Text-to-SQL (schema estricto, parametrizado, sin concatenar texto del LLM) → `SELECT` en **D1** → NLG server-side con **hechos tipados verbatim** + **post-check determinista anti-alucinación** → respuesta por **SSE** (P95 <2s). **Validación de memoria (edge A):** el validador del schema inyecta **`LIMIT 50`** forzoso y agrega (`GROUP BY`) listas amplias; respuesta *"datos muy amplios para el chat → descarga el Excel"*; sin materializar listados grandes en el isolate.
- **Morning Briefing proactivo:** cron 3:30 AM post `buildDailySummaryCron`; 3 viñetas (ventas, quiebre, excepciones de caja) cacheadas en **KV** `insights:{tenant_id}:{fecha}` (lectura UI <10ms); chat para profundizar desde Modo Dueño/Admin. **Regenerable ante sync offline tardío (edge D):** re-materialización del rollup (§9) invalida la KV del briefing.
- **Idempotencia del chat (edge B):** `insight_idempotency_key` (UUID) por mensaje; reenvío tras corte de red devuelve la respuesta cacheada (KV `insights:{tenant_id}:{idem}`, TTL ~10 min) sin re-invocar al LLM; `ai_usage_counters` solo en el primer procesamiento.
- **Schema PII-free (edge C):** whitelist del Text-to-SQL **excluye** `email/phone/address/document_number`; expone `customer_id` + seudónimo; post-check que escanea `facts_json` y rechaza PII antes de la NLG (LPDP, regla 32).
- **Metering:** `ai_usage_counters` por tenant/día (queries + tokens) con cupo diario y rate limit; excedente facturado por el modelo de sobregiro (§4.1); `insight_log` append-only (query SQL + hechos + texto + `model_version`) para auditoría.

**Criterios de aceptación:** 0 discrepancias numéricas entre el texto NLG y los hechos D1 en 500 casos (Staff QA, anti-alucinación); 0 fuga de datos entre tenants en suite multi-tenant (tenant_id del JWT forzado en `WHERE`, jamás del prompt); P95 <2s en chat SSE y <10ms en lectura de briefing KV; gating Cadena/Enterprise respetado; 0 datos cacheados stale presentados como en vivo (banner de briefing); **límite de memoria (edge A): consulta simulada de 100k filas → el validador fuerza `LIMIT 50`/agregación, 0 OOM del isolate, respuesta "demasiado amplio → descarga el Excel"**; **benchmark gama baja (R-02): ningún sprint de FASE 6F/6G se cierra sin pasar la suite de estrés en emulador Android con 1 GB de RAM disponible — re-materialización de rollup tardío (edge D) + reconciliación de cola concurrentes sin `QuotaExceededError` ni pérdida de ventas**; **idempotencia (edge B): reenvío con la misma `insight_idempotency_key` tras corte de red → respuesta cacheada sin re-invocar al LLM y `ai_usage_counters` sin incremento extra (0 doble cobro)**; **schema PII-free (edge C): suite de prompts adversos de PII ("¿quién es mi mejor cliente?", "dame correos") → 0 `email`/`phone`/`address`/`document_number` en `facts_json` ni en la respuesta (seudónimo + `customer_id`)**.

**Quality Gate:** Staff Data (0 discrepancias) + Staff Security (multi-tenant) + Staff QA; Staff Growth **descongela** claim "El único POS que viene con un Gerente de Operaciones incluido" en GTM §4.1 solo tras este gate; Staff Principal aprueba el cierre según RACI.

---

