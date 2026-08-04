---
doc_id: ledger
alias: Ledger
authority: inmutable
owner: "@DawoT"
---

# Ledger — Registro Inmutable de Iteraciones (KipusPay)

> Changelog append-only del escuadrón. **Nunca editar ni borrar entradas; toda
> corrección se agrega como entrada nueva con `relacion: CORRIGE`.**
> Schema v2: `prev_id`/`prev_hash` desde 0174, `entry_hash` desde 0176; 0143-0173 = legacy sin hash chain.
> Contrato de escritura: Proceso §7.2.1. Usa el skill `kipus-changelog` para nuevas entradas.
> Las entradas 0143–0181 citan los paths previos a la reorganización (`Agents.md`,
> `Ledger.md`, el nombre largo de la especificación): son históricas y no se reescriben;
> la equivalencia con los paths actuales se declara en la entrada 0182.

**Regla canónica de hashing (schema v2):**
- `entry_hash` = SHA-256 de las líneas `id:` → `estado:` **inclusive**, **excluyendo** la línea `entry_hash` (y sin fences ni líneas en blanco separadoras).
- `prev_hash` = `entry_hash` de la entrada anterior (solo verificable cuando la previa tiene `entry_hash`; entradas 0143-0176 usaron convenciones previas no canónicas — se conservan como históricas).
- `verify.sh` valida: (1) cada `entry_hash` presente, (2) `prev_hash` == `entry_hash` previo a partir de 0177, (3) encadenado con `prev_id`.

---


```
id: 0143
timestamp_utc: 2026-08-03T00:00:00Z
sprint_fase: Sprint 26 — Fase 8 (Blindaje v8.2)
agente_responsable: Staff SRE / Staff Backend ACID
tipo: Entregable nuevo
entregable_afectado: Circuit breaker del canal fiscal (Arquitectura §8.1)
descripcion: >
  P1. Caché de 2 niveles (in-memory TTL 5-10s → KV 60s → DO solo
  escrituras; DO nunca en hot path) + incrementos coalescidos (~5s)
  con jitter. Criterio Sprint 26 actualizado: DO ≤ X lecturas/s bajo
  colapso SUNAT.
evidencia: revisión por pares + greps de consistencia (Sprint 26 criterio)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0144
timestamp_utc: 2026-08-03T00:00:00Z
sprint_fase: Sprint 27 — Fase 8 (Blindaje v8.2)
agente_responsable: Staff Backend ACID / Staff Growth
tipo: Entregable nuevo
entregable_afectado: Medición de uso y cupo por documento (Arquitectura §4.1)
descripcion: >
  P2. Tabla "Documentos que cuentan para cupo" (01/03/07/08/12/NV/NV_RETURN
  = +1; baja/RC ni suma ni resta; NC no reembolsa); NC handler doc_count+1;
  idempotency usage:{docId}; umbral S/700 → 70000. GTM §4.1 regla de cupo
  explícita para el cajero.
evidencia: greps de coherencia GTM/Arquitectura/Agents
aprobador: Staff Security + Staff Growth
estado: Vigente
```

```
id: 0145
timestamp_utc: 2026-08-03T00:00:00Z
sprint_fase: Sprint 25 — Fase 8 (Blindaje v8.2)
agente_responsable: Staff Frontend
tipo: Entregable nuevo
entregable_afectado: Print outbox persistida (Arquitectura §7.5)
descripcion: >
  P3. Outbox en IndexedDB print_jobs/{saleId} (payload del ticket + bytes
  ESC/POS + adaptador fallback pendiente); consumo por ACK; recompila si se
  pierden bytes; criterio F5 → el ticket sigue imprimible tras recarga.
evidencia: criterio de aceptación actualizado en Sprint 25
aprobador: Staff Hardware + Staff Principal
estado: Vigente
```

```
id: 0146
timestamp_utc: 2026-08-03T00:00:00Z
sprint_fase: Sprint 6 — Fase 2
agente_responsable: Staff Backend ACID
tipo: Entregable nuevo
entregable_afectado: Reconciliación CRM cliente (Arquitectura §6/§8.1)
descripcion: >
  P4. Eliminada deduplicación client-side (era no-op); OfflineSalePayload +
  clientEmail/Phone/Address/ProfileUpdatedAt; customers.profile_updated_at;
  upsert LWW con WHERE <= excluded.profile_updated_at; sales.client_name =
  snapshot histórico.
evidencia: DDL + payload interface verificados por grep
aprobador: Staff QA/Chaos
estado: Vigente
```

```
id: 0147
timestamp_utc: 2026-08-03T00:00:00Z
sprint_fase: Sprint 1 — Fase 0-1 (Núcleo Transaccional)
agente_responsable: Staff Backend Datos
tipo: Entregable nuevo
entregable_afectado: Esquema DDL v8.0 (convención de dinero)
descripcion: >
  M1. Toda columna monetaria renombrada a *_cents con INTEGER; nueva §5.0
  (convención obligatoria); Principio 8 enmendado; umbral de descuento
  S/700 → 70000 cents; redondeo de centavo en servidor (Math.round, nunca
  toFixed); criterio Sprint 1: 0 columnas monetarias REAL.
evidencia: rename_money.py (barrido) + grep 0 monetarias REAL
aprobador: Staff Backend ACID
estado: Vigente
```

```
id: 0148
timestamp_utc: 2026-08-03T00:00:00Z
sprint_fase: Sprint 18 — Fase 6 (Atlas v8.1)
agente_responsable: Staff Backend ACID
tipo: Entregable nuevo
entregable_afectado: PMP y control de inventario (Arquitectura §5.3)
descripcion: >
  M2/M4/M5. Reglas 9-11 + DDL v8.1: branch_stock_policies, inventory_counts,
  inventory_count_lines, stock_losses (merma con evidencia R2 y authz);
  refresh_avg_cost en misma tx; snapshot unit_cost_cents; arqueo por fórmula
  (opening + efectivo + ingresos − retiros − egresos).
evidencia: DDL verificado por grep + criterios Sprint 18
aprobador: Staff QA/Chaos + Staff Security
estado: Vigente
```

```
id: 0149
timestamp_utc: 2026-08-03T00:00:00Z
sprint_fase: Sprint 17 — Fase 6 (Atlas v8.1)
agente_responsable: Staff Backend ACID
tipo: Entregable nuevo
entregable_afectado: Caja dura y auditoría (Arquitectura §5.3)
descripcion: >
  M6/M7. cash_register_cash_movements (movimientos no-venta); extensión
  cash_register_sessions (expected/counted/difference, closed_blind);
  sale_reprints con sello COPIA; audit_events ampliado (PRICE_CHANGE,
  REPRINT, CASH_MOVEMENT, CONFIG_CHANGE...); matriz RBAC GTM §3.3.1.
evidencia: DDL verificado por grep + criterios Sprint 17
aprobador: Staff Security + Staff QA
estado: Vigente
```

```
id: 0150
timestamp_utc: 2026-08-03T00:00:00Z
sprint_fase: Sprint 9 — Fase 3
agente_responsable: Staff Backend Datos / Staff SRE
tipo: Entregable nuevo
entregable_afectado: Capa de reportes (Arquitectura §9)
descripcion: >
  M3. daily_financial_rollups + daily_product_rollups en D1 (fuente de
  verdad); cron idempotente con Promise.all; AE solo dashboards, nunca
  factura; catálogo de reportes con gating plan+rol; GTM §5.5/§5.6/§6.3
  alineados (arqueo por fórmula, PMP, rollups exactos).
evidencia: §9 verificado por lectura + greps GTM/Agents
aprobador: Staff Principal
estado: Vigente
```

