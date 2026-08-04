---
doc_id: roadmap-fase-1
alias: Roadmap
authority: normativa
owner: "@DawoT"
fase: "1"
sprints: "1–4"
---

### FASE 1 — Núcleo Transaccional y Confianza de Datos

#### Sprint 1 — Esquema de Datos, Multi-Sucursal, Formalización y Sharding Dinámico
**Referencia:** Arquitectura §5, §5.1, §5.2 · **Agentes:** Staff Backend Datos (owner), Staff Principal (revisor), Staff Security (auditor), Staff Fiscal (consultado)

**Entregables:** DDL completo incl. `tenants` (`tax_regime`, `formalization_mode`, `pse_mode`, cert status, docs habilitados); `branch_document_series` (**series por sucursal**, no por caja) con `authorization_status`; `sales` con `must_submit_by`, `void_status`, `issued_at_lima`, `daily_summary_id`, hash/QR; `sunat_daily_summaries`; `sale_items.igv_affectation_code`; `products.charges_icbper`; docs `NV`/`NV_RETURN`/`01`/`03`/`07`/`08`; migraciones en `packages/adapters-d1/migrations/` (`0000_schema_meta`, `0001_ddl_base_v8`) + downs en `migrations-down/`; router tenant→shard (`resolveShardId`). **Convención de dinero (v8.1, §5.0):** todo monto como `INTEGER` cents (`*_cents`); cero columnas monetarias `REAL`.

**Criterios de aceptación:** 0 FKs huérfanas; índices únicos parciales OK; `ruc` nullable; correlativo único por tenant+branch+tipo+serie+número; migraciones up/down en CI (pool-workers); **grep de regresión: 0 columnas monetarias `REAL` en el DDL**.

**Quality Gate:** [ADR-0002](../adr/ADR-0002-schema-d1-base.md) firmado por Staff Principal + Staff Security + Staff Fiscal.

---

#### Sprint 2 — Middleware de Auth, Tenant Router y SaaS Plan Enforcement
**Referencia:** Arquitectura §3; GTM §4.1 y §4.3 · **Agentes:** Staff Security (owner), Staff SRE (colaborador), Staff PM (revisor de negocio)

**Entregables:** `tenantAndAuthMiddleware`, Fail-Closed DO Guard (503 si no puede comprobar revocación), Plan & Trial Guard (HTTP 402 **solo en endpoints de features premium**), sincronización con IdP.

**Criterios de aceptación:** revocación de tenant verificada en pruebas de carga sobre Durable Objects; caída simulada de KV/DO responde 503 en rutas protegidas y nunca autoriza por falta de verificación; 100% de rutas protegidas cubiertas por test de autorización negativa; **ningún endpoint de cobro / apertura de caja / emisión de comprobante responde 402 por límite de plan** — el Plan Guard degrada Modo Dueño, multi-caja, reportes avanzados o API, nunca la capacidad de vender (GTM §4.1).

**Quality Gate:** checklist OWASP ASVS Nivel 2 aprobado; 0 secretos hardcoded confirmados por escaneo automatizado; Staff PM firma que el enforcement no contradice la promesa "el POS que no se cae".

---

#### Sprint 3 — Webhooks de Pasarela de Pago e Invalidación Criptográfica
**Referencia:** Arquitectura §4 · **Agentes:** Staff Security (owner), Staff SRE (colaborador)

**Entregables:** `verifyStripeSignature` con WebCrypto, ventana anti-replay, actualización sincronizada de KV + Durable Object ante webhook de suspensión/reactivación.

**Criterios de aceptación:** 100% de firmas inválidas rechazadas en fuzz testing; simulación de ataque de replay bloqueada; tiempo de invalidación end-to-end medido y documentado.

**Quality Gate:** revisión cruzada de dos agentes Staff (Security + SRE); runbook de incident response para fallo de webhook ensayado.

---

#### Sprint 4 — Motor de Transacciones ACID y Reconciliación Autoritativa
**Referencia:** Arquitectura §6 · **Agentes:** Staff Backend ACID (owner), Staff QA/Chaos (colaborador), Staff Fiscal (colaborador)

**Entregables:** `processOfflineSaleAtomic` con preflight + `db.batch([...])` atómico y guards SQL; respuesta de reconciliación idempotente ante sync duplicado.

**Criterios de aceptación:** 0 condiciones de carrera de stock bajo escritura concurrente simulada; 100% de rollback correcto ante fallo inyectado a mitad de operación; reintentos duplicados de sync no generan efectos duplicados.

**Quality Gate:** Staff QA certifica la "Garantía Financiera ACID" con suite de chaos testing reproducible; ADR de concurrencia aprobado por Staff Principal.

---

