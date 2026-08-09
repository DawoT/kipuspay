---
doc_id: roadmap-fase-6e
alias: Roadmap
authority: normativa
owner: "@DawoT"
fase: "6E"
sprints: "43–45"
---

### FASE 6E — Servicios y Fuerza de Venta (KipusPay v8.1, sprints 43–45)

> Convierte la promesa de vertical Servicios (GTM §2) en producto: preventa con retiro, ventas recurrentes/membresías y una caja móvil que acompaña al dueño y al vendedor. Pedido de cliente: Arquitectura §5.10; membresías: §5.11; regla 30: §5.12. **Capabilities, no forks** (ADR-ARCH-002).

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
**Estado:** Software GREEN local condicionado; claim/producción/rollout NO-GO hasta cron/staging/canary Cloudflare real, QA humana, aprobación PM y firmas A+V independientes
**Capabilities:** `sales.recurring`  
**Referencia:** Arquitectura §5.11 regla 29 · ADR-0028 · GTM-25 congelado/condicionado · QG `docs/ops/s44-recurring-sales-qg.md` · vertical Servicios · **Agentes:** Staff Backend ACID (owner), Staff Data, Staff Frontend (Admin), Staff Growth (gating)

**Entregables:**
- Migración/down 0037 DAT-12, calendario civil Lima, planes versionados FIXED/CURRENT, lease/catch-up idempotente y `audit_events` `RECURRING_*`.
- Cada ocurrencia liquida venta, CPE/NV, una CxC, usage y stock físico en un batch; servicios no tocan stock y todo fallo deja el período reintentable.
- Cancelación inmediata genera NC/NV_RETURN prorrateada sin mutar origen; mora y gracia nunca bloquean caja ordinaria. Capability default-off, sin autocobro ni tarjeta/token guardado.
- Cron recurrente `*/5 * * * *` coexiste con rollup diario `0 8 * * *` mediante dispatch exacto; soporte manual solo por Worker RPC privado y ruta pública 404.

**Criterios de aceptación:** RED→GREEN con ancestría verificada aunque auditorías concurrentes no-S44 queden entre commits; 0 duplicado por tenant×plan×period_start; settlement, FIXED/CURRENT, calendario/catch-up, lease/retry, gracia, prorrateo, aislamiento y RPC privado cubiertos por unit/workerd/Worker/POS/E2E/chaos. El E2E recurrente local es 5/5; el E2E completo es 11/16 y conserva cinco fallos legacy no relacionados de home/checkout/etiquetas, por lo que no se declara full E2E GREEN.

**Quality Gate:** software GREEN local: Worker 586, adapters 271 unit + 194 workerd, POS 135, chaos 99 y dominio regression 234; recurring puro 32 con 100% líneas/95.87% ramas; chaos 500 balanceado, Playwright recurrente 5/5 con Chrome del sistema, bundle 136.67 kB gzip y `scripts/quality.sh` exit 0. Security Review encontró dos MEDIUM, remediados en GREEN mediante filtro exacto de plan y RPC privado; no hubo segunda revisión limpia. Sin cron/staging/canary Cloudflare real ni QA humana + aprobación PM A+V, Staff Growth mantiene GTM-25 congelado/condicionado y producción NO-GO.

---

#### Sprint 45 — Notificaciones push + caja móvil Android
**Estado:** Gobernanza fijada y contratos RED; implementación/claim/producción NO-GO
**Capabilities:** `mobile.push`, `client.mobile_pos`  
**Compatibilidad:** `owner.push_alerts` es alias legado del motor `mobile.push`, no una tercera capability
**Referencia:** Arquitectura §5.12 regla 30 · ADR-0029 · §7.5 (offloading) · GTM-26 congelado · **Agentes:** Staff Mobile (owner), Staff Frontend, Staff SRE, Staff Hardware

**Frontera heredada de Sprint 44:** push no forma parte de ventas recurrentes GREEN
local. Sprint 45 debe probar consentimiento, entrega real y dispositivo; Sprint 44 no
promete recordatorio push, autocobro, tarjeta guardada ni continuidad post-gracia.

**Entregables:**
- DDL objetivo 0038 para consentimiento, suscripciones cifradas, eventos y entregas; Web Push VAPID + FCM HTTP v1 detrás de `PUSH_KMS`, módulo FCM web vendorizado lazy con licencia/hash/SBOM y cero npm runtime.
- Registro canónico de alertas: cierre/descuadre, quiebre, cuotas/CxC vencidas, expiry de pedido y gracia recurrente. Billing reminders permanecen separados y todo fallo push deja intacta la operación origen.
- Consentimiento explícito de usuario/empleado resuelto en S45, independiente del consentimiento de clientes de S47. Lockscreen `REDACTED` por defecto; montos solo con política tenant + opt-in Owner y nunca PII/fiscal/token.
- `ACCEPTED` de provider y `DISPLAYED` por ACK firmado/opaco/one-shot ≤300 s son estados distintos; SLO evento→display p95 <10 s y ≥99% en red normal, excluyendo offline/doze solo con etiqueta.
- **Caja móvil** como terminal PWA Android que reusa core, RBAC, sesión/revocación, impresión fallback y cola offline; un solo Service Worker y cero fork de rol/dominio/vertical.
- Baseline actual limitado a ADR/especificación/registro/mapa/GTM y tests RED. Migración física, transportes, SW, rutas, UI, chaos y cierre pertenecen al ciclo GREEN posterior.

**Criterios de aceptación:** contratos RED fallan por módulos 0038/transporte/API/SW/chaos ausentes. Para GREEN: push DISPLAYED p95 <10s y ≥99% en red normal; caja móvil pasa 500 ventas en gama baja sin pérdida de cola; 0 push sin consentimiento, PII/secreto o duplicado visible; modos offline idénticos al POS.

**Quality Gate:** abierto/NO-GO. Requiere Staff Mobile + Staff QA (dispositivo Android físico) + Staff Security (PII), Web Push/FCM staging real, chaos 500 y firmas A+V independientes.

---