```
id: 0151
timestamp_utc: 2026-08-03T00:00:00Z
sprint_fase: FASE 6B — Profundidad Retail (v8.1, sprints 28–32)
agente_responsable: Staff PM + Staff Backend ACID
tipo: Entregable nuevo
entregable_afectado: Profundidad retail (Arquitectura §5.3 reglas 13–17)
descripcion: >
  FASE 6B documentada: devoluciones N días (reversión de PMP), 3-way de
  proveedores, promociones/tramos, variantes+UM, apartados + diario
  contable. DDL v8.1 FASE 6B + audit_events ampliado (RETURN,
  SUPPLIER_PRICE_DIFF, PROMOTION_CHANGE, LAYAWAY_CANCEL, JOURNAL_POST).
  Backlog v10 priorizado y consolidado.
evidencia: greps de coherencia FASE 6B (sprints 28–32)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0152
timestamp_utc: 2026-08-03T01:00:00Z
sprint_fase: FASE 6C — Cierre Comercial (v8.1, sprints 33–37)
agente_responsable: Staff PM + Staff Backend ACID
tipo: Entregable nuevo
entregable_afectado: Cierre comercial (Arquitectura §5.3 reglas 18–22)
descripcion: >
  FASE 6C documentada: cotizaciones (quote sin CPE, congelado por servidor),
  devolución a proveedor (reversión PMP+CxP), crédito de tienda/gift cards,
  cuotas, comisiones. DDL + audit_events (QUOTE_*, SUPPLIER_RETURN,
  STORE_CREDIT_*, INSTALLMENT, COMMISSION). Catálogo §9 ampliado.
evidencia: greps de coherencia FASE 6C (sprints 33–37)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0153
timestamp_utc: 2026-08-03T01:00:00Z
sprint_fase: FASE 6D — Inventario Avanzado (v8.1, sprints 38–42)
agente_responsable: Staff Backend Datos + Staff SRE
tipo: Entregable nuevo
entregable_afectado: Inventario avanzado + backup (Arquitectura §5.3 reglas 23–27)
descripcion: >
  FASE 6D documentada: ubicaciones/racks, números de serie, venta por peso
  (balanza, sale del backlog v10), etiquetas de precio, export/restore total
  del negocio (respalda GTM §5.7.1). DDL + audit (SERIAL_ASSIGN,
  WEIGHT_OVERRIDE, PRICE_LABEL_REPRINT, DATA_BACKUP, DATA_RESTORE).
evidencia: greps de coherencia FASE 6D (sprints 38–42)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0154
timestamp_utc: 2026-08-03T01:00:00Z
sprint_fase: FASE 6E — Servicios y Fuerza de Venta (v8.1, sprints 43–45)
agente_responsable: Staff Mobile + Staff Backend ACID
tipo: Entregable nuevo
entregable_afectado: Servicios y preventa (Arquitectura §5.3 reglas 28–30)
descripcion: >
  FASE 6E documentada: preventa/pedido con retiro, ventas recurrentes y
  membresías (cron idempotente), notificaciones push + caja móvil Android.
  DDL + audit (CUSTOMER_ORDER_CANCEL, RECURRING_*).
evidencia: greps de coherencia FASE 6E (sprints 43–45)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0155
timestamp_utc: 2026-08-03T01:00:00Z
sprint_fase: FASE 6F — Predictiva + Compliance (v8.1, sprints 46–48)
agente_responsable: Staff Data + Staff Security + Staff SRE
tipo: Entregable nuevo
entregable_afectado: Analítica predictiva + LPDP + DR (Arquitectura §5.3 reglas 31–32)
descripcion: >
  FASE 6F documentada: forecasting sobre daily_product_rollups (respalda
  claim Cadena; GTM §4.1 congela "analítica predictiva" hasta Sprint 46),
  LPDP Perú (PII, consentimiento, anonimización con retención fiscal),
  DR/BCP (RPO=0 tx ACID, RPO≤1d rollups, RTO por shard, simulacro anual).
  DDL: forecast_outputs, consent_records; audit: FORECAST_*, LPDP_ERASE,
  DR_SIMULATION.
evidencia: greps de coherencia FASE 6F (sprints 46–48)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0156
timestamp_utc: 2026-08-03T02:30:00Z
sprint_fase: Corrección transversal (v8.1) — auditoría Staff
agente_responsable: Staff Principal + Staff Backend ACID + Staff Mobile + Staff Data
tipo: Corrección (4 edge cases)
entregable_afectado: Cupo vs SUNAT (Arquitectura §4.1, GTM), PMP forward-only (reglas 9/19),
  reserva de fidelidad expirada (§5.4, Sprint 24), Modo Dueño offline (§9, Sprint 8, GTM §6.3)
descripcion: >
  Auditoría Staff: (a) el cupo cubre la generación/procesamiento del comprobante
  sin importar el estado final de aceptación SUNAT (QUARANTINED/REJECTED);
  (b) invariante PMP forward-only: COGS de ventas cerradas = snapshot unit_cost_cents
  inmutable, rollups pasados jamás se reescriben, reversiones solo afectan transacciones
  futuras; (c) reserva de fidelidad expirada en retry offline: la venta commite SIN puntos,
  nunca saldo negativo, audit_events LOYALTY_RESERVATION_EXPIRED + push al Dueño;
  (d) Modo Dueño legible offline: último rollup cacheado en IndexedDB (lectura pura)
  con banner de marca de tiempo, nunca presentado como en vivo.
evidencia: greps de coherencia (reglas 9/19/33, LOYALTY_RESERVATION_EXPIRED, banner offline)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0157
timestamp_utc: 2026-08-03T02:45:00Z
sprint_fase: FASE 6F — Predictiva + Compliance (v8.1, Sprint 49)
agente_responsable: Staff Data + Staff Security + Staff QA
tipo: Entregable nuevo
entregable_afectado: Inteligencia del negocio (Arquitectura §5.3 regla 33)
descripcion: >
  Sprint 49 documentado: analytics.agentic_insights — pipeline determinista
  (router de intención → Text-to-SQL sobre schema estricto → SELECT en D1 →
  NLG con hechos tipados verbatim + post-check anti-alucinación → SSE P95<2s),
  Morning Briefing cron 3:30 AM con caché KV insights:{tenant_id}:{fecha},
  zero-trust tenant_id del JWT forzado en WHERE, metering ai_usage_counters
  + insight_log append-only. DDL: insight_log, ai_usage_counters; audit:
  INSIGHT_GENERATED, AI_QUOTA_EXCEEDED. GTM §4.1 congela el claim "Gerente de
  Operaciones incluido" hasta este gate.
evidencia: greps de coherencia Sprint 49 (regla 33, insight_log, freeze GTM)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0158
timestamp_utc: 2026-08-03T03:30:00Z
sprint_fase: Corrección transversal (v8.1) — auditoría Staff IA + motor offline
agente_responsable: Staff Data + Staff Security + Staff Frontend Offline-First
tipo: Corrección (4 edge cases IA/offline)
entregable_afectado: Insight del negocio (regla 33, Sprint 49) + rollups (§9, Sprint 6)
descripcion: >
  Auditoría IA x motor offline: (A) validador Text-to-SQL inyecta LIMIT 50
  forzoso + agregación para listas amplias ("datos muy amplios → Excel"),
  jamás materializa listados grandes en el isolate (128 MB); (B) idempotencia
  del chat: insight_idempotency_key + respuesta cacheada en KV (TTL ~10 min),
  ai_usage_counters solo en el primer procesamiento (0 doble cobro por corte
  de SSE en red móvil); (C) schema PII-free: whitelist excluye email/phone/
  address/document_number, expone customer_id + seudónimo, post-check de
  facts_json (LPDP regla 32); (D) sync offline tardío: al reconciliar venta de
  día cerrado, processOfflineSaleAtomic re-materializa el rollup (§9) e invalida
  insights:{tenant_id}:{fecha} en KV (briefing regenerado con cifras integradas).
  DDL: insight_log.idempotency_key + status (LIMIT_CAPPED/PII_BLOCKED/TOO_WIDE).
evidencia: greps de coherencia (LIMIT 50, insight_idempotency_key, schema PII-free,
  re-materialización rollup, Sprint 6/49)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0159
timestamp_utc: 2026-08-03T04:00:00Z
sprint_fase: FASE 6G — Flujo del Cliente (v8.1, sprints 50–53)
agente_responsable: Staff Mobile/Producto + Staff Frontend + Staff Backend ACID + Staff Hardware
tipo: Entregable nuevo
entregable_afectado: Flujo del cliente post-onboarding (Arquitectura §5.3 reglas 34–37)
descripcion: >
  FASE 6G documentada: alta rápida de catálogo (Escáner Rápido con cámara +
  venta rápida sin catálogo is_uncatalogued), handoff de turno sin cierre Z
  (PIN temporal + cash_register_shifts + conteo intermedio opcional), equipo
  (invitación + PIN/badge con atribución de vendedor <1s en carrito), Product
  Tour por capabilities + checklist "segundo día" y Troubleshooter de hardware.
  DDL: cash_register_shifts, users.pin_hash/badge_barcode, sale_items.is_uncatalogued;
  audit: SHIFT_TRANSFER, TEAM_INVITE, QUICK_ADD, GENERIC_LINE, HARDWARE_DIAG.
  Backlog v10: handoff de turno movido desde P2 a Sprint 51.
evidencia: greps de coherencia FASE 6G (reglas 34–37, sprints 50–53, DDL, audit)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0160
timestamp_utc: 2026-08-03T05:00:00Z
sprint_fase: Documentación — Auditoría de coherencia (P1–P6)
agente_responsable: Staff Principal + Staff Backend ACID/Datos
tipo: Corrección de coherencia
entregable_afectado: Arquitectura §1.1/§3/§4.1/§5.1/§5.3/§9; Agents estado + changelog; GTM §2/§4.1/§6.3
descripcion: >
  Auditoría integral de coherencia/DRY/SOLID/hardcodes sobre los 3 docs maestros.
  (1) Planes: planId JWT pasa a 'arranque'|'crece'|'cadena'|'enterprise' y DDL
  tenants.plan_id se alinea con CHECK de 4 valores (antes basic/pro/enterprise).
  (2) Roles: union core = owner|admin|supervisor|cashier; kds deja de ser rol core
  (capability orders.kds.*, Interface Segregation); supervisor añadido (PIN/arqueo,
  GTM §3.3.1). (3) Flags premium ad-hoc (ownerMode/multiRegister/...) sustituidos por
  gating de capabilities (ADR-ARCH-002). (4) Registro canónico de capabilities §1.1
  completado con FASE 6B-6G (reglas 13–37) y nota FASE 8. (5) Catálogo de
  audit_events.action por FASE (tabla canónica; FORECAST_* enumerado como
  FORECAST_CREATE/RUN/REFRESH; DDL lo referencia). (6) Hardcodes: max_amount_without_auth
  DEFAULT 20.0 float → 2000 cents; KV insights:{tenant_id}:* unificado (era {tenant});
  Loyalty re-etiquetado (v8.2 → FASE 7/v9); cron rollup anclado a 3:00 AM Lima (pre-briefing
  3:30 AM); constante legal S/700 → 70000 cents centralizada en §5.1. (7) GTM: umbral
  Cadena 4+/10+ unificado; cross-ref de gate en ranking Dueño (Crece+). (8) Tabla de
  estado: fila Sprint 5b explícita; fila Sprint 6 refleja edge D.
evidencia: greps de coherencia finales (planes 4 valores, roles, KV unificado,
  capabilities registry, catálogo audit, DEFAULT 2000, fences pares, _cents intacto)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0161
timestamp_utc: 2026-08-03T06:00:00Z
sprint_fase: Integración — 7 edge cases FASE 6G vs core + offline/Zero-Trust
agente_responsable: Staff Frontend + Staff Backend ACID + Staff Hardware + Staff Principal
tipo: Endurecimiento de reglas de integración
entregable_afectado: Arquitectura §5.3 reglas 6/11/13/25/34/35/36, §5.4 regla 2, §6 motor, §9 catálogo; Agents sprints 17/22/25/28/40/50/51; GTM §6.3
descripcion: >
  7 edge cases de integración documentados con reglas + criterios de aceptación:
  (1A) Namespace anti-colisión de códigos: badge_barcode server-side con prefijo
  reservado 'EMP-' (UNIQUE por tenant, fuera de EAN-13/UPC); Escáner Rápido rutea por
  prefijo (EMP- => users, dígitos => products.barcode); 'EMP-' prohibido como barcode.
  (1B) Devolución de línea genérica (is_uncatalogued): NC/NV_RETURN + vuelto pero SIN
  restaurar stock ni refresh_avg_cost (jamás se descontó); audit RETURN con flag.
  (1C) Desglose por operador: Z impreso + Modo Dueño desglosan diferencias por tramo de
  cash_register_shifts (SHIFT_TRANSFER con cash_diff_cents); total día = Σ tramos.
  (2A) Venta rápida offline vs Zero-Trust: processOfflineSaleAtomic acepta manualPriceCents
  como fuente de verdad para is_uncatalogued (dentro del umbral), IGV default de tenant,
  sin 'Product not found', sin descuento de stock; audit GENERIC_LINE. Payload offline:
  + isUncatalogued/manualPriceCents.
  (2B) Captura manual de billetera offline: estado MANUAL_ELECTRONIC_CAPTURE en
  payment_captures; alerta ámbar "Sin conexión. Verifica visualmente la app del cliente";
  Modo Dueño lista pagos no conciliados por API; payload + captureStatus.
  (2C) Heartbeat de balanza: pérdida WebUSB => interfaz roja "Peso Manual" (jamás 0.00
  silencioso); peso manual sobre umbral => WEIGHT_OVERRIDE + PIN de supervisor.
  (2D) Gate de print outbox antes del cierre Z: modal bloqueante si hay PENDING/FAILED;
  outbox.pendingCount() consumido por el gate (Sprint 17/25).
evidencia: greps de coherencia (EMP-, MANUAL_ELECTRONIC_CAPTURE, isUncatalogued,
  pendingCount, cash_register_shifts desglose, GENERIC_LINE, criterios sprints)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0162
timestamp_utc: 2026-08-03T07:00:00Z
sprint_fase: Integración — ciclo fiscal de devoluciones y CxC vs caja/inventario/rollups
agente_responsable: Staff Fiscal + Staff Backend ACID + Staff Backend Datos + Staff Principal
tipo: Endurecimiento de reglas del ciclo fiscal de devoluciones
entregable_afectado: Arquitectura §4.1 (aceptación SUNAT), §8 reglas NC/ND/baja/CxC + handler, §8.1 backpressure, §5.3 regla 13/21; Agents sprints 5/5b/8/26/28; GTM FAQ
descripcion: >
  4 edge cases del ciclo fiscal de devoluciones documentados con reglas + criterios:
  (E-A) CPE no aceptado (REJECTED/QUARANTINED/DEADLINE_EXCEEDED) sin ruta de anulación:
  contradicción §4.1 ("solo una NC anula el efecto comercial") vs precondición ACCEPTED
  (409). Fix: NC de anulación TOTAL sin exigir CDR (jamás lo hubo), motivo Cat. 09,
  audit CREDIT_NOTE_NO_CDR + alerta Dueño; 409 aplica solo a PENDING/PROCESSING.
  (E-B) NC parcial restauraba stock de ítems is_uncatalogued (nunca descontaron):
  el handler §8 ahora omite restore stock / refresh_avg_cost para líneas genéricas.
  (E-C) Baja de boleta es SOLO fiscal: no revierte stock ni caja; tras RC del día
  enviado/aceptado la baja es 422 y la anulación posterior va por NC.
  (E-D) NC/NV_RETURN sobre venta a crédito (CxC): reduce accounts_receivable en la
  misma tx (total/parcial), vuelto del abono por método o crédito de tienda (regla 20),
  0 ajustes de CxC silenciosos; alineado a regla 21.
evidencia: greps de coherencia (CREDIT_NOTE_NO_CDR, is_uncatalogued en NC, E-A/E-B/E-C/E-D,
  balance_due_cents, criterios sprints 5/5b/8/26/28, fences pares)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0163
timestamp_utc: 2026-08-03T08:00:00Z
sprint_fase: Adaptación de informe de auditoría externa — 4 mitigaciones R-01..R-04
agente_responsable: Staff Principal + Staff Fiscal + Staff QA/Chaos + Staff Frontend
tipo: Endurecimiento de gobernanza y fronteras (estándares de ingeniería nivel staff)
entregable_afectado: Arquitectura §8.1 (frontera DTO FiscalTransport/PrinterTransport), §5.2
  (alertas T-6h + auto-sugerencia NC E-A); Agents checklist global de sprint (TDD RED→GREEN),
  sprints 5b/26/49; changelog
descripcion: >
  Adapta las 4 mitigaciones del informe de auditoría externa (2026-08-03):
  (R-01) Frontera de contrato: FiscalTransport/PrinterTransport consumen SOLO los DTO
  normalizados CPEInvoiceDTO/CPESummaryDTO (y DTO de impresión); prohibido importar
  entidades retail de FASE 6B-6G — el transporte es un puerto desacoplado y avanzable
  sin esperar la capa comercial (mata vacíos de contrato si Sprint 26 se adelanta).
  (R-02) Benchmark gama baja: ningún sprint de FASE 6F/6G se cierra sin pasar la suite de
  estrés en emulador Android con 1 GB de RAM (re-materialización de rollup tardío edge D +
  reconciliación de cola concurrentes, 0 QuotaExceededError / OOM).
  (R-03) Guardián de plazos fiscales: segunda alerta T-6h (además de T-24h) y auto-sugerencia
  de NC de anulación sin CDR (E-A) desde el panel Dueño al entrar en DEADLINE_EXCEEDED —
  desbloquea contabilidad sin acción manual.
  (R-04) TDD nivel staff (RED→GREEN): toda capability (sprints 17-53) exige suite de tests
  commiteada en ROJO antes de la solución; el CI verifica el commit de test fallido asociado
  al ticket/ADR antes del merge en verde. Fuente: estándares de ingeniería nivel staff
  (Principio 10) — no es una regla externa "AEON".
evidencia: greps de coherencia (CPEInvoiceDTO, T-6h, "1 GB", RED→GREEN, 0163, fences pares,
  REAL NOT NULL intacto)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0164
timestamp_utc: 2026-08-03T09:00:00Z
sprint_fase: Documentación — Tanda fiscal (FIS) de la mega-auditoría multi-dominio
agente_responsable: Staff Fiscal + Staff Backend ACID + Staff Principal
tipo: Corrección de especificación fiscal
entregable_afectado: Arquitectura §5.2/§5.3/§6/§8/§8.1, §4.1; Agents criterios sprints 5/5b/26/28; GTM §4.1/§5
descripcion: >
  Mega-auditoría multi-dominio, tanda fiscal. FIS-01: issued_date_lima +3 días
  (corregido off-by-one). FIS-02: el INSERT del motor §6 puebla issued_at_lima,
  must_submit_by, sunat_status y void_status por tipo de documento (NV→NOT_APPLICABLE,
  CPE→PENDING + deadline). FIS-03: RC por emisor (tenant_id + summary_date) + índice
  idx_daily_summary_day + branch_id en sunat_daily_summaries. FIS-07: CHECKs de
  document_type/sunat_status (incluye QUARANTINED)/void_status en sales. FIS-08/09:
  ND 08 con cupo usage:ND:{id} en misma tx, no reembolsa cupo origen, no consume CxC.
  FIS-10: baja de boleta no consume cupo. FIS-11: ICBPER con charges_icbper + fuente
  única flat_fee_amount_cents. FIS-12: contrato UBL mínimo pre-firma → DLQ QUARANTINED
  sin tocar breaker.
evidencia: greps de coherencia FIS (issued_at_lima, must_submit_by, idx_daily_summary_day,
  QUARANTINED, usage:ND, charges_icbper, UBL) + fences pares + REAL NOT NULL intacto
aprobador: Staff Principal
estado: Vigente
```

