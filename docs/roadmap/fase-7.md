---
doc_id: roadmap-fase-7
alias: Roadmap
authority: normativa
owner: "@DawoT"
fase: "7"
sprints: "21–24"
---

### FASE 7 — Ecosistema Perú (KipusPay v9)

> Cierra la **parity de ecosistema** frente a facturadores/POS instalados (Bsale, Alegra, Siigo): migración, pagos locales en caja, puente al contador, API/webhooks, mensajería de comprobante y loyalty light. **No reabre** fiscal P0 ni sustituye FASE 6. Dependencia: núcleo ACID + formalización; idealmente FASE 6 en curso o cerrada para no mezclar claims. Ports: Arquitectura §1.1 / §5.4. **Capabilities, no forks** (ADR-ARCH-002).

#### Sprint 21 — Migración: importadores Bsale/Alegra (+ CSV enriquecido)
**Capabilities:** `integrations.catalog_import`  
**Referencia:** Arquitectura §5.4; GTM §8 objeción migración · **Agentes:** Staff Backend Datos (owner), Staff Frontend (Admin), Staff Growth/Content (playbook), Staff Security (secrets API keys de terceros)

**Entregables:**
- Adapters `CatalogImporter` para **Bsale** y **Alegra** (productos, clientes, series/sucursal si aplica); CSV enriquecido como fallback universal.
- Job idempotente de import (dry-run → commit); mapeo de impuestos a `taxes` / `product_taxes`; reporte de conflictos.
- Playbook “cambiarse en un día” (GTM/Content) sin prometer Siigo hasta adapter explícito (Siigo = CSV o sprint follow-up).

**Criterios de aceptación:** dry-run no escribe D1; re-import no duplica SKUs con misma clave externa; 0 secretos de API de terceros en cliente; playbook publicado solo tras gate.

**Quality Gate:** Staff Security + Staff QA; Staff Growth actualiza objeción GTM §8 a “importador listo” solo tras este sprint; Staff Principal aprueba el cierre según RACI.

---

#### Sprint 22 — Cobro local: Yape / Plin / MP QR + tarjeta Culqi/Niubiz
**Capabilities:** `payments.qr_wallets`, `payments.card_acquirer`  
**Estado:** Cerrado (QG `docs/ops/s22-payments-local-qg.md`)  
**Referencia:** Arquitectura §5.4 (`PaymentAcquirer`); GTM sellos de pago · **Agentes:** Staff Backend ACID (owner), Staff Security, Staff Frontend (caja), Staff Hardware (opcional PIN pad)

**Entregables:**
- `sale_payments.method` Zero-Trust: `yape` | `plin` | `mercadopago_qr` | `culqi` | `niubiz` | cash | card_manual | credit (existentes).
- Flujo QR en caja + estado PENDING→CAPTURED/FAILED; conciliación básica (reporte Dueño de pagos no capturados).
- Stripe permanece en **billing SaaS** de KipusPay; no confundir con medio de pago en punto de venta.

**Criterios de aceptación:** cobro offline no inventa captura de wallet (cola o rechazo claro); monto pagado lo impone servidor; 0 doble captura por reintento (idempotency key); arqueo Z distingue efectivo vs electronic; **captura manual offline (edge 2B): pago Yape aceptado sin red persiste `MANUAL_ELECTRONIC_CAPTURE`, la UI muestra la alerta ámbar "Sin conexión. Verifica visualmente la app del cliente" y Modo Dueño lo lista como no conciliado por API**.

**Quality Gate:** Staff Security + Staff QA chaos de reintentos; Staff PM firma copy “pagas como tus clientes pagan”.

---

#### Sprint 23 — Contador + API pública
**Capabilities:** `integrations.accounting_export`, `integrations.api`  
**Estado:** Cerrado (QG `docs/ops/s23-accounting-api-qg.md`)  
**Referencia:** Arquitectura §5.4; GTM plan Cadena · **Agentes:** Staff Backend Datos (export), Staff Security (API keys), Staff SRE (webhooks), Staff Content (docs API)

**Entregables:**
- `AccountingExporter`: CSV/XML asientos para **Contasis** y **Concar** (rango de fechas, por branch).
- API keys por tenant + webhooks firmados: `sale.created`, `cpe.accepted`, `cpe.rejected` (mínimo).
- Plan Guard: API/webhooks son premium (Cadena+); cobro nunca 402.

**Criterios de aceptación:** export reproducible bit-a-bit en mismo rango; webhook con HMAC + reintentos; revocación de API key inmediata (KV/DO); documentación interna publicada.

**Quality Gate:** Staff Security + Staff Principal; Staff Growth **descongela** claim “API de integraciones” en Cadena solo tras este sprint.

---

#### Sprint 24 — Mensajería WhatsApp + loyalty light (+ GRE spike opcional)
**Capabilities:** `messaging.whatsapp_receipt`, `loyalty.points`  
**Referencia:** Arquitectura §5.4; GTM Cadena fidelización · **Agentes:** Staff Backend ACID (loyalty), Staff Frontend, Staff Mobile, Staff Fiscal (solo si GRE spike)

**Entregables:**
- `MessagingSender`: envío post-venta de PDF/QR de boleta o NV por **WhatsApp Business** (opt-in del cliente).
- Fidelización mínima: puntos por `customer` + canje con authz de descuento (reusa Sprint 17); gated a plan Cadena.
- **Opcional / spike:** diseño GRE (no ship normativo completo) solo si Staff PM + Fiscal priorizan farmacia/despacho; ship completo sigue post-MVP ADR-FISCAL-001.

**Criterios de aceptación:** 0 envíos WhatsApp sin opt-in; loyalty no bypasea Zero-Trust de precios; canje genera `audit_events`; **reserva de puntos expirada en retry offline (edge A): una venta que empezó online (reserva `RESERVED`), cayó a la cola offline y expiró antes del sync se consolida **sin puntos**, sin saldo negativo y con `audit_events` `LOYALTY_RESERVATION_EXPIRED` + aviso push al Dueño**; Growth no vende “motor de fidelización” completo más allá de puntos hasta este gate.

**Quality Gate:** Staff Security (PII/messaging) + Staff PM; Staff Growth descongela claim Cadena de fidelización **light** tras gate; Staff Principal aprueba el cierre según RACI. **Estado:** Cerrado (QG `docs/ops/s24-whatsapp-loyalty-qg.md`).

---

**Backlog v10 (no sprint en FASE 7):** priorizado staff. **P1 — fiscal post-MVP** (ADR-FISCAL-001): GRE completo, percepciones/retenciones/detracciones, ND completa. **P2 — caja:** propinas, cajón de efectivo (balanza ya cubierta en Sprint 40; *handoff de turno pasó a FASE 6G Sprint 51*). **P3 — comercial/canales:** e-commerce Shopify/Woo (gating Enterprise, GTM §4.1), multi-moneda UI (solo capa de visualización), importer Siigo nativo, sandbox SUNAT + tenants demo, portal adquirente avanzado (el portal mínimo de descarga CPE de Sprint 5b queda fuera de este backlog). *Notas: "devoluciones N días" es FASE 6B Sprint 28; "analítica predictiva" dejó de ser claim suelto — es FASE 6F Sprint 46.*

---

