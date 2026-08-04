---
doc_id: roadmap-fase-2
alias: Roadmap
authority: normativa
owner: "@DawoT"
fase: "2"
sprints: "5–6"
---

### FASE 2 — Cumplimiento Fiscal y Resiliencia de Red

#### Sprint 5 — Motor Fiscal Dual + ADR-FISCAL-001 v2 (PSE, guards, NC/ND)
**Entrega:** Cerrado (2026-08-04) — QG técnico GREEN; RACI `V` humana pendiente (`EN REVISION`)
**Referencia:** Arquitectura §5 / §5.1 / §5.2 / §8; GTM §3.3.1 · **Agentes:** Staff Fiscal (owner), Staff Security (colaborador), Staff SRE (colaborador)

**Entregables:**
- Branch Series Resolver sobre `branch_document_series` + reserva correlativo (DO o reconciliación servidor).
- Ruta **NV / NV_RETURN:** `NOT_APPLICABLE`, leyenda legal, reversión stock/caja en devolución.
- Ruta **CPE:** XML UBL 2.1, firma, ICBPER, Catálogo 07 en ítems; **PSE KipusPay** default (`pse_mode = KIPUSPAY_PSE`).
- Guards: régimen×modo; Factura⇒RUC; Boleta≥700⇒DNI/nombre; skew `issuedAt` ±6h; auto Factura/Boleta.
- NC/ND: precondición `ACCEPTED`; motivos Cat. 09/10; **NC parcial** por residual; NV no usa NC fiscal. **Excepción E-A (anulación sin CDR):** un CPE `REJECTED`/`QUARANTINED`/`DEADLINE_EXCEEDED` (jamás tuvo CDR) admite NC de **anulación total** sin exigir `ACCEPTED` (`audit_events` `CREDIT_NOTE_NO_CDR` + alerta Dueño); el 409 aplica solo a `PENDING`/`PROCESSING`. **Excepción E-B:** al restaurar stock en NC parcial, los ítems `is_uncatalogued` NO restauran stock ni `refresh_avg_cost` (nunca descontaron).
- **ADR-FISCAL-001 v2** (obligatorio): decisiones cerradas PSE, RC, plazos, exclusiones GRE (Anexo C).
- **Readiness PSE KipusPay:** credenciales/secretos en Workers Secrets/KMS, endpoint/contrato
  `FiscalTransport`, evidencia de autorización/acreditación aplicable y prueba de CDR en staging;
  sin estos artefactos el claim PSE permanece congelado.

**Criterios de aceptación:** 100% XML factura válido; 0 facturas sin RUC; 0 boletas ≥700 sin doc; 0 NC sin CDR **salvo anulación de CPE no aceptado (E-A: NC sin CDR para `REJECTED`/`QUARANTINED`/`DEADLINE_EXCEEDED` válida y auditable en 100 ciclos)**; 0 NV encoladas a SUNAT; 0 uso de copy “contingencia” para pre-certificado; **NC parcial con ítem `is_uncatalogued` (E-B): 0 stock fantasma en 500 ciclos (antes y después de catalogar el producto)**.

**Quality Gate:** ADR-FISCAL-001 v2 firmado por Staff Fiscal + Security + Principal **antes** de cerrar;
  Staff SRE verifica el runbook/credenciales PSE y el CDR de staging.

---

#### Sprint 5b — Resumen Diario, Plazos de Envío, Baja y Alertas Fiscales
**Entrega:** Cerrado (2026-08-04)
**Referencia:** Arquitectura §5.2 · **Agentes:** Staff Fiscal (owner), Staff SRE (owner conjunto), Staff Frontend (alertas)

**Entregables:**
- Worker/cron `buildDailySummaryCron` + entidad `sunat_daily_summaries` (boletas del día Lima; CDR).
- Worker factura unitaria con `must_submit_by` (plazo **3d**); RC con plazo **7d**.
- Alertas Admin/Dueño **T-24h y T-6h**; DLQ `DEADLINE_EXCEEDED`; un CPE que vence dispara en el panel Dueño la **auto-sugerencia de NC de anulación sin CDR (E-A)** para desbloquear contabilidad.
- Baja de boleta (`void_status`) informada en RC del día de emisión. **Solo fiscal (edge E-C):** la baja no revierte stock ni caja; si la RC del día ya se envió/aceptó, la baja es rechazada (422) y la anulación posterior se hace vía NC.
- Banner: boletas del día sin RC ≠ cierre de caja Z.
- Boleta consolidación diaria NRUS ≤ S/ 5.
- Portal mínimo 1 año: URL autenticada para descarga CPE del adquirente (P1).

**Criterios de aceptación:** RC con CDR en staging para un día de boletas; 0 RC fuera de plazo sin alerta; factura de prueba dentro de 3d; baja de boleta en RC; **baja tras RC enviado → 422 (edge E-C); baja NO altera stock ni caja**; arqueo Z no dispara RC automáticamente.

**Quality Gate:** Staff Fiscal + SRE firman runbook de plazos; Staff QA suite “deadline chaos” (reloj simulado).

---

#### Sprint 6 — Resiliencia de Red Adversarial, Storage Local y Chunked Sync Dispatcher
**Entrega:** Cerrado (2026-08-04) — QG técnico GREEN; RACI `V` humana pendiente (`EN REVISION`)
**Referencia:** Arquitectura §7 y Principio 10 · **Agentes:** Staff Frontend Offline-First (owner), Staff QA/Chaos (colaborador)

**Entregables:** Service Worker con IndexedDB; dispatcher de sincronización en lotes de 25-35 transacciones; backpressure-aware dispatch; **guardián de cuota de almacenamiento** (alerta ≥80%, bloqueo seguro de nuevas ventas offline al 100% con mensaje accionable al cajero, nunca corrupción silenciosa de la cola); perfil de degradación en dispositivos de memoria limitada. **Sin dedup de clientes en cliente:** el payload offline lleva el snapshot del perfil (name + email/phone/address opcionales + `clientProfileUpdatedAt`); la consolidación CRM es del servidor (upsert idempotente **LWW por timestamp** — Arquitectura §6), y las correcciones de perfil del cajero viajan con la venta.

**Criterios de aceptación:** sincronización exitosa tras interrupciones de red simuladas (pérdida de paquetes, latencia alta, fragmentación de payload masivo); 0 pérdida y 0 duplicación de transacciones en 500 ciclos de prueba de caos de red; **corrección de perfil (email/nombre) en venta offline posterior vence al snapshot previo (LWW), incluso si dos chunks sincronizan fuera de orden**; **sync offline tardío (edge D): al reconciliar una venta con `issued_at` de un día cerrado, `processOfflineSaleAtomic` dispara la re-materialización idempotente del rollup `(tenant, branch, report_date)` (§9) e invalida `insights:{tenant_id}:{fecha}` en KV — verificado con la tablet "offline toda la tarde, sync a las 8 AM": los reportes §9 y el briefing reflejan las cifras integradas, sin doble conteo**; inyección de `QuotaExceededError` / saturación de IndexedDB: 0 corrupción de cola, alerta visible antes del umbral crítico, cobro se detiene de forma segura con instrucción clara ("libera espacio o reconéctate para sincronizar"); stress en perfil tablet Android de gama baja (≥1 dispositivo real o emulador tipificado) sin pérdida de ventas pendientes.

**Quality Gate:** UX validada por Staff Design contra el estándar "cero spinners en flujos críticos" (GTM §6.5); Staff QA certifica suite de caos de storage/dispositivo.

---