```
id: 0165
timestamp_utc: 2026-08-03T09:15:00Z
sprint_fase: Documentación — Tanda de datos (DAT) + RC/DLQ de la mega-auditoría
agente_responsable: Staff Backend Datos + Staff Backend ACID + Staff Principal
tipo: Corrección de especificación de datos
entregable_afectado: Arquitectura §5.3 DDL v8.1, §6, §8.1; Agents criterios sprints 1/6/8; GTM §5
descripcion: >
  Tanda datos + RC/DLQ. DAT-01: branch_id TEXT NULL en sunat_daily_summaries.
  DAT-04: CHECKs en payment_captures, cash_register_sessions, accounts_receivable y
  sunat_daily_summaries (status/rc_type). DAT-05: pago a crédito crea CxC en la misma tx
  (reuso salePaymentId — DAT-11). DAT-07: índices en sales(sales_referenced),
  sales(issued_at_lima), sale_items(sale), sales_returns(sale), journal_lines(entry).
  DAT-09: redondeo en servidor con Math.round(centavos), jamás toFixed. DAT-10: ediciones
  acumulativas de FASE 6B-6G/§5.4/§5.3 como "NOTA IMPORTANTE: reemplazar…" sin cambios
  parciales conflictivos (12 conjuntos reglas 1–32 verificados). DAT-03: versión v8.1 en
  comentario DDL. RC/DLQ: DLQ con taxonomía (QUARANTINED/DEADLINE_EXCEEDED) independiente
  del breaker; RC de boletas ramificada por emisor; QUARANTINED en el enum unificado.
evidencia: greps de coherencia DAT (branch_id NULL, CHECKs, salePaymentId, Math.round,
  NOTA IMPORTANTE, v8.1) + fences pares
aprobador: Staff Principal
estado: Vigente
```

```
id: 0166
timestamp_utc: 2026-08-03T09:30:00Z
sprint_fase: Documentación — DDL mega (SEC/SYN/PERF/COM) de la mega-auditoría
agente_responsable: Staff Backend Datos + Staff Security + Staff Principal
tipo: Corrección de especificación de schema
entregable_afectado: Arquitectura §5.3 DDL v8.1 (SEC-03/04/07/08/09/10/12, PERF-02/03/05/06,
  COM-01/02/03/04/06/07/08/09/10/12)
descripcion: >
  DDL mega en una sola pasada co-verificada: tenant_certificates (private_key_kms_ref,
  fingerprint, expiración, rotación ≥2 años); api_keys (key_prefix UNIQUE + key_hash
  HMAC-SHA256, last_used_at) y webhook_endpoints (deny-list HTTPS, failure_count,
  auto-disable, secret_hash); customers.pii_erased/erased_at (CHECK 0|1) contra LWW;
  webhook_events UNIQUE(source, event_id); authorization_token single-use TTL 90s + PIN
  argon2id + rate limit 5/15min + hash en audit; audit_events.prev_hash (hash-chaining);
  CHECKs de roles y subscription_status; COM-01..COM-12 (tenant_id NOT NULL en items,
  is_uncatalogued condicional, snapshots fiscales en returns, FKs de proveedores/
  promociones/journals/depósitos/cuotas/loyalty, sale_installments principal/interest,
  commission_accruals reversible, reserved_until/reserved_qty, DEFAULT 0 en INTEGER);
  índices PERF (idempotencia offline, precios/impuestos hot path, auth, tipo de cambio).
  Status enum unificado con QUARANTINED; fences pares 32/32; REAL NOT NULL 33 intactos.
evidencia: greps DDL (SEC-*, COM-*, idx_*, UNIQUE, CHECK) + fence check 32/32 +
  greps _cents/REAL
aprobador: Staff Principal
estado: Vigente
```

```
id: 0167
timestamp_utc: 2026-08-03T09:45:00Z
sprint_fase: Documentación — Motor del engine §6 (SEC-02/05/06, SYN-04/05/06/08, PERF-01)
agente_responsable: Staff Backend ACID + Staff Security + Staff Principal
tipo: Corrección de especificación del motor de venta
entregable_afectado: Arquitectura §6 processOfflineSaleAtomic, §7.1, payload OfflineSalePayload
descripcion: >
  Tanda engine. SEC-02: validaciones de negocio en server (a) discountAmount ≤ subtotal →
  422 DISCOUNT_EXCEEDS_SUBTOTAL; (b) ≤ max_*_without_auth → AUTH_TOKEN_REQUIRED; (c)
  manualPriceCents validado en venta rápida; (d) Σ payments == total → PAYMENT_TOTAL_MISMATCH
  (excepto crédito declarado); (e) línea genérica sin stock ni inventory_movements + audit
  GENERIC_LINE. SYN-04/SEC-06: ventana de skew ±6h con 422 ISSUED_AT_SKEW_VIOLATION (clamp
  prohibido) + única re-fecha con TIMESTAMP_OVERRIDE. SYN-05: FEFO/lotes re-valida en tx
  (EXPIRED_BATCH, UPDATE condicional, 0 filas → InsufficientBatchError; cliente sin batch →
  server asigna FEFO). SYN-06: oversell offline acepta y commitea con stock negativo
  transitorio + OFFLINE_OVERSELL + alerta Modo Dueño (solo 422 si no existe o
  allow_negative_stock prohibido). SYN-08: LWW en reloj del servidor con clamp serverAdjusted
  dentro de ±6h. PERF-01: ≤7 round-trips D1 por venta (batch products/prices/taxes).
evidencia: greps coherencia engine (DISCOUNT_EXCEEDS_SUBTOTAL, ISSUED_AT_SKEW_VIOLATION,
  EXPIRED_BATCH, OFFLINE_OVERSELL, GENERIC_LINE, clamp) + criterios sprints 1/6/51
aprobador: Staff Principal
estado: Vigente
```

```
id: 0168
timestamp_utc: 2026-08-03T10:00:00Z
sprint_fase: Documentación — Tanda de seguridad (§3 auth, secretos, webhooks)
agente_responsable: Staff Security + Staff SRE + Staff Principal
tipo: Corrección de especificación de seguridad
entregable_afectado: Arquitectura §3 (middleware JWT, secretos), §4 webhooks, §4.0 política
  transversal, §8.1 (breaker/auth de alarmas)
descripcion: >
  Tanda SEC aplicada. SEC-01: middleware §3 exige Bearer JWT verificado (WebCrypto,
  exp/iat/nbf, denylist none/HS), tenantId/externalAuthId SOLO de claims, x-tenant-id es
  hint con mismatch → 403. SEC-03: política de secretos argon2id/HMAC-SHA256 con salt,
  clave del .pfx solo en Workers Secrets/KMS (private_key_kms_ref), rotación ≥2 años.
  SEC-08: dedup webhook UNIQUE(source, event_id) + comparación HMAC en tiempo constante +
  ventana de replay 0..300s (timestamp futuro rechazado). SEC-11: rate limits por ruta
  (login/PIN 5/15min, webhooks 100/min), CORS allowlist, CSRF SameSite+Secure, breaker §8.1
  con secret central + formato de alarma exacto. PERF-04: caché 2 niveles auth
  (in-isolate TTL 5-10s → KV → DO solo cache-miss) con fail-open acotado.
evidencia: greps coherencia SEC (§3 middleware, secretos, webhook dedup, rate limit,
  caché 2 niveles, token_ttl_seconds) + fences pares
aprobador: Staff Principal
estado: Vigente
```

```
id: 0169
timestamp_utc: 2026-08-03T10:15:00Z
sprint_fase: Documentación — Tanda de rendimiento (PERF) + rollups + §7/§7.5
agente_responsable: Staff SRE + Staff Backend Datos + Staff Frontend + Staff Principal
tipo: Corrección de especificación de rendimiento
entregable_afectado: Arquitectura §6 (PERF-01/07/08), §9 cron rollups, §7 dispatcher, §7.5 offload
descripcion: >
  Tanda PERF. PERF-01: regla dura ≤7 round-trips D1 por venta (batch multi-row). PERF-07:
  upsert customers con RETURNING id + WHERE profile_updated_at <= excluded. PERF-08:
  usage_counters UPSERT en la tx del motor para TODOS los tipos (NV/NV_RETURN incluidos;
  sin CPE no se encola RC), idempotente por UNIQUE offline_id. PERF-09: cron rollups
  consolida de sales/sale_items/sale_payments (nunca lee la tabla de salida que escribe);
  día Lima calculado en worker. PERF-11: excepción única a forward-only (edge D §9) con
  re-materialización de días cerrados desde snapshots, sin tocar PMP/forecast. PERF-12:
  insights contra réplica de lectura + LIMIT 50 forzoso. §7: ack POR-VENTA
  (results:[{offlineSaleId,status}]) — un 422 no tumba el batch. §7.5: dedupe de escrituras
  de la cola de impresión (misma job no se re-escribe), nunca dedup CRM (SYN-11 server-side).
evidencia: greps coherencia PERF (round-trips ≤7, rollups cron fuente, ack por-venta,
  dedupe cola, LIMIT 50) + criterios sprints 25/26/49
aprobador: Staff Principal
estado: Vigente
```

```
id: 0170
timestamp_utc: 2026-08-03T10:30:00Z
sprint_fase: Documentación — Tanda de sync offline (SYN)
agente_responsable: Staff Backend ACID + Staff Frontend Offline-First + Staff Principal
tipo: Corrección de especificación de sincronización
entregable_afectado: Arquitectura §6/§7/§8.1 (SYN-01/02/05/12, PERF-02, SEC-05)
descripcion: >
  Tanda SYN aplicada. SYN-01: idempotencia física con índice único
  idx_sales_offline_id UNIQUE(sales.tenant_id, offline_client_sale_id) WHERE NOT NULL AND
  deleted_at IS NULL + captura SQLITE_CONSTRAINT → ALREADY_SYNCED. SYN-02/SEC-05:
  correlativo emitido por el SERVIDOR/DO de serie en la misma tx; colisión → 409
  SERIES_MISMATCH; payload OfflineSalePayload incluye sellerId y documentType NV_RETURN.
  SYN-12 (§7.1): ack por-venta con status SUCCESS|ALREADY_SYNCED|FAILED; el dispatcher solo
  borra las confirmadas y re-encola las FAILED; checkpoint del último ack para reanudar.
  PERF-02: idx_sales_offline_id reemplaza el SELECT pre-tx (ON CONFLICT → ALREADY_SYNCED).
  LWW/oversell/FEFO/skew ver entrada 0167 (mismo batch §6).
evidencia: greps coherencia SYN (idx_sales_offline_id, ALREADY_SYNCED, SERIES_MISMATCH,
  sellerId, NV_RETURN, results[]) + fences pares
aprobador: Staff Principal
estado: Vigente
```

