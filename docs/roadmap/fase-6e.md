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
**Estado:** Software GREEN local condicionado; claim/producción/piloto NO-GO hasta QA humana, aprobación PM, firmas A+V y piloto externo de entrega
**Capabilities:** `orders.customer_orders`  
**Referencia:** Arquitectura §5.10 regla 28 · ADR-0027 · GTM-24 congelado/condicionado · QG `docs/ops/s43-customer-orders-qg.md` · **Agentes:** Staff Frontend (owner), Staff Backend ACID, Staff Mobile (aviso)

**Entregables:**
- Implementación local GREEN de `customer_orders`, ítems, fulfillments y avisos; migración/down protegida 0036 DAT-12, dominio, ACID D1, rutas, UI, offline, E2E y chaos.
- Pedido reserva ítems **sin pago previo, venta ni CPE**; parciales múltiples reutilizan esa reserva sin segundo descuento. Snapshot válido gana; expirado libera primero y una venta nueva usa pricing actual con autorización de supervisor.
- Intención durable/auditable antes de expiry release; fallback operacional in-app. WhatsApp carece de piloto externo y no se promete; push permanece en Sprint 45. Fallo de transporte no bloquea caja ni retiene stock indefinidamente.
- Lease/envelope offline server-minted, tenant/order/branch/terminal scoped, TTL acotado, one-shot e idempotente; reconciliación autoritativa server-side.

**Criterios de aceptación:** RED→GREEN con ancestría verificada; cubre cross-tenant/cross-branch, terminal sin sesión activa, replay/doble fulfill, carreras fulfill-cancel-expire, parciales, lote/ubicación/serie/UOM, drift/approval, aviso duplicado/fallido, audit chain, cero CPE/pago al crear y cero bloqueo de checkout. “Tenant requiere pedido” solo aplica al flujo de retiro y nunca a venta ordinaria/offline.

**Quality Gate:** software GREEN local: suites finales, Playwright 5/5 con Chrome local, chaos 500, benchmark p95 1.55 ms/máximo 3.99 ms <50 ms, `scripts/quality.sh` OK tras retry de un timeout no relacionado y tres MEDIUM remediados con tests negativos. No hubo segunda Security Review limpia, staging ni entrega externa de WhatsApp, ni firmas humanas Staff QA + Staff PM A+V. Capability default-off; Staff Growth mantiene GTM-24 congelado/condicionado y producción/piloto NO-GO. Push sigue siendo frontera de Sprint 45.

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

