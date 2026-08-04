---
doc_id: roadmap-fase-3
alias: Roadmap
authority: normativa
owner: "@DawoT"
fase: "3"
sprints: "7–9"
---

### FASE 3 — Experiencia de Producto Premium

#### Sprint 7 — POS Offline-First, Caja por Modo, Plantillas CPE/NV, Modo Vitrina y Hardware
**Entrega:** Cerrado (2026-08-04) — QG técnico GREEN; RACI `V` humana pendiente (`EN REVISION`)
**Especificación:** Actualizada (capabilities `pos.checkout` / `pos.document_selector` / `hardware.print_templates` / `display.vitrina` / `pos.offline_correlative_reserve`; frontera S25 = sin print outbox ni ladder USB/WSS/BT)
**Referencia:** Arquitectura §2, §5.2, §10; GTM §3.3.1 y §6.4 · **Agentes:** Staff Frontend (owner), Staff Hardware (owner conjunto), Staff Design (colaborador), Staff Fiscal (consultado)

**Entregables:** impresión ESC/POS + PDF: plantilla **CPE** (hash, QR, leyendas SUNAT) vs **NV** (leyenda control interno); selector de documento según modo/régimen; auto Factura si RUC / Boleta si consumidor; bloqueo cobro boleta ≥700 sin DNI; flujo `NV_RETURN`; banner formalización; Modo Vitrina; kiosko/QR (emisión al confirmar pago con mismo motor); reserva correlativo offline. **Fuera de 7:** ladder `PrinterTransport` completa / print outbox IDB (Sprint 25); Modo Dueño (Sprint 8); catálogo reportes (Sprint 9).

**Criterios de aceptación:** feedback <100ms 95%; leyendas CPE y NV aprobadas por Fiscal; 0 cobros boleta ≥700 sin identificación; kiosko emite con mismo guard fiscal; impresión ≥2 anchos.

**Quality Gate:** checklist GTM §6.5 + Staff Fiscal aprueba plantillas impresas.

---

#### Sprint 8 — Ledger Completo (CxC/CxP/Compras) y App "Modo Dueño"
**Referencia:** Arquitectura §5 (ledger); GTM §6.3 · **Agentes:** Staff Backend Datos (owner), Staff Mobile/Producto (owner conjunto)

**Entregables:** módulos de cuentas por cobrar/pagar, órdenes de compra, egresos de caja chica; app Modo Dueño con resumen del día sin scroll, alertas push accionables, modo oscuro real; en pestaña **Yo**: plan/suscripción + atajo “Activar facturación electrónica” (config profunda en Admin).

**Criterios de aceptación:** 100% de asientos CxC/CxP trazables a su transacción origen; alertas push con tasa de entrega ≥99%; app revisada bajo el "modelo de interacción de app de consumo" (no de panel administrativo); **compensación de CxC en NC/devolución (edge E-D): una NC/NV_RETURN sobre venta con `balance_due_cents > 0` reduce el saldo en la misma tx — 0 discrepancias saldo vs asientos en 500 ciclos (total y parcial)**; **Modo Dueño legible offline (edge D): el resumen del día y el ranking por sucursal se muestran sin conexión desde el último rollup cacheado en IndexedDB (lectura pura), con banner de marca de tiempo ("Datos de hace X horas") que nunca se presenta como en vivo, y refresco automático al reconectar**.

**Quality Gate acumulativo:** Staff Design (navegación Dueño, GTM §6.3) + Staff Mobile; Staff Design certifica paridad de calidad visual con apps bancarias de referencia; Staff QA valida ausencia de fugas de memoria en sesión prolongada. Staff Growth mantiene congelados GTM-03/GTM-11 hasta que Sprint 9 certifique la fuente de rollups; este sprint no descongela claims de ranking.

---

#### Sprint 9 — Analítica Global Concurrente, Daily Rollups y Observabilidad
**Referencia:** Arquitectura §9 · **Agentes:** Staff SRE (owner), Staff Data/Analytics (colaborador)

**Entregables:** **capa de rollups diarios en D1** (`daily_financial_rollups` + `daily_product_rollups`, idempotente por `(tenant, branch, día Lima)`) como **fuente de verdad de reportes**; agregador cron paralelo (`Promise.all`) sobre shards; **catálogo de reportes retail** (arqueo por cajero, ventas por hora/método de pago, top productos/margen con PMP, inventario valorizado, merma, comparativo sucursales, aging CxC/CxP) con **gating por plan+rol** (§3) y export CSV/Excel; AE solo dashboards (**nunca factura**).

**Criterios de aceptación:** rollup idempotente (correr 2× el cron = mismo resultado, 0 duplicados); agregación de métricas de todos los shards sin bloqueo entre sí; P95 documentado y dentro del presupuesto Sub-50ms; alerting configurado con error budget explícito por servicio; **0 lecturas de reportes en el hot path de venta; reportes avanzados cortados por plan sin tocar el arqueo ni el cierre Z**.

**Quality Gate:** runbook de incident response ensayado en un simulacro (game day); Staff Data certifica `daily_financial_rollups` y Staff Growth puede descongelar GTM-03/GTM-11 solo con evidencia de datos sincronizados, lectura offline y banner de antigüedad.

---