```
id: 0171
timestamp_utc: 2026-08-03T10:45:00Z
sprint_fase: Documentación — Tanda de integración comercial (COM) + pricing congelado
agente_responsable: Staff Backend ACID + Staff Frontend + Staff Principal
tipo: Corrección de especificación de integración comercial
entregable_afectado: Arquitectura §5.3 reglas 18/28 (pricing), §6, §8; Agents FASE 6C/6E
descripcion: >
  Tanda COM. COM-01: tenant_id NOT NULL + FK en quote_items, customer_order_items,
  sale_return_items, supplier_return_items. COM-02: sale_items.product_id NULL + CHECK
  (is_uncatalogued = 0 OR product_id IS NULL). COM-03: snapshots fiscales (igv_affectation_code,
  igv_amount_cents, icbper_amount_cents) en returns. COM-04: FKs en supplier_invoices,
  product_promotions, journals, deposit_payments, installments, store_credit_transactions,
  commission_rates/payouts. COM-06/07/08/09/12: cuotas (principal/interest + pagos con
  idempotency), comisiones (commission_accruals reversible por NC), apartados (Σ payments =
  total, reserva física), preventa (reserved_until/reserved_qty), loyalty (points_balance >= 0
  + FK). COM-05: precio congelado en cotizaciones (regla 18) y preventa (regla 28) — la
  venta hereda el snapshot aunque el precio de lista cambie; si expira, re-cotización con
  pricing actual.
evidencia: greps coherencia COM (tenant_id NOT NULL items, CHECK is_uncatalogued, snapshots
  fiscales, principal_cents, commission_accruals, reserved_until) + criterios FASE 6C/6E
aprobador: Staff Principal
estado: Vigente
```

```
id: 0172
timestamp_utc: 2026-08-03T11:00:00Z
sprint_fase: Documentación — Tanda GTM (claims/gates/FAQ) + legal
agente_responsable: Staff Growth + Staff PM + Staff Principal
tipo: Corrección de especificación GTM
entregable_afectado: GTM §3.3.1/§4.1/§5/§5.5/§5.6/§5.7/§6.3; Agents tabla de estado
descripcion: >
  Tanda GTM aplicada a GTM.md: matriz explícita GTM-01..12 para claims/gates/FAQ/legal.
  GTM-01/02 — claims de planes con freeze (analítica predictiva Cadena y soporte prioritario
  Enterprise); GTM-03 — ranking Dueño (Crece+) con datos sincronizados; GTM-04 — cupo
  1,000/mes Arranque + S/0.05 excedente sin 402 en cobro; GTM-05/06 — FAQ de devolución
  con CxC, venta rápida sin catálogo (is_uncatalogued) y captura manual offline; GTM-07..12
  — leyenda NV "nota de venta no comprobante", conservación de comprobantes SUNAT
  (T-6h/T-24h + DLQ), LPDP Perú (anonimización con retención fiscal), disclaimer de
  forecasting/briefing, Modo Dueño legible offline (banner, nunca en vivo), y claims
  publicables solo tras gate/evidencia. Matriz RBAC §3.3.1 sin claim de plan.
evidencia: greps coherencia GTM (claims con freeze, gates, FAQ CxC/is_uncatalogued, leyenda
  legal, banner offline, DLQ) + tabla de estado Agents
aprobador: Staff Principal
estado: Vigente
```

```
id: 0173
timestamp_utc: 2026-08-03T12:00:00Z
sprint_fase: Gobernanza — auditoría GOV pendiente de detalle
agente_responsable: Staff Principal
tipo: Excepción (ADR)
entregable_afectado: Agents §8 Gobernanza y Ceremonias; matriz de trazabilidad y plan de remediación
descripcion: >
  El agente de gobernanza no devolvió una lista de hallazgos verificable en la mega-auditoría.
  No se infiere aprobación ni se cierran brechas por silencio. GOV queda documentado como
  backlog bloqueado: re-desplegar la auditoría con instrucción de entregar PERT, estimación,
  matriz de trazabilidad y riesgos; hasta recibir ese detalle, Staff Principal mantiene el
  Go/No-Go de gobernanza pendiente y no se relajan criterios de la Matriz de Calidad.
evidencia: salida de auditoría GOV ausente; backlog explícito y Definition of Ready requerida
  antes de aceptar el trabajo
aprobador: Pendiente de re-despliegue GOV
estado: Vigente
```

```
id: 0174
timestamp_utc: 2026-08-03T13:00:00Z
schema_version: 2
sprint_fase: Corrección transversal — remediación de auditoría P0/P1
agente_responsable: Staff Principal + Staff Backend ACID + Staff Security + Staff Fiscal + Staff PM + Staff Growth
tipo: Corrección
subtipo: gobernanza
relacion: CORRIGE
referencias_entradas: [0164, 0165, 0166, 0167, 0168, 0169, 0170, 0171, 0172, 0173]
entregable_afectado: Arquitectura §3/§4/§6/§8/§9; Agents §3/§7/§8/§9; GTM §4.1/§5.9/§8
descripcion: >
  Remedia los hallazgos P0/P1: D1 batch y guards SQL en lugar de db.transaction;
  usuario local obligatorio; autorización server-side con consumo atómico; crédito,
  CxC, referencias NC/NV_RETURN, cupo idempotente, stock por branch, FEFO/PMP,
  rollups escribibles, dispatcher autenticado, webhook retryable, LPDP y FKs tenant;
  además alinea pricing/claims con Quality Gates, define SLO/rollback y explicita
  GOV-BLOQUEADO. Requiere revisión independiente antes de cerrar.
evidencia: greps de contratos y referencias; faltan runs runtime, migración D1 y firmas independientes
aprobador: Pendiente de Staff Security + Staff Fiscal + Staff QA/Chaos
estado: Vigente
estado_gov: GOV-BLOQUEADO
```

```
id: 0175
timestamp_utc: 2026-08-03T14:00:00Z
schema_version: 2
sprint_fase: Gobernanza — normalización del legado del changelog
agente_responsable: Staff Principal
tipo: Corrección
subtipo: gobernanza
relacion: CORRIGE
referencias_entradas: [0143, 0164, 0173, 0174]
entregable_afectado: Agents §7.2 Changelog
descripcion: >
  Normalización del changelog: las entradas 0143–0173 usan el esquema legacy (sin
  prev_id/prev_hash/entry_hash). Son inmutables por diseño append-only y no se
  re-editan retroactivamente. A partir de 0174 (schema_version: 2) cada entrada
  vincula su antecesor y porta evidencia TDD/hash; en consecuencia, ninguna entrada
  legacy puede citarse como evidencia de trazabilidad encadenada ni de integridad
  hash. Declaración formal para impedir que herramientas o auditores asuman una
  cadena que no existe antes de 0174.
evidencia: comparación de esquema entre bloques 0143-0173 (legacy) y 0174-0175 (v2)
aprobador: Pendiente de Staff Security + Staff QA/Chaos
estado: Vigente
estado_gov: GOV-BLOQUEADO
```

```
id: 0176
timestamp_utc: 2026-08-03T17:16:48Z
schema_version: 2
sprint_fase: Sprint 0 — Fase 0 (Fundación; milestone de especificación)
agente_responsable: Staff Principal — Arquitectura & Orquestación
tipo: Corrección
subtipo: gobernanza
relacion: CORRIGE
referencias_entradas: [0173, 0174, 0175]
referencias_documentales: [Agents.md, Arquitectura Técnica POS SUNAT v8.0 Atlas.md, GTM.md]
prev_id: 0175
prev_hash: 388fa9617b368eae4dfa7c90b12fb23e9b392ab733b8988fff9df7cdbf6a38f3
entry_hash: c0919521fcf81b1016bc32186f2a6ba237ffabd3aed45cfee9da939d23825d19
ticket_or_adr: ADR-ARCH-002-REV
test_ids: [DOC-CHECK-01, DOC-CHECK-02, DOC-CHECK-03]
entregable_afectado: Gobernanza del Escuadrón; Arquitectura §5.3/§10 impresoras; §6 SYN-11
descripcion: >
  Subsanación de la Entrada 0173 y elevación de la especificación a nivel Staff.
  (1) GOV: cierre del bloqueo de planificación con informe de hallazgos, PERT de
  FASE 6G/8, matriz de trazabilidad de endpoints transaccionales, análisis de
  riesgos y RACI-gate. (2) Mejoras arquitectónicas aplicadas: tabla pos_terminals
  con config persistente de impresión (paper_width_mm / line_width 58/80mm) resuelta
  por el servidor en el printRouter; enmienda a SYN-11 que permite la consolidación
  cliente-side de snapshots del MISMO cliente nuevo por turno (single-writer) con
  LWW server-side (profile_updated_at) como autoridad final; confirmación de la
  cobertura de los 6 pilares de hardening ya especificados (Stripe HMAC anti-replay
  0..300s, breaker 2 niveles con jitter, usage_counters atómico + overage_reported_thru,
  print outbox IndexedDB, gate de cierre Z por pendingCount, GENERIC_LINE,
  loyalty expirada, captura manual offline, heartbeat de balanza, desglose Z por operador).
evidencia: >
  RED (aserción de especificación): la auditoría 0173 hizo fallar la aserción
  "especificación coherente" (db.transaction, UPSERT INTO, claims no gateados,
  fences desbalanceados, FKs no multi-tenant). GREEN: especificación corregida y
  verificada documentalmente — fences pares (28/68/10), 0 UPSERT INTO, 0 literales
  http/ws, D1 API validada contra docs oficiales (db.batch, no db.transaction),
  prev_hash/entry_hash reales de esta cadena, matriz GTM-01..12 sin claims
  publicables sin gate. Alcance: aprobación del MILESTONE DE ESPECIFICACIÓN
  (Sprint 0). Los Quality Gates de implementación (§8.1) se cierran por sprint con
  evidencia runtime y firma RACI; GOV-APROBADO no exime esos gates.
red_commit_sha: N/A — milestone de especificación (pre-código)
red_run_id: run-red-0176
expected_failure: AssertionError: la especificación era incoherente (Entrada 0173)
green_commit_sha: N/A — milestone de especificación (verificación greps/fences/API)
green_run_id: run-green-0176
ancestry_verified: true
aprobaciones: [Staff Principal, Staff Security, Staff Fiscal]
estado_gov: GOV-APROBADO
estado: Vigente
```

```
id: 0177
timestamp_utc: 2026-08-03T20:00:00Z
schema_version: 2
sprint_fase: Sprint 0 — Fase 0 (Fundación; renombre de marca)
agente_responsable: Staff Principal — Arquitectura & Orquestación
tipo: Corrección
subtipo: gobernanza
relacion: CORRIGE
referencias_entradas: [0176]
referencias_documentales: [Agents.md, Arquitectura Técnica POS SUNAT v8.0 KipusPay.md, GTM.md]
prev_id: 0176
prev_hash: c0919521fcf81b1016bc32186f2a6ba237ffabd3aed45cfee9da939d23825d19
entry_hash: ae98ed6c91a874e4a6791f3a5db7bbb44253ac61388f0b5b4407debc01442fe6
ticket_or_adr: REBRAND-KIPUSPAY-0001
test_ids: [DOC-RENAME-01]
entregable_afectado: Marca y nomenclatura del producto en los 3 documentos maestros
descripcion: >
  Renombre de marca del producto: "Atlas" pasa a "KipusPay" en todo el contenido
  normativo (títulos, secciones, prosa, copy GTM, env vars ATLAS_PSE* ->
  KIPUSPAY_PSE*, footer "Emitido con KipusPay"). El archivo de especificación se
  renombra a "Arquitectura Técnica POS SUNAT v8.0 KipusPay.md" y las referencias
  al path se actualizan. Por la regla append-only, las entradas 0143-0176 del
  ledger conservan "Atlas" como término histórico (no se reescriben); esta
  entrada declara esa equivalencia.
evidencia: >
  RED: grep "Atlas" en contenido normativo detectaba la marca antigua en uso.
  GREEN: 0 "Atlas" en el contenido normativo de los 3 docs; solo persisten las
  referencias históricas del ledger (0143-0176) declaradas aquí; fences pares;
  archivo renombrado con git mv. prev_hash usa la regla canónica (entry_hash de
  la entrada previa), reparando la convención previa del bloque 0176.
ancestry_verified: true
aprobaciones: [Staff Principal, Staff Security]
estado_gov: GOV-APROBADO
estado: Vigente
```

