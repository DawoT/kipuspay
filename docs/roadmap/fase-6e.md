---
doc_id: roadmap-fase-6e
alias: Roadmap
authority: normativa
owner: "@DawoT"
fase: "6E"
sprints: "43–45"
---

### FASE 6E — Servicios y Fuerza de Venta (KipusPay v8.1, sprints 43–45)

> Convierte la promesa de vertical Servicios (GTM §2) en producto: preventa con retiro, ventas recurrentes/membresías y una caja móvil que acompaña al dueño y al vendedor. Pedido de cliente: Arquitectura §5.10; reglas 29–30: §5.3. **Capabilities, no forks** (ADR-ARCH-002).

#### Sprint 43 — Preventa / pedido a cliente con retiro
**Capabilities:** `orders.customer_orders`  
**Referencia:** Arquitectura §5.10 regla 28 · ADR-0027 · GTM-24 congelado · **Agentes:** Staff Frontend (owner), Staff Backend ACID, Staff Mobile (aviso)

**Entregables:**
- Baseline de gobernanza y tests contractuales RED para `customer_orders`, ítems, fulfillments y avisos; target DDL 0036, sin migración ni módulos/rutas/UI/chaos de producción.
- Pedido reserva ítems **sin pago previo, venta ni CPE**; parciales múltiples reutilizan esa reserva sin segundo descuento. Snapshot válido gana; expirado libera primero y una venta nueva usa pricing actual con autorización de supervisor.
- Intención durable/auditable antes de expiry release; WhatsApp opcional por capability, fallback operacional in-app y push garantizado solo en Sprint 45. Fallo de transporte no bloquea caja ni retiene stock indefinidamente.
- Lease/envelope offline server-minted, tenant/order/branch/terminal scoped, TTL acotado, one-shot e idempotente; reconciliación autoritativa server-side.

**Criterios de aceptación del baseline:** RED por ausencia explícita de producción, no por sintaxis; cubre cross-tenant, replay/doble fulfill, carreras fulfill-cancel-expire, parciales, lote/ubicación/serie/UOM, drift/approval, aviso duplicado/fallido, audit chain, cero CPE/pago al crear y cero bloqueo de checkout. “Tenant requiere pedido” solo aplica al flujo de retiro y nunca a venta ordinaria/offline.

**Quality Gate:** permanece abierto. Staff QA + Staff PM; Staff Growth no descongela GTM-24 hasta GREEN, chaos 500, evidencia runtime y firmas A+V.

---

#### Sprint 44 — Ventas recurrentes / membresías
**Capabilities:** `sales.recurring`  
**Referencia:** Arquitectura §5.3 regla 29; vertical Servicios · **Agentes:** Staff Backend ACID (owner), Staff Data, Staff Frontend (Admin), Staff Growth (gating)

**Entregables:**
- `recurring_plans` (frecuencia, doc_type NV/03/01, items con precio servidor) + cron con **idempotencia** (cada ocurrencia = doc fiscal propio).
- Cancelación y proporcionalidad; atraso de pago no corta el servicio al instante (periodo de gracia, GTM §4.3).
- `audit_events` `RECURRING_*`.

**Criterios de aceptación:** 0 duplicado de ocurrencia (idempotency key por plan×fecha); cada ocurrencia emite su CPE/NV; cancelación no deja ocurrencias huérfanas; cupo §4.1 aplica por doc emitido.

**Quality Gate:** Staff QA (cron idempotente) + Staff PM; Staff Growth vende "membresías" en Servicios solo tras gate.

---

#### Sprint 45 — Notificaciones push + caja móvil Android
**Capabilities:** `mobile.push`, `client.mobile_pos`  
**Referencia:** Arquitectura §5.3 regla 30; §7.5 (offloading) · **Agentes:** Staff Mobile (owner), Staff Frontend, Staff SRE, Staff Hardware

**Entregables:**
- `push_subscriptions` + Web Push/FCM: alertas Modo Dueño reales (arqueo, quiebre, discrepancias, cuotas vencidas) — no solo polling.
- **Caja móvil** como terminal PWA que reusa el core (multi-caja portátil, Android); sin fork de dominio.
- Suscripción/consentimiento de push explícito (LPDP, Sprint 47).

**Criterios de aceptación:** push entregado en <10s en red normal; caja móvil pasa la suite de gama baja (Sprint 6/14) sin pérdida de cola; 0 push sin consentimiento; modos offline idénticos al POS.

**Quality Gate:** Staff Mobile + Staff QA (dispositivo) + Staff Security (PII).

---

