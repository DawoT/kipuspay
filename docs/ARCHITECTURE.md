---
doc_id: architecture
alias: Arquitectura
authority: normativa
owner: "@DawoT"
---

# **Arquitectura Técnica: POS & Facturación Electrónica Multitenant Edge-Native (SUNAT) - Versión 8.0 "KipusPay" (Enterprise ERP, Global SaaS & Financial Integrity Engine)**

> **Codename interno:** *KipusPay*. Cada tenant es un mundo que el sistema sostiene sin que lo sienta caer.

## Mapa de capítulos

> Abre **solo** el capítulo que tu tarea necesita. `INDEX.md` traduce capability,
> regla, tabla y puerto a su archivo; cargar la especificación completa quema el
> contexto que necesitas para razonar (AGENTS.md, ruta de lectura).

| § | Capítulo | Archivo | Líneas |
|---|---|---|---|
| §0 | Identidad de marca y posicionamiento | [`architecture/00-brand-positioning.md`](architecture/00-brand-positioning.md) | 46 |
| §1 | Principios de diseño e ingeniería | [`architecture/01-principles.md`](architecture/01-principles.md) | 194 |
| §2 | Diagrama de arquitectura global | [`architecture/02-global-diagram.md`](architecture/02-global-diagram.md) | 52 |
| §3 | Auth (IdP Sync) y SaaS Plan Enforcement | [`architecture/03-auth-plan-enforcement.md`](architecture/03-auth-plan-enforcement.md) | 232 |
| §4 | Webhooks de pago, medición de uso y sobregiro | [`architecture/04-webhooks-metering.md`](architecture/04-webhooks-metering.md) | 229 |
| §5 | DDL: convenciones de dinero y aislamiento tenant | [`architecture/05-ddl-conventions.md`](architecture/05-ddl-conventions.md) | 39 |
| §5.1 | Formalización progresiva y matriz régimen × documento | [`architecture/05-1-formalization-matrix.md`](architecture/05-1-formalization-matrix.md) | 38 |
| §5.2 | Pipeline de envío fiscal | [`architecture/05-2-fiscal-pipeline.md`](architecture/05-2-fiscal-pipeline.md) | 21 |
| §5.3 | Operación comercial: caja, inventario y comandas | [`architecture/05-3-commercial-ops.md`](architecture/05-3-commercial-ops.md) | 960 |
| §5.4 | Ecosistema Perú: puertos de integración | [`architecture/05-4-ecosystem-ports.md`](architecture/05-4-ecosystem-ports.md) | 155 |
| §5.5 | DDL base v8.0 (104 tablas) | [`architecture/05-5-ddl-base.md`](architecture/05-5-ddl-base.md) | 540 |
| §5.6 | Identidad serial, historial y asignación offline | [`architecture/05-6-inventory-serials.md`](architecture/05-6-inventory-serials.md) | 139 |
| §5.7 | Peso variable, transporte de balanza y reconciliación | [`architecture/05-7-inventory-scale.md`](architecture/05-7-inventory-scale.md) | 159 |
| §5.8 | Etiquetas de precio, snapshots y transporte | [`architecture/05-8-catalog-price-labels.md`](architecture/05-8-catalog-price-labels.md) | 167 |
| §5.9 | Backup total, formato KPBK1 y restore dry-run | [`architecture/05-9-data-backup.md`](architecture/05-9-data-backup.md) | 299 |
| §5.10 | Pedidos de cliente, reserva y fulfillment | [`architecture/05-10-customer-orders.md`](architecture/05-10-customer-orders.md) | 307 |
| §5.11 | Ventas recurrentes, membresías y prorrateo | [`architecture/05-11-recurring-sales.md`](architecture/05-11-recurring-sales.md) | 316 |
| §6 | Motor de transacciones ACID y reconciliación | [`architecture/06-acid-engine.md`](architecture/06-acid-engine.md) | 787 |
| §7 | Chunked Sync Dispatcher y descarga computacional | [`architecture/07-sync-offloading.md`](architecture/07-sync-offloading.md) | 145 |
| §8 | NC/ND, baja, devoluciones y DLQ fiscal | [`architecture/08-credit-notes-dlq.md`](architecture/08-credit-notes-dlq.md) | 115 |
| §9 | Capa de reportes: rollups D1 y Analytics Engine | [`architecture/09-reporting.md`](architecture/09-reporting.md) | 176 |
| §10 | Impresión adaptativa y Modo Vitrina | [`architecture/10-printing-display.md`](architecture/10-printing-display.md) | 76 |
| §11 | Matriz comparativa de mercado | [`architecture/11-market-matrix.md`](architecture/11-market-matrix.md) | 26 |
| §12 | Costo operativo y performance estimado | [`architecture/12-cost-performance.md`](architecture/12-cost-performance.md) | 24 |
| §13 | Calidad de implementación: toolchain Staff y presupuestos | [`architecture/13-implementation-quality.md`](architecture/13-implementation-quality.md) | 129 |