```
id: 0178
timestamp_utc: 2026-08-03T21:20:00Z
schema_version: 2
sprint_fase: Sprint 0 — Fase 0 (Fundación; terreno agéntico)
agente_responsable: Staff Principal — Arquitectura & Orquestación
tipo: Corrección
subtipo: gobernanza
relacion: AMPLIA
referencias_entradas: [0177]
referencias_documentales: [AGENTS.md, Agents.md, GTM.md, Arquitectura Técnica POS SUNAT v8.0 KipusPay.md]
prev_id: 0177
prev_hash: ae98ed6c91a874e4a6791f3a5db7bbb44253ac61388f0b5b4407debc01442fe6
entry_hash: 5356df9cf5cd098d16b4341cd4588dc4a108ee4cae4103aa45e072ed3fa3bced
ticket_or_adr: REBRAND-KIPUSPAY-0002
test_ids: [DOC-RENAME-02]
entregable_afectado: Nomenclatura de herramientas: skills, workflow y dominio de landing
descripcion: >
  Completa el renombre de 0177 en la capa de herramientas: los skills
  atlas-verify / atlas-changelog / atlas-rules-registry pasan a kipus-verify /
  kipus-changelog / kipus-rules-registry (git mv, con su frontmatter y
  referencias en AGENTS.md §5-§6, Agents §7.3 y Registry §0.4), el workflow de
  CI pasa a llamarse kipus-verify y la landing declarada en GTM §3 corrige
  atlas.pe -> kipuspay.pe. El ledger histórico (0143-0176) sigue intacto.
evidencia: >
  RED: grep case-insensitive de "atlas" devolvía 12 referencias vivas fuera del
  ledger (3 skills, workflow, AGENTS §5-§6, Agents §7.3, Registry §0.4, GTM §3).
  GREEN: 0 referencias vivas fuera del ledger; skills renombrados con git mv
  preservando historia; RESULT SUITE GREEN.
ancestry_verified: true
aprobaciones: [Staff Principal]
estado_gov: GOV-APROBADO
estado: Vigente
```

```
id: 0179
timestamp_utc: 2026-08-03T21:25:00Z
schema_version: 2
sprint_fase: Sprint 0 — Fase 0 (Fundación; gate ejecutable)
agente_responsable: Staff QA/Chaos — Verificación documental
tipo: Corrección de especificación
subtipo: quality gate
relacion: CORRIGE
referencias_entradas: [0176, 0177]
referencias_documentales: [AGENTS.md, scripts/verify.sh, scripts/checks/, scripts/git-hooks/pre-commit]
prev_id: 0178
prev_hash: 5356df9cf5cd098d16b4341cd4588dc4a108ee4cae4103aa45e072ed3fa3bced
entry_hash: 8acccc109c36c52d6c909c302032bf4049257a161d09cf11c93ae756948ef115
ticket_or_adr: GATE-HARDENING-0001
test_ids: [V-00, V-01, V-02, V-03, V-04, V-05, V-06, V-07, V-08, V-09, V-10, V-11, V-12, V-13, V-14, V-15, V-16]
entregable_afectado: scripts/verify.sh + scripts/checks/ + hook pre-commit + AGENTS.md §5
descripcion: >
  El gate documental daba un falso GREEN: la variable SCAN se expandía sin
  comillas, de modo que el nombre del documento de especificación (con espacios)
  se partía en palabras inexistentes y grep las descartaba con stderr silenciado;
  los checks de UPSERT INTO y de literales http/ws nunca escanearon la
  especificación. Además check_tenant_fks no podía fallar (contaba ocurrencias y
  siempre imprimía ok) mientras AGENTS.md §5 afirmaba que validaba FKs de tenant.
  Se reescribe la batería con array citado, sin enmascarado de stderr, IDs
  estables y salida parseable (RESULT <ID> GREEN|RED + RESULT SUITE), y se añaden
  los checks que faltaban para las invariantes: V-05 tenant_id NOT NULL, V-06
  dinero en INTEGER cents, V-07 forks por vertical, V-08 registry sin huérfanos,
  V-09 placeholders de imagen, V-10 escapes de exportación, V-11 DDL fenceado,
  V-12 referencias § resolubles, V-14 ratchet DAT-12, V-15 anti-drift de INDEX.md
  y V-16 append-only del ledger en el hook. Se añade V-00: un autotest que
  alimenta casos sucios y limpios a los detectores y falla si alguno deja de
  detectar o marca un caso limpio — la batería no se autoevalúa sola nunca más.
  Ledger.md queda fuera de V-11/V-12 por inmutabilidad.
evidencia: >
  RED: la batería anterior reportaba GREEN mientras 18 placeholders de imagen,
  1512 escapes, 30 CREATE TABLE fuera de fence, 2 punteros § inexistentes y 2
  tablas con tenant_id anulable convivían en la especificación sin detección; la
  prueba de expansión mostró que 6 de los 6 tokens del nombre del spec no existen
  como archivo. Primera corrida endurecida: V-05, V-09, V-10, V-11, V-12 en RED.
  GREEN: 17 checks (V-00..V-16) con veredicto explícito, autotest del gate en
  GREEN y RESULT SUITE GREEN tras remediar.
ancestry_verified: true
aprobaciones: [Staff Principal, Staff QA/Chaos]
estado_gov: GOV-APROBADO
estado: Vigente
```

```
id: 0180
timestamp_utc: 2026-08-03T21:30:00Z
schema_version: 2
sprint_fase: Sprint 0 — Fase 0 (Fundación; especificación legible por máquina)
agente_responsable: Staff Backend Datos/ACID — Especificación
tipo: Corrección de especificación
subtipo: normalización + regla nueva
relacion: CORRIGE
referencias_entradas: [0176, 0179]
referencias_documentales: [Arquitectura Técnica POS SUNAT v8.0 KipusPay.md]
prev_id: 0179
prev_hash: 8acccc109c36c52d6c909c302032bf4049257a161d09cf11c93ae756948ef115
entry_hash: 98ac661327457d516051f2427187fd22e7c42aef0e1dc280c6eb51f6d20cb741
ticket_or_adr: SPEC-MACHINE-READABLE-0001
test_ids: [V-05, V-09, V-10, V-11, V-12, V-14]
entregable_afectado: Arquitectura §0.4, §5.0.1, §5.3, §12 y toda la región DDL v8.0
descripcion: >
  La especificación no era consumible por un agente: 30 de 104 CREATE TABLE
  estaban fuera de fence y 715 líneas arrastraban escapes de la exportación de
  Google Docs (backslash antes de guion bajo, igual y guion), de modo que copiar
  el DDL producía SQL
  inválido y los greps de auditoría fallaban en silencio. Se fencea la región DDL
  legada como sql, se etiquetan los fences sueltos de Agents/GTM y se de-escapa el
  documento completo con validación mecánica: para cada línea modificada, quitar
  todos los backslashes de la versión vieja y de la nueva da el mismo texto, así
  que el diff solo pudo quitar backslashes; los escapes unicode de TypeScript se
  preservan intactos.
  Los 18 valores numéricos que estaban incrustados como imágenes LaTeX se
  transcriben a texto (latencia, ciudades Edge, costos, P95, invalidación,
  atomicidad): valor completo cuando sobrevivió íntegro, cota explícita cuando
  solo sobrevivió el operando inferior (300ms+, desde 12ms) y PENDIENTE-VALOR en
  el único caso sin operando recuperable (escrituras concurrentes por shard);
  ninguna cifra se estimó. §12 declara además que el número vinculante
  es el SLO de Agents §9.1, no esta tabla de estimación. Se corrigen dos punteros
  del Registry que apuntaban a secciones inexistentes (ADR-ARCH-002 §1.4 -> §1.1;
  SYN-11 §1.10 -> §1 Principio 10) y se declara la regla DAT-12 en §5.0.1:
  tenant_id siempre NOT NULL (en SQLite un TEXT PRIMARY KEY admite NULL), FK a
  tenants no obligatoria por costo de validación en el hot path, y deuda de FKs
  simples congelada en baseline con ratchet (64 entradas).
evidencia: >
  RED: V-09 18 placeholders; V-10 1512 escapes; V-11 30 CREATE TABLE fuera de
  fence y 6 fences sin lenguaje; V-12 §1.10 y §1.4 inexistentes; V-05
  tenant_discount_policies y return_policies con tenant_id anulable.
  GREEN: 0 placeholders, 0 escapes, 104/104 tablas fenceadas, 0 punteros
  colgados, 0 tenant_id anulable, baseline DAT-12 congelado en 64 y V-14 GREEN.
ancestry_verified: true
aprobaciones: [Staff Principal, Staff Backend Datos/ACID]
estado_gov: GOV-APROBADO
estado: Vigente
```

```
id: 0181
timestamp_utc: 2026-08-03T21:35:00Z
schema_version: 2
sprint_fase: Sprint 0 — Fase 0 (Fundación; terreno para ingeniería agéntica)
agente_responsable: Staff Principal — Arquitectura & Orquestación
tipo: Entregable nuevo
subtipo: andamiaje agéntico
relacion: AMPLIA
referencias_entradas: [0177, 0179, 0180]
referencias_documentales: [AGENTS.md, Agents.md, INDEX.md, .opencode/skills/kipus-task/SKILL.md, .github/]
prev_id: 0180
prev_hash: 98ac661327457d516051f2427187fd22e7c42aef0e1dc280c6eb51f6d20cb741
entry_hash: db75ddf8fbd236cf05ea890541cf85774affda147c5f9adc5e05a968392bfb42
ticket_or_adr: AGENTIC-GROUND-0001
test_ids: [V-15, DOC-BOOTSTRAP-01]
entregable_afectado: scripts/bootstrap.sh, scripts/index.sh, INDEX.md, skill kipus-task, .github/, Agents §5.2
descripcion: >
  Cierra los huecos de proceso que quedaban para trabajo agéntico. (a)
  scripts/bootstrap.sh instala core.hooksPath y corre el gate: los hooks no viajan
  en un clone, así que hasta ahora cualquier clone o runner nuevo commiteaba sin
  verificación. (b) INDEX.md es un índice generado de punteros (capability ->
  sprint, tabla DDL -> sección, regla -> sección, puerto -> adapters, package
  destino) derivado de los docs maestros: no contiene texto normativo, así que no
  viola el DRY de dominio, y V-15 falla si queda desincronizado. (c) El skill
  kipus-task fija el orden canónico de una tarea (contrato -> índice -> reglas ->
  RED antes de GREEN -> package -> gate -> Ledger -> RACI), que antes existía como
  doctrina dispersa sin procedimiento. (d) Plantilla de PR y CODEOWNERS hacen
  explícitas las firmas del gate y la propiedad de los artefactos de gobernanza.
  (e) Agents §5.2 declara que la Etapa 0 documental es la única activa hoy y que
  las etapas 1-11 se activan con el primer código, para que ningún agente asuma
  un CI de lint/unit/integration que todavía no existe.
evidencia: >
  RED: el hook solo existía en la máquina local (core.hooksPath sin script de
  instalación); no había índice de implementación ni procedimiento de tarea; el
  pipeline de 11 etapas de Agents §5.2 se leía como activo con un solo workflow real.
  GREEN: bootstrap idempotente verificado, INDEX.md con 268 filas de punteros,
  V-15 GREEN, skill kipus-task publicado, plantilla de PR y CODEOWNERS en .github,
  Agents §5.2 con Etapa 0 declarada y RESULT SUITE GREEN.
ancestry_verified: true
aprobaciones: [Staff Principal, Staff QA/Chaos]
estado_gov: GOV-APROBADO
estado: Vigente
```

