---
doc_id: roadmap-fase-6e
alias: Roadmap
authority: normativa
owner: "@DawoT"
fase: "6E"
sprints: "43–45"
---

### FASE 6E — Servicios y Fuerza de Venta (KipusPay v8.1, sprints 43–45)

> Convierte la promesa de vertical Servicios (GTM §2) en producto: preventa con retiro, ventas recurrentes/membresías y una caja móvil que acompaña al dueño y al vendedor. Detalle de entidades: Arquitectura §5.3 reglas 28–30. **Capabilities, no forks** (ADR-ARCH-002).

#### Sprint 43 — Preventa / pedido a cliente con retiro
**Capabilities:** `orders.customer_orders`  
**Referencia:** Arquitectura §5.3 regla 28 (distinto de `orders.lifecycle`) · **Agentes:** Staff Frontend (owner), Staff Backend ACID, Staff Mobile (aviso)

**Entregables:**
- `customer_orders`/`customer_order_items`: reserva de ítems **sin pago previo** → aviso (WhatsApp/push, Sprint 45) → venta al retiro; cumplimiento parcial.
- Venta al retiro hereda el snapshot `customer_order_items.unit_price_cents`; si `reserved_until` expiró exige pricing nuevo y aprobación; cancelación libera stock con `audit_events`.

**Criterios de aceptación:** 0 venta sin pedido si el tenant lo exige; reserva no caduca sin aviso; cumplimiento parcial concilia stock; cancelación libera 1:1.

**Quality Gate:** Staff QA + Staff PM; Staff Growth descongela claim "pedidos con retiro" tras gate.

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