### **0.4 Registry de Reglas (punteros canónicos)**

El **único** lugar donde cada regla se define es la sección indicada en esta tabla (DRY de dominio, §1.1). Cualquier doc que la referencie usa el puntero `§` correspondiente. Crear/alterar una regla = actualizar esta tabla + definirla **una vez**; nunca crear IDs huérfanos (validado mecánicamente por el check V-08 de `scripts/verify.sh`; procedimiento en el skill `kipus-rules-registry`).

| ID | Definición canónica | Tema |
|---|---|---|
| SEC-01 | §3 | Identidad SOLO desde JWT verificado |
| SEC-02 | §6 | Re-validación server-side por ítem; descuentos/sobreprecios y umbrales |
| SEC-03 | §3 | Gestión de secretos; PIN argon2id server-side |
| SEC-04 | §4.0 | Política de seguridad transversal |
| SEC-05 | §6 | Correlativo emitido por el servidor |
| SEC-06 | §6 | Ventana de skew única ±6h |
| SEC-07 | §6 | Filas PII anonimizadas/borradas (`pii_erased`/`deleted_at`) |
| SEC-08 | §4 | Dedup, anti-replay ≤5 min, comparación constante en tiempo |
| SEC-09 | §5.3 | Zero-Trust de caja |
| SEC-10 | §5.3 | DDL zero-trust (lockout PIN) |
| SEC-11 | §4.0 | PIN de caja: lockout 5 fallos/15 min |
| SEC-12 | §5.4 | DDL ecosistema v9 |
| FIS-01 | §5.2/§5.3 (def. Ledger 0164) | `issued_date_lima` +3 días |
| FIS-02 | §6 | Estado SUNAT + deadline por tipo de documento |
| FIS-03 | §5.2 | RC por emisor (`tenant_id`+`summary_date`); corrección de RC boleta |
| FIS-07 | §5.4 | CHECKs DDL ecosistema |
| FIS-08 | §6 | Reglas de negocio del motor |
| FIS-10 | §6 | Reglas de negocio del motor |
| FIS-11 | §5.4 | DDL ecosistema v9 |
| FIS-12 | §6 | Reglas de negocio del motor |
| COM-01 | §5.3 (6B) | DDL profundidad retail |
| COM-02 | §5.4 | DDL ecosistema v9 |
| COM-03 | §5.3 (6B) | DDL profundidad retail |
| COM-04 | §5.3 (6B) | DDL profundidad retail |
| COM-05 | §5.10 | Precio congelado en pedidos de cliente (snapshot) |
| COM-06 | §5.3 (6C) | DDL cierre comercial |
| COM-07 | §5.3 (6B) | DDL profundidad retail |
| COM-08 | §5.3 (6B) | DDL profundidad retail |
| COM-09 | §5.10 | Pedido de cliente: reserva, aviso, fulfillment y DDL 0036 |
| COM-10 | §5.11 | Membresía: pricing versionado, calendario, settlement, gracia y prorrateo |
| COM-12 | §5.4 | DDL ecosistema v9 |
| DAT-01 | §5.4 | `branch_id TEXT NULL` en `sunat_daily_summaries` |
| DAT-02 | §6 | Estado SUNAT + deadline (compartida con FIS-02) |
| DAT-03 | §5.3 (def. Ledger 0165) | Versión v8.1 en comentario DDL |
| DAT-04 | §5.4 | CHECKs en `payment_captures`/`cash_register_sessions`/CxC/`sunat_daily_summaries` |
| DAT-05 | §6 | Pago a crédito → CxC en la misma tx |
| DAT-07 | §5.3 (6B) | Índices de venta/journal |
| DAT-09 | §5.0/§6 (def. Ledger 0165) | Redondeo server-side `Math.round(centavos)`, jamás `toFixed` |
| DAT-10 | §5.3 (def. Ledger 0165) | Ediciones acumulativas como "NOTA IMPORTANTE" |
| DAT-11 | §6 | Reuso de `sale_payments.id` (sin UUID huérfano) |
| PERF-01 | §6 | Hot path sin lecturas por ítem dentro del batch |
| PERF-02 | §5.4 | DDL ecosistema v9 |
| PERF-03 | §5.4 | DDL ecosistema v9 |
| PERF-04 | §3 | Caché de 2 niveles en auth path |
| PERF-05 | §5.4 | DDL ecosistema v9 |
| PERF-06 | §5.4 | DDL ecosistema v9 |
| PERF-07 | §6 | Upsert con `RETURNING id` |
| PERF-08 | §6 | Cupo por documento emitido, idempotente |
| PERF-09 | §5.4 | Pre-agregación de fuentes 1:N |
| PERF-10 | §6 | Cupo por documento emitido (compartida con PERF-08) |
| PERF-11 | §5.3 | Zero-Trust de caja |
| PERF-12 | §5.3 (6F) | Insights: réplica de lectura, `LIMIT 50`, NLG post-check |
| PERF-13 | §5.5 | Walk FIFO de la cola fiscal por (estado, deadline) |
| SYN-01 | §5.4 | DDL ecosistema v9 |
| SYN-02 | §6 | Correlativo emitido por servidor (compartida con SEC-05) |
| SYN-03 | §5.4 | DDL ecosistema v9 |
| SYN-04 | §6 | Ventana de skew única ±6h (compartida con SEC-06) |
| SYN-05 | §6 | FEFO/lotes re-validadas en la tx |
| SYN-06 | §6 | Política de oversell offline: venta aceptada jamás se pierde |
| SYN-07 | §7 | Chunked Sync Dispatcher (Service Worker) |
| SYN-08 | §6 | LWW en reloj de servidor |
| SYN-11 | §1 (Principio 10)/§5.2 | Consolidación de cliente single-writer + RC complementaria |
| SYN-12 | §6 | Contrato de atomicidad D1 |
| SYN-13 | §5.7 | Peso entero, heartbeat fail-closed y reconciliación autoritativa |
| ADR-ARCH-002 | §1.1 | Capability model vs `vertical_type` |
| DAT-12 | §5.0.1 | Aislamiento tenant: `tenant_id NOT NULL` + FK compuesta `(tenant_id, parent_id)` |
| ADR-FISCAL-001 | §5.1 | Decisiones fiscales cerradas |
| ADR-FISCAL-002 | §8.1 | Canal FiscalTransport + circuit breaker |
| LPDP-* | §5.3 (6F) | Privacidad (prefijo reservado; sin IDs emitidos aún) |
| CAL-01 | §13.3/§13.1 | Lint de invariantes: `db.transaction`, `toFixed`, `switch(vertical)`, `parseFloat` sobre dinero prohibidos (ESLint + Semgrep) |
| CAL-02 | §13.2 | TypeScript `strict` obligatorio en todo package/app del monorepo |
| CAL-03 | §13.4 | Cobertura mínima por capa: dominio/ACID ≥ 95%, adapters ≥ 70% |
| CAL-04 | §13.5 | Chaos adversarial por capa (red, cuota, memoria, shard/DO, concurrencia) antes del release |
| CAL-05 | §13.6 | SAST + secretos + dependencias: gitleaks, Semgrep, CodeQL, osv/pnpm audit |
| CAL-06 | §13.8 | Presupuesto de bundle en CI + cero dependencia npm runtime nueva sin ADR |
| CAL-07 | §13.9 | Evidencia TDD RED→GREEN con `red_commit_sha`/`red_run_id`/`green_*` en el ledger |
| CAL-08 | §13.3 | Complejidad ciclomática: hot path ≤ 12, resto ≤ 15 |

Las reglas definidas por corrección de ledger (`FIS-01`, `DAT-03`, `DAT-09`, `DAT-10`) conservan su definición histórica en la entrada indicada de `docs/LEDGER.md` (inmutable) y su efecto normativo en la sección canónica de la especificación.