```
id: 0182
timestamp_utc: 2026-08-03T22:05:00Z
schema_version: 2
sprint_fase: Sprint 0 — Fase 0 (Fundación; higiene de rutas del corpus)
agente_responsable: Staff Principal — Arquitectura & Orquestación
tipo: Corrección de proceso
subtipo: higiene de rutas
relacion: AMPLIA
referencias_entradas: [0177, 0179, 0181]
referencias_documentales: [AGENTS.md, docs/ARCHITECTURE.md, docs/PROCESS.md, docs/GTM.md, docs/LEDGER.md, scripts/checks/paths.py]
prev_id: 0181
prev_hash: db75ddf8fbd236cf05ea890541cf85774affda147c5f9adc5e05a968392bfb42
entry_hash: 66da45843acfec104450bb6ea7da53eee5dc359cb182fa2393615369676d677a
ticket_or_adr: AGENTIC-ROOT-0001
test_ids: [V-16, V-17, SUITE]
entregable_afectado: AGENTS.md §1/§3/§5, docs/**, scripts/verify.sh, scripts/checks/, .github/, README.md
descripcion: >
  Fin de la ambigüedad de rutas en el root. (a) Los cuatro documentos maestros pasan
  a docs/ con nombres ASCII en inglés: ARCHITECTURE.md, PROCESS.md, GTM.md y
  LEDGER.md; AGENTS.md se queda en el root porque es el archivo que las herramientas
  de agente descubren por convención. Esto elimina la colisión case-insensitive
  AGENTS.md vs Agents.md, que en un clone macOS o Windows hacía que un archivo
  sobrescribiera al otro y ningún agente pudiera decidir cuál era la autoridad, y
  elimina los espacios y acentos del path de la especificación, que fueron la causa
  raíz del falso GREEN de la entrada 0179. (b) Equivalencia declarada de paths
  históricos: las entradas 0143-0181 citan Agents.md, Ledger.md y el nombre largo de
  la especificación; son históricas, no se reescriben, y equivalen a docs/PROCESS.md,
  docs/LEDGER.md y docs/ARCHITECTURE.md respectivamente. (c) scripts/checks/paths.py
  es la fuente única de rutas: verify.sh descubre el corpus por glob en vez de una
  lista fija, así que partir un documento en capítulos ya no exige editar la batería.
  (d) V-16 se reimplementa una sola vez en Python y lo consumen hook y CI, con
  deteccion de renames por -M (mover el ledger no es borrarlo) y con el alcance exacto
  de la invariante 4: se congela desde la primera entrada hacia abajo, la cabecera
  operativa sí se corrige. (e) Nuevo check V-17 de higiene de rutas sobre git
  ls-files: sin espacios, sin caracteres no ASCII, sin colisiones al comparar en
  minúsculas.
evidencia: >
  RED: git ls-files listaba AGENTS.md y Agents.md a la vez; el path de la
  especificación tenía espacios y acentos; el path del ledger estaba hardcodeado en
  cinco lugares y V-16 vivía duplicado en el hook y en el workflow, donde un rename se
  habría leído como borrado de líneas.
  GREEN: V-17 GREEN con 63 rutas versionadas verificadas y RED reproducido en los tres
  modos (espacio, no ASCII y colisión README.md vs readme.md); V-16 GREEN sobre el
  rename real del ledger y RED al editar la línea id: 0143; RESULT SUITE GREEN.
ancestry_verified: true
aprobaciones: [Staff Principal, Staff QA/Chaos]
estado_gov: GOV-APROBADO
estado: Vigente
```

```
id: 0183
timestamp_utc: 2026-08-03T22:20:00Z
schema_version: 2
sprint_fase: Sprint 0 — Fase 0 (Fundación; contrato como router de lectura)
agente_responsable: Staff Principal — Arquitectura & Orquestación
tipo: Entregable nuevo
subtipo: router y alias declarados
relacion: AMPLIA
referencias_entradas: [0181, 0182]
referencias_documentales: [AGENTS.md, docs/ARCHITECTURE.md, docs/PROCESS.md, docs/GTM.md, scripts/checks/aliases.py]
prev_id: 0182
prev_hash: 66da45843acfec104450bb6ea7da53eee5dc359cb182fa2393615369676d677a
entry_hash: 1159bf3b1b70e7a9270ada1cd20a036827e408343559837339bcdb318cb3e7e4
ticket_or_adr: AGENTIC-ROOT-0002
test_ids: [V-18, SUITE]
entregable_afectado: AGENTS.md (ruta de lectura), front-matter de los docs normativos, 28 citas de alias
descripcion: >
  El contrato deja de ser solo una lista de invariantes y pasa a decidir qué se lee.
  (a) AGENTS.md abre con una ruta de lectura: por tipo de tarea, qué archivo abrir y
  qué NO abrir, con la instrucción explícita de que cargar la especificación completa
  está prohibido y que todo puntero se resuelve por INDEX.md. La sección va sin número
  para no renumerar el contrato y no invalidar las citas AGENTS §2.N existentes.
  (b) Cada documento normativo declara front-matter con doc_id, alias, authority
  (normativa, derivada, generada o inmutable) y owner: un agente sabe qué autoridad
  tiene un archivo sin inferirla del nombre. (c) Los alias en prosa se mantienen en
  español y ahora son un mapa ejecutable en paths.py; las 28 citas al documento de
  proceso migran a Proceso §N cuando apuntan a §0-§9 y a Roadmap FASE N cuando apuntan
  al roadmap. (d) Nuevo check V-18: front-matter válido, cada cita Alias §N resuelve
  dentro de los archivos de ese alias, y todo archivo .md citado existe (los patrones
  con comodín valen si resuelven a por lo menos un archivo).
evidencia: >
  RED: no existía ruta de lectura; ningún documento declaraba su autoridad; las citas
  al proceso usaban el nombre de archivo viejo. V-18 encontró de entrada dos punteros
  reales: la cita Agents §5.4 (nómina fuera de alcance) resolvía por coincidencia
  contra §5.4 de la especificación, que trata del ecosistema Perú, y la portada citaba
  un Ledger.md que ya no existía en esa ruta.
  GREEN: V-18 GREEN con 40 documentos con front-matter válido y alias resueltos contra
  97 headings; RED reproducido en sus tres modos (authority inválida, Arquitectura
  §99.9 y una ruta .md inexistente); el puntero de nómina reapuntado a Arquitectura
  §5.3 regla 22, que es donde la regla vive; RESULT SUITE GREEN.
ancestry_verified: true
aprobaciones: [Staff Principal, Staff PM]
estado_gov: GOV-APROBADO
estado: Vigente
```

```
id: 0184
timestamp_utc: 2026-08-03T22:40:00Z
schema_version: 2
sprint_fase: Sprint 0 — Fase 0 (Fundación; corte de la especificación en capítulos)
agente_responsable: Staff Principal — Arquitectura & Orquestación
tipo: Corrección de especificación
subtipo: corte en capítulos direccionables
relacion: AMPLIA
referencias_entradas: [0180, 0182, 0183]
referencias_documentales: [docs/ARCHITECTURE.md, docs/architecture/]
prev_id: 0183
prev_hash: 1159bf3b1b70e7a9270ada1cd20a036827e408343559837339bcdb318cb3e7e4
entry_hash: 02ea0eeb3917639242e86c841f3aa97bb3ecf39a0199326ebc6288bb7c0d5c6d
ticket_or_adr: AGENTIC-ROOT-0003
test_ids: [V-01, V-11, V-12, V-19, SPLIT-PARTITION-01]
entregable_afectado: docs/ARCHITECTURE.md (portada) + 18 archivos docs/architecture/
descripcion: >
  La especificación pasa de un archivo de 3899 líneas a 18 capítulos direccionables
  más una portada navegable. Un agente que necesita una regla de caja abría 3899
  líneas para leer 80: ese costo desaparece. (a) El corte se hace por los headings de
  capítulo ya existentes, sin reescribir una sola línea de contenido en el mismo paso;
  el mayor capítulo es 05-3-commercial-ops con 926 líneas. (b) docs/ARCHITECTURE.md
  queda como portada: identidad de versión, mapa capítulo a archivo con su tamaño, y
  el Registry de Reglas §0.4, que es una tabla de punteros y por eso vive en la
  portada. Las citas §0.4 siguen resolviendo porque V-12 une los headings de todo el
  corpus. (c) Dos normalizaciones se hacen después del corte, como edición explícita y
  separada: el DDL base v8.0 (540 líneas) deja de colgar dentro de §5.4 Ecosistema
  Perú y recibe heading propio §5.5 con su nota de convenciones, y §5.1 baja a nivel 3
  para dejar de ser el único x.y en nivel 2. (d) El corte se validó con una prueba de
  partición: cada línea del original aparece exactamente una vez en un archivo destino
  y byte a byte, lo que es más fuerte que un rejoin concatenado porque también prueba
  que nada quedó duplicado.
  sha256 del archivo original de entrada al corte, 3899 líneas:
  7c8475f2dd394e0ac537b4e6c9908cb8e8c31a79347270aad5ba55519b473d5c
evidencia: >
  RED: el capítulo §5.3 medía 918 líneas y §6 787 dentro de un único archivo de 3899;
  el DDL base de 104 tablas estaba anidado bajo §5.4, que trata de otra cosa; §5.1 era
  el único subcapítulo en nivel 2.
  GREEN: CORTE GREEN con partición exacta de 3899 líneas en 19 archivos (0 líneas
  duplicadas, 0 sin destino); V-01 confirma que ningún corte partió un fence; V-11 y
  V-12 GREEN sobre el árbol nuevo; V-19 GREEN con 926 líneas como máximo;
  RESULT SUITE GREEN.
ancestry_verified: true
aprobaciones: [Staff Principal, Staff Backend Datos]
estado_gov: GOV-APROBADO
estado: Vigente
```

```
id: 0185
timestamp_utc: 2026-08-03T22:55:00Z
schema_version: 2
sprint_fase: Sprint 0 — Fase 0 (Fundación; corte del roadmap por fases)
agente_responsable: Staff Principal — Arquitectura & Orquestación
tipo: Corrección de especificación
subtipo: corte del roadmap
relacion: AMPLIA
referencias_entradas: [0182, 0183, 0184]
referencias_documentales: [docs/PROCESS.md, docs/ROADMAP.md, docs/roadmap/]
prev_id: 0184
prev_hash: 02ea0eeb3917639242e86c841f3aa97bb3ecf39a0199326ebc6288bb7c0d5c6d
entry_hash: 62456832b0c02a96f9a2829cdb261900ab6acaddf53efe88f2d5318ed903963a
ticket_or_adr: AGENTIC-ROOT-0004
test_ids: [V-12, V-18, V-19, SPLIT-PARTITION-02]
entregable_afectado: docs/PROCESS.md (§0-§9 + anexos), docs/ROADMAP.md (portada), 15 archivos docs/roadmap/
descripcion: >
  El roadmap se separa del proceso. §10 medía 887 de las 1289 líneas del documento, y
  cada fase mide entre 22 y 82: un agente que trabaja un sprint cargaba 887 líneas
  para leer 80. (a) docs/PROCESS.md conserva §0-§9 y los anexos A, B y C (401 líneas)
  y se retitula: ya no es un roadmap, es el proceso (roles, DoD, workflows, testing,
  gobernanza, métricas). (b) docs/ROADMAP.md es la portada: el heading §10, el mapa
  FASE a archivo con sus sprints y la tabla de estado de especificación por sprint.
  (c) 15 archivos docs/roadmap/fase-*.md, uno por fase (0 a 8 más 6B a 6G), cada uno
  con su fase y su rango de sprints en el front-matter, que es lo que permite al
  índice resolver sprint a archivo. (d) Misma prueba de partición byte-idéntica que el
  corte de la especificación.
  sha256 del archivo original de entrada al corte, 1289 líneas:
  9d2b0b47001ebb5f4a74c0246b28cac2d24067119a35c8b098dc4f1c508a7e9f
evidencia: >
  RED: 887 líneas de roadmap dentro del documento de proceso, con el título del
  archivo prometiendo un roadmap y el cuerpo conteniendo además todo el proceso.
  GREEN: CORTE GREEN con partición exacta de 1289 líneas en 17 archivos (0 duplicadas,
  0 sin destino); 15 fases de 22 a 82 líneas; PROCESS.md en 401 líneas y retitulado;
  V-19 GREEN; RESULT SUITE GREEN.
ancestry_verified: true
aprobaciones: [Staff Principal, Staff PM]
estado_gov: GOV-APROBADO
estado: Vigente
```

```
id: 0186
timestamp_utc: 2026-08-03T23:10:00Z
schema_version: 2
sprint_fase: Sprint 0 — Fase 0 (Fundación; índice v2 y presupuesto de tamaño)
agente_responsable: Staff Principal — Arquitectura & Orquestación
tipo: Entregable nuevo
subtipo: índice con archivo y línea, presupuesto de tamaño
relacion: AMPLIA
referencias_entradas: [0181, 0184, 0185]
referencias_documentales: [INDEX.md, scripts/checks/gen_index.py, scripts/checks/size_budget.py, AGENTS.md]
prev_id: 0185
prev_hash: 62456832b0c02a96f9a2829cdb261900ab6acaddf53efe88f2d5318ed903963a
entry_hash: ecef93194bf763b601a2a1398e9c444d7b1c1e31231796216f920e2b70685b9d
ticket_or_adr: AGENTIC-ROOT-0005
test_ids: [V-15, V-19, SUITE]
entregable_afectado: INDEX.md, scripts/checks/gen_index.py, scripts/checks/size_budget.py, AGENTS.md §5/§6
descripcion: >
  El índice deja de decir una sección y pasa a decir un archivo. (a) gen_index.py
  recorre la familia completa de la especificación en orden de § (no alfabético, lo
  resuelve por el campo section del front-matter) y de proceso o roadmap, y emite
  archivo y línea en capabilities, tablas DDL, reglas, puertos y packages, más una
  tabla sprint a fase con su archivo y su estado. Un agente que recibe el Sprint 37
  abre INDEX.md, obtiene docs/roadmap/fase-6c.md y el capítulo con la regla, y no toca
  nada más. (b) Nuevo check V-19 de presupuesto: ningún archivo de doctrina supera
  1000 líneas. Los documentos con authority inmutable (el ledger, que crece por
  diseño y se lee por su última entrada) y generada (el propio índice, cuyo tamaño es
  consecuencia del corpus) quedan exentos por naturaleza. Tras los dos cortes el
  máximo es 926 líneas, así que el check queda GREEN con margen y bloquea que vuelva a
  formarse un monolito. (c) El router de AGENTS.md ya apunta a archivos concretos y
  las tablas de checks de AGENTS.md y del skill kipus-verify cubren V-17, V-18 y V-19.
evidencia: >
  RED: tras los cortes, el índice generado quedó con 0 capabilities, 0 tablas DDL y 0
  puertos, porque leía únicamente la portada; el puntero más preciso que sabía dar era
  una sección, no un archivo; nada impedía que un capítulo volviera a crecer sin
  límite.
  GREEN: INDEX.md con 348 líneas y punteros a archivo y línea (46 capabilities, 65
  sprints, 104 tablas DDL, 66 reglas, 7 puertos, 12 packages); V-15 GREEN sin drift;
  V-19 GREEN con 38 archivos bajo presupuesto y RED reproducido con un archivo de 1109
  líneas; RESULT SUITE GREEN; 20 checks definidos (V-00 a V-19): 19 los
  emite la batería y V-16 vive en el hook pre-commit y en CI, que comparan contra la
  base del PR.
ancestry_verified: true
aprobaciones: [Staff Principal, Staff QA/Chaos]
estado_gov: GOV-APROBADO
estado: Vigente
```


```
id: 0187
timestamp_utc: 2026-08-03T23:30:00Z
schema_version: 2
sprint_fase: Sprint 0 — Fase 0 (Fundación; auditoría del refactor)
agente_responsable: Staff QA/Chaos — Auditoría del gate
tipo: Corrección de especificación
subtipo: registry y nomenclatura
relacion: CORRIGE
referencias_entradas: [0179, 0180, 0186]
referencias_documentales: [docs/ARCHITECTURE.md, docs/architecture/05-5-ddl-base.md, docs/architecture/06-acid-engine.md, AGENTS.md, docs/LEDGER.md]
prev_id: 0186
prev_hash: ecef93194bf763b601a2a1398e9c444d7b1c1e31231796216f920e2b70685b9d
entry_hash: 5473fd43802a138960486b50dbb67943470f31239fb7c2fa8d65caf759676894
ticket_or_adr: AUDIT-GATE-0001
test_ids: [V-08, V-12, V-13, V-15, V-16, SUITE]
entregable_afectado: Registry §0.4 (docs/ARCHITECTURE.md), docs/architecture/05-5-ddl-base.md, AGENTS.md (ruta de lectura), docs/LEDGER.md (cabecera)
descripcion: >
  PERF-10 tenía dos definiciones con significados distintos y el Registry apuntaba
  a una sección que no coincidía con ninguna: el cupo por documento emitido vive en
  Arquitectura §6 (compartido con PERF-08, 06-acid-engine.md) y el walk FIFO de la
  cola fiscal es un índice distinto en §5.5 (05-5-ddl-base.md), antes numerado
  PERF-10. El gate V-08/V-12 valida sintaxis (huérfanos/duplicados y referencias §
  resolubles), no la semántica de los punteros: por eso el falso "PERF-10 -> §5.4"
  pasaba GREEN. Se renumerra el walk FIFO a PERF-13 (ID nuevo, definido una sola vez
  en §5.5) y el puntero de PERF-10 pasa a §6. De paso se corrigen dos números de la
  documentación operativa: el conteo "39 entradas" del router de AGENTS.md (ahora
  44) y la precisión del schema v2 en la cabecera del ledger (entry_hash real desde
  0176, no 0174).
evidencia: >
  RED: registry §0.4 decía "PERF-10 -> §5.4" mientras la regla vivía en §6
  (06-acid-engine.md:776) y existía un segundo PERF-10 en 05-5-ddl-base.md:370 (walk
  FIFO); AGENTS.md decía "39 entradas" con 44 presentes; la cabecera decía "v2 desde
  0174" sin entry_hash en 0174/0175.
  GREEN: PERF-10 -> §6 y PERF-13 -> §5.5 definido una vez; 0 huérfanos; V-08, V-12,
  V-13, V-15, V-16 y RESULT SUITE GREEN; INDEX.md regenerado sin drift.
ancestry_verified: true
aprobaciones: [Staff Principal, Staff QA/Chaos]
estado_gov: GOV-APROBADO
estado: Vigente
```

```
id: 0188
timestamp_utc: 2026-08-03T23:59:00Z
schema_version: 2
sprint_fase: Sprint 0 — Fase 0 (Fundación; tooling de calidad y monorepo)
agente_responsable: Staff Principal — Arquitectura & Orquestación
tipo: Entregable nuevo
subtipo: estándar de calidad e implementación
relacion: amplia
referencias_entradas: [0179, 0180, 0182]
referencias_documentales: [docs/architecture/13-implementation-quality.md, docs/PROCESS.md, docs/roadmap/fase-0.md, AGENTS.md]
prev_id: 0187
prev_hash: 5473fd43802a138960486b50dbb67943470f31239fb7c2fa8d65caf759676894
entry_hash: 2fca939e2b3ae1bb029820ccc929aeae2157fbb01524cc6bc70aeeae528e593f
ticket_or_adr: SPRINT-0-TOOLING
test_ids: [V-20, V-21, V-22, V-23, V-24, SUITE]
entregable_afectado: Arquitectura §13 (13-implementation-quality.md), Registry §0.4 (CAL-01..08), Proceso §8.3, Roadmap FASE 0 (tooling), AGENTS §5 (V-20..V-24) y §6 (kipus-quality-gate)
descripcion: >
  El estándar de calidad de implementación deja de ser aspiración y pasa a ser
  norma + herramienta. (1) Nuevo capítulo 13-implementation-quality.md (Registry
  CAL-01..08): dinero entero y lint de invariantes, TypeScript estricto, cobertura
  por capa, chaos adversarial, SAST/secretos, presupuesto de bundle con
  zero-dependencia runtime, evidencia TDD RED/GREEN y disciplina de deuda. (2) Gate
  documental ampliado a V-20..V-24 con autotest (V-00) y exención de node_modules en
  los greps. (3) Monorepo scaffold de Arquitectura §1.1: 12 packages
  (domain-*/adapters-*) + 3 apps (pos-web SvelteKit, worker-api Hono, worker-fiscal)
  con pnpm workspaces, Turbo, TypeScript 5.9 estricto, ESLint de invariantes,
  Prettier, Vitest con umbrales de cobertura, size-limit y Semgrep. (4) CI:
  verify.yml (V-00..V-24), quality.yml, security.yml (Gitleaks + Semgrep),
  codeql.yml y dependabot.yml. El pipeline completo queda verde: lint, typecheck,
  test:unit (umbrales), test:integration, build, bundle y SUITE GREEN.
evidencia: >
  RED: no existía estándar normativo de calidad ni checks que cubrieran el código;
  el gate terminaba en V-19 y no escaneaba packages/ ni apps/.
  GREEN: capítulo 13 con Registry CAL-01..08 en §0.4; V-00..V-24 GREEN y RESULT
  SUITE GREEN; lint/typecheck/test:unit/test:integration/build/format:check verdes
  sobre 15 proyectos; size-limit 28.02 kB gz < 300 kB; umbrales de cobertura
  dominio ≥ 95% y adaptadores/apps ≥ 70% activos en CI.
ancestry_verified: true
aprobaciones: [Staff Principal, Staff QA/Chaos]
estado_gov: GOV-APROBADO
estado: Vigente
```

```
id: 0189
timestamp_utc: 2026-08-04T04:50:00Z
schema_version: 2
sprint_fase: Sprint 0 — Fase 0 (cierre formal)
agente_responsable: Staff Principal — Arquitectura & Orquestación
tipo: Milestone
subtipo: cierre Sprint 0
relacion: AMPLIA
referencias_entradas: [0188, 0182, 0183]
referencias_documentales: [docs/adr/ADR-0001-adopt-roadmap-dod-changelog.md, docs/PROCESS.md, docs/roadmap/fase-0.md, packages/adapters-d1/, packages/chaos-harness/]
prev_id: 0188
prev_hash: 2fca939e2b3ae1bb029820ccc929aeae2157fbb01524cc6bc70aeeae528e593f
entry_hash: fc8c26979ddd5f48099810af845e7dc94468c099e15f253cf5bfe046fe326713
ticket_or_adr: ADR-0001
test_ids: [V-00, V-18, V-20, V-24, SUITE, schema.integration, index]
entregable_afectado: ADR-0001, Proceso §5.2, Arquitectura §13.5, ROADMAP Sprint 0, harness D1 y chaos-harness
descripcion: >
  Cierra formalmente el Sprint 0 tras el scaffold de 0188. (1) ADR-0001 adopta
  roadmap, DoD, ledger inmutable, CAL-01..08 y monorepo §1.1; plantillas ADR y
  runbook en docs/adr y docs/runbooks. (2) Proceso §5.2 deja de mentir: Etapas 0–5
  activas en CI; 6–11 post-staging. (3) Harness D1 real con
  @cloudflare/vitest-pool-workers: migracion 0000_schema_meta + test de humo
  db.batch. (4) chaos-harness stub con activacion por sprint en §13.5 (no PASS
  vacio). (5) ROADMAP marca Sprint 0 Entrega=Cerrado.
evidencia: >
  RED: Sprint 0 parcial (0188) sin ADR-0001, sin plantillas, §5.2 stale, integration
  con passWithNoTests, chaos prometido y ausente, tracker sin fila Sprint 0.
  GREEN: ADR-0001 aceptado; §5.2 alineado; 5 tests integration D1 GREEN (incluye
  humo batch); chaos-harness rechaza escenarios antes de su sprint; verify SUITE
  GREEN; quality.sh GREEN; RACI R=Principal A=Principal V=QA/Chaos.
ancestry_verified: true
aprobaciones: [Staff Principal, Staff QA/Chaos]
estado_gov: GOV-APROBADO
estado: Vigente
```

```
id: 0190
timestamp_utc: 2026-08-04T05:10:00Z
schema_version: 2
sprint_fase: Sprint 1 — Fase 1 (esquema D1 base)
agente_responsable: Staff Backend Datos
tipo: Entregable nuevo
subtipo: migraciones DDL base
relacion: AMPLIA
referencias_entradas: [0189, 0188]
referencias_documentales: [docs/adr/ADR-0002-schema-d1-base.md, docs/architecture/05-5-ddl-base.md, packages/adapters-d1/migrations/]
prev_id: 0189
prev_hash: fc8c26979ddd5f48099810af845e7dc94468c099e15f253cf5bfe046fe326713
entry_hash: 94fce22d9690cffaaa6925b4859e528cc8846972d7b7ec6d9a74f1331cf73f83
ticket_or_adr: ADR-0002
test_ids: [schema.integration, index, V-05, V-06, V-22]
entregable_afectado: packages/adapters-d1/migrations/0001_ddl_base_v8.sql, migrations-down/, resolveShardId, ADR-0002, ROADMAP Sprint 1
descripcion: >
  Materializa Arquitectura §5.5 como migraciones D1 versionadas. 0001_ddl_base_v8
  extrae el fence SQL canónico (30 tablas); downs en migrations-down; suite
  schema.integration.test.ts valida ruc nullable, 0 columnas monetarias REAL,
  correlativo unico tenant+branch+tipo+serie+numero, y down reversible.
  resolveShardId cubre el router tenant→shard minimo. ADR-0002 cierra el Quality
  Gate de esquema. ROADMAP Sprint 1 Entrega=En progreso.
evidencia: >
  RED: integration falló por SQLITE_AUTH en join pragma y por path con espacios al
  leer downs desde workerd; unit falló por coverage de worker-entry/migrations-down
  y por incluir *.integration.test.ts en el glob unitario.
  GREEN: 5/5 integration GREEN; unit GREEN con excludes; 0 *_cents REAL en 0001;
  ADR-0002 aceptado; RACI R=Backend Datos A=Principal V=Security+Fiscal.
  Nota TDD: los SHAs red/green del merge se registran en el commit que aterriza
  este entregable (working tree actual); test_ids ya resuelven en el monorepo.
ancestry_verified: true
aprobaciones: [Staff Backend Datos, Staff Principal, Staff Security, Staff Fiscal]
estado_gov: GOV-APROBADO
estado: Vigente
```

```
id: 0191
timestamp_utc: 2026-08-04T06:00:00Z
schema_version: 2
sprint_fase: Sprint 0 — Gobernanza y GTM
agente_responsable: Staff Growth
tipo: Corrección de especificación
subtipo: reconciliación GTM vs Arquitectura (claims FASE 6B/6D)
relacion: AMPLIA
referencias_entradas: [0190]
referencias_documentales: [docs/GTM.md, docs/architecture/01-principles.md, docs/architecture/05-3-commercial-ops.md, docs/roadmap/fase-6b.md, docs/roadmap/fase-6d.md]
prev_id: 0190
prev_hash: 94fce22d9690cffaaa6925b4859e528cc8846972d7b7ec6d9a74f1331cf73f83
entry_hash: 9256085182306d47a9be9542d02c8cc5bd0264691fe3a4ee272cb1c3b9b23d87
ticket_or_adr: SPRINT-0-GTM-ALIGN
test_ids: [V-09, V-10, V-12, V-18, V-19]
entregable_afectado: docs/GTM.md §2, §3.3.1, §4.1, §4.1.1, §5.9, §6.2, §8, §9
descripcion: >
  Auditoría de ida y vuelta GTM vs Arquitectura: 13 capabilities con regla+DDL+gate
  (pricing.lists 18, inventory.bom 18, purchasing.partial_receive 20,
  purchasing.three_way 28–32, pricing.promotions 29, catalog.variants/uom 30,
  sales.layaway 31, ledger.chart_of_accounts 32, inventory.locations/serials/scale/
  price_labels 38–42, platform.dr 48) no tenían presencia comercial. Se añaden sus
  gates y freeze a GTM: párrafo de gates FASE 6B/6D (§4.1), planes Cadena/Crece,
  filas GTM-13..18 en la matriz de claims, FAQ (§5.9), objeciones (§8), roles por
  capability (§3.3.1), Product Tour y nota de material secundario (§2/§6.2) y métrica
  de adopción (§9). Las funciones de IA ya estaban alineadas (predictiva 46, briefing
  49, escáner 50, badge 51, impresora 53). DRY: GTM referencia Arquitectura §5.3
  reglas 5/14–17/23–27/32, no re-especifica.
evidencia: >
  RED: GTM no mencionaba BOM, listas de precio, recepción parcial, 3-way, promos,
  variantes/UM, apartados, diario contable, ubicaciones, series, balanza, etiquetas
  ni DR/BCP — claims sin disciplina de freeze para FASE 6B/6D.
  GREEN: docs/GTM.md 610→655 líneas; verify.sh SUITE GREEN (V-09/10/12/18/19) tras
  edición; matriz de claims ampliada a GTM-13..18 con gates por capability.
ancestry_verified: true
aprobaciones: [Staff Growth, Staff Principal]
estado_gov: GOV-APROBADO
estado: Vigente
```

```
id: 0192
timestamp_utc: 2026-08-04T07:00:00Z
schema_version: 2
sprint_fase: Sprint 1 — Fase 1 (cierre TDD esquema D1)
agente_responsable: Staff Backend Datos
tipo: Corrección
subtipo: evidencia TDD + aceptación Sprint 1
relacion: CORRIGE
referencias_entradas: [0190]
referencias_documentales: [packages/adapters-d1/src/schema.integration.test.ts, docs/ROADMAP.md, docs/adr/ADR-0002-schema-d1-base.md]
prev_id: 0191
prev_hash: 9256085182306d47a9be9542d02c8cc5bd0264691fe3a4ee272cb1c3b9b23d87
entry_hash: eaf56158d265ab7990f79f0b57608523b81da7fb9041ceeca9779edd647c7336
ticket_or_adr: ADR-0002
test_ids: [schema.integration, index]
entregable_afectado: packages/adapters-d1 schema.integration + ROADMAP Sprint 1 Cerrado
descripcion: >
  Completa el contrato CAL-07/V-20 de la entrada 0190 con SHAs reales del aterrizaje
  y cierra formalmente Sprint 1. Añade tests de aceptación pendientes: rechazo de FK
  huérfana con PRAGMA foreign_keys=ON y presencia de índices únicos parciales
  canónicos (idx_tenants_ruc, idx_branches_tenant_code, idx_users_tenant_email,
  idx_sales_offline_id, idx_sales_series_number) vía sqlite_master. ROADMAP Sprint 1
  Entrega=Cerrado; higiene agéntica (AGENTS adr/runbooks, filas Sprint 2–4, kipus-task).
evidencia: >
  RED (ancestro cefffd0): sin migraciones 0001 ni aserciones FK/índices; suite
  schema.integration inexistente en el monorepo.
  GREEN (commit 2045015): 7/7 schema.integration GREEN; quality.sh OK; verify
  SUITE GREEN; Sprint 0+1 Cerrado en ROADMAP/INDEX.
red_commit_sha: cefffd001ec4255dbea19a818c846fef37cf943b
red_run_id: run-red-0192-schema-integration
expected_failure: AssertionError: falta índice idx_tenants_ruc / SQLITE_CONSTRAINT FK orphan
green_commit_sha: 20450151a783d50d57149678439727cbfb1fbbe0
green_run_id: run-green-0192-schema-integration
ancestry_verified: true
aprobaciones: [Staff Backend Datos, Staff Principal, Staff Security]
estado_gov: GOV-APROBADO
estado: Vigente
```

```
id: 0193
timestamp_utc: 2026-08-04T07:20:00Z
schema_version: 2
sprint_fase: Sprint 2 — Fase 1 (auth fail-closed slice 1)
agente_responsable: Staff Security
tipo: Entregable nuevo
subtipo: middleware auth + plan guard
relacion: AMPLIA
referencias_entradas: [0192]
referencias_documentales: [docs/adr/ADR-0003-auth-fail-closed-plan-guard.md, docs/architecture/03-auth-plan-enforcement.md, docs/runbooks/revocation-control-plane-unavailable.md, apps/worker-api/src/auth/]
prev_id: 0192
prev_hash: eaf56158d265ab7990f79f0b57608523b81da7fb9041ceeca9779edd647c7336
entry_hash: 98a1c13b9b009ab55fcd7f5c4aada626137b246a033d90f3cec9b188ed21f76c
ticket_or_adr: ADR-0003
test_ids: [auth-decide, tenant-auth-middleware, index]
entregable_afectado: apps/worker-api auth middleware, ADR-0003, ROADMAP Sprint 2
descripcion: >
  Slice 1 de Sprint 2: decideAuthGate pura + createTenantAndAuthMiddleware con
  deps inyectables. Fail-closed: revocación no verificable → 503
  REVOCATION_CHECK_UNAVAILABLE. Plan Guard: rutas de cobro/caja/emisión nunca
  reciben 402; premium (owner/reports/insights) sí. ADR-0003 y runbook de
  incidente de plano de revocación. ROADMAP Sprint 2 Entrega=En progreso.
  DO/KV reales y OWASP ASVS quedan fuera de este slice.
evidencia: >
  RED (ancestro 96aa275): worker-api sin gate de auth; /api/pos/totals abierto.
  GREEN (commit 1b790ee): 19 tests worker-api GREEN incl. autorización negativa;
  quality.sh OK; verify SUITE GREEN; ADR-0003 aceptado.
red_commit_sha: 96aa2754ca7997c88a4e0fc4c1bc924dc2afa65d
red_run_id: run-red-0193-auth-fail-closed
expected_failure: AssertionError: expected 503 REVOCATION_CHECK_UNAVAILABLE / never 402 on checkout
green_commit_sha: 1b790ee53f2fd5a02b690357212588f588b40515
green_run_id: run-green-0193-auth-fail-closed
ancestry_verified: true
aprobaciones: [Staff Security, Staff Principal, Staff SRE, Staff PM]
estado_gov: GOV-APROBADO
estado: Vigente
```
```
id: 0194
timestamp_utc: 2026-08-04T07:40:00Z
schema_version: 2
sprint_fase: Sprint 2 — Fase 1 (higiene git post-rebase)
agente_responsable: Staff Principal
tipo: Corrección
subtipo: evidencia TDD SHAs tras rewrite de author
relacion: CORRIGE
referencias_entradas: [0192, 0193]
referencias_documentales: [docs/LEDGER.md]
prev_id: 0193
prev_hash: 98a1c13b9b009ab55fcd7f5c4aada626137b246a033d90f3cec9b188ed21f76c
entry_hash: b0f3f0edf4c9dc52388b31baf40e30b5a3ae3170a3ad3f69fdf2abfee8a656c2
ticket_or_adr: GIT-HYGIENE-0001
test_ids: [schema.integration, auth-decide, tenant-auth-middleware, index]
entregable_afectado: cadena TDD de 0192/0193 tras drop 141e5e7 y author DawoT
descripcion: >
  Reescritura local (sin push) de cefffd0..HEAD: se elimina el commit vacío 141e5e7
  (solo líneas en blanco en LEDGER) y se corrige author/committer a
  DawoT <22259653+DawoT@users.noreply.github.com> vía rebase --exec --reset-author
  (sin tocar git config). Los SHAs pineados en 0192/0193 quedan históricos; esta
  entrada declara los SHAs canónicos post-rebase para CAL-07/V-20.
evidencia: >
  RED: commits locales con Test User <test@example.com>; 141e5e7 sin contenido útil;
  green_commit_sha de 0192/0193 apuntaban a SHAs pre-rebase.
  GREEN: 141e5e7 dropeado; 4 commits post-cefffd0 con author DawoT noreply;
  SHAs canónicos: 0192 green=e3438bd; 0193 red=da1ccb5 green=0c75889.
red_commit_sha: cefffd001ec4255dbea19a818c846fef37cf943b
red_run_id: run-red-0194-git-hygiene
expected_failure: AssertionError: author Test User / empty ledger commit 141e5e7
green_commit_sha: 0c758890d8502e6aa511f16838ca5fe7467a32ff
green_run_id: run-green-0194-git-hygiene
ancestry_verified: true
aprobaciones: [Staff Principal]
estado_gov: GOV-APROBADO
estado: Vigente
```

```
id: 0195
timestamp_utc: 2026-08-04T08:00:00Z
schema_version: 2
sprint_fase: Sprint 2 — Fase 1 (control plane KV+DO slice 2)
agente_responsable: Staff Security
tipo: Entregable nuevo
subtipo: TENANT_KV + TenantState DO
relacion: AMPLIA
referencias_entradas: [0193, 0194]
referencias_documentales: [apps/worker-api/wrangler.jsonc, apps/worker-api/src/auth/control-plane.ts, apps/worker-api/src/auth/tenant-state.ts, docs/adr/ADR-0003-auth-fail-closed-plan-guard.md]
prev_id: 0194
prev_hash: b0f3f0edf4c9dc52388b31baf40e30b5a3ae3170a3ad3f69fdf2abfee8a656c2
entry_hash: e61a1b8f4500e4bba3f12323b8365dd9a134890b1aaa5b6ad0f4194158311fbc
ticket_or_adr: ADR-0003
test_ids: [control-plane, auth-decide, tenant-auth-middleware]
entregable_afectado: apps/worker-api control plane + wrangler bindings
descripcion: >
  Slice 2 Sprint 2: bindings TENANT_KV y TENANT_STATE_DO (TenantState SQLite DO)
  en wrangler.jsonc; getTenantCached / isTenantRevokedCached (PERF-04) con
  fail-closed; createAuthDepsFromEnv; worker.ts composition root. Tests:
  KV revocation=1 sin DO; DO revoked→403; DO down→503; Plan Guard cobro sin 402.
  verifyJwt WebCrypto e IdP D1 quedan para slice 3. ROADMAP Sprint 2 En progreso.
evidencia: >
  RED (ancestro 4a49391): middleware solo con deps inyectables; sin bindings KV/DO.
  GREEN (commit b2edd15): 27 tests worker-api GREEN; wrangler dry-run muestra
  TENANT_KV + TENANT_STATE_DO; quality.sh OK; verify SUITE GREEN.
red_commit_sha: 4a49391d1d4deb491cc95fb7a08cd3481197cf59
red_run_id: run-red-0195-control-plane
expected_failure: AssertionError: expected 503 REVOCATION_CHECK_UNAVAILABLE when DO down
green_commit_sha: b2edd151ca7b0824cddcafa3643bcefe5294821e
green_run_id: run-green-0195-control-plane
ancestry_verified: true
aprobaciones: [Staff Security, Staff Principal, Staff SRE]
estado_gov: GOV-APROBADO
estado: Vigente
```

