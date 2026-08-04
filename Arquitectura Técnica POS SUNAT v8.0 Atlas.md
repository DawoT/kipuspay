# **Arquitectura Técnica: POS & Facturación Electrónica Multitenant Edge-Native (SUNAT) \- Versión 8.0 "Atlas" (Enterprise ERP, Global SaaS & Financial Integrity Engine)**

> **Codename interno:** *Atlas*. Cada tenant es un mundo que el sistema sostiene sin que lo sienta caer.

## **0\. Identidad de Arquitectura de Marca — Por Qué Atlas No Compite, Redefine la Categoría**

La mayoría de los sistemas POS en Latinoamérica (Bsale, Defontana, Alegra, Siigo) comparten una debilidad estructural común: son aplicaciones monolíticas alojadas en un servidor central, con sincronización *best-effort*, sin garantías transaccionales reales offline, y con una interfaz genérica de software contable tradicional.

**Atlas v8.0** no se posiciona como "un POS más rápido". Se posiciona como la primera **infraestructura financiera Edge-Native de Latinoamérica** — la diferencia entre construir un auto más rápido y reinventar el motor de combustión.

### **0.1 Los Tres Pilares de Diferenciación de Marca**

| Pilar | Lo que hace la competencia | Lo que hace Atlas | Narrativa de marca |
| :---- | :---- | :---- | :---- |
| **Integridad Financiera** | Confían en el cliente o en colas eventualmente consistentes. | Transacciones D1 explícitas con ROLLBACK real, cero condiciones de carrera de stock. | *"Cada sol cuadra. Siempre."* |
| **Latencia** | **![][image1]** desde servidores centralizados (AWS us-east-1, GCP). | Sub\-![][image2] ejecutando en ![][image3] ciudades Edge simultáneamente. | *"Tu venta \#1 y tu venta \#10,000 se sienten igual de rápidas."* |
| **Resiliencia Offline** | Modo offline como parche o feature secundaria. | Offline-first como principio arquitectónico raíz, con conciliación garantizada. | *"Sin internet no es una excepción. Es un estado normal del sistema."* |

### **0.2 Sistema de Diseño "Ledger Minimalism"**

Se introduce formalmente el lenguaje de diseño de producto que acompaña la arquitectura:

1. **Principio Tipográfico:** Cifras monetarias siempre en fuente tabular (font-variant-numeric: tabular-nums) — los números nunca "bailan" al actualizarse en tiempo real, reforzando la sensación de precisión contable.  
2. **Paleta Semántica de Estado Financiero:** En lugar de verde/rojo genérico, se usa una paleta de tres tonos inspirada en libros contables físicos: **Tinta** (neutral, \#1A1D23), **Sello** (confirmado, \#0F6B4C) y **Alerta de Conciliación** (\#B5461D, un ámbar-óxido) para comunicar discrepancias operativas de forma profesional.  
3. **Micro-interacción de Sincronización:** Cada registro pendiente de sync offline muestra un indicador de *costura* (*stitching indicator*) — una línea punteada animada sutil que se convierte en línea sólida al confirmarse en el servidor.  
4. **Densidad Adaptativa:** La UI del cajero (alta frecuencia) usa alta densidad con targets táctiles amplios; la UI administrativa usa espaciado generoso inspirado en plataformas financieras de vanguardia (Stripe Dashboard, Linear).  
5. **Modo "Vitrina" (Customer-Facing Display):** Pantalla secundaria orientada al cliente final con confirmación visual de compra en tiempo real, ofreciendo una experiencia retail de nivel premium.

### **0.3 Posicionamiento Competitivo Explícito**

                    Confiabilidad Transaccional  
                              ▲  
                              │  
                    ATLAS ●   │  
                    v8.0      │  
                              │  
          Bsale ●             │             ● SAP B1 / Odoo  
        Alegra ●               │           (potentes, lentos,  
                              │            costosos, on-prem)  
     ──────────────────────────┼──────────────────────────▶  
     Lento / Costoso           │           Rápido / Económico  
                              │  
              Facturedo ●     │  
              Siigo ●         │    ● (vacío — nadie más  
                              │       ocupa este cuadrante)  
                              │  
                    Baja Confiabilidad

Atlas ocupa el cuadrante superior-derecho: **confiabilidad de nivel bancario a costo de infraestructura Edge serverless** (![][image4] por cada 1,000 comercios).

## **1\. Visión General del Sistema y Principios de Diseño**

El objetivo de Atlas v8.0 es ofrecer rendimiento extremo (Sub-50ms en Edge), costo operacional cercano a ![][image5] en etapa inicial y escalabilidad horizontal para soportar ![][image6] comercios, ![][image7] sucursales y ![][image8] de comprobantes diarios sin bloqueos de concurrencia ni duplicaciones contables.

### **Los 11 Principios Fundamentales (v8.0 → v8.2)**

1. **Edge-First Native & Dynamic Sharding:** Cero dependencias de Node.js o contenedores tradicionales. Ejecución directa sobre V8 Isolates en Cloudflare Workers con sharding horizontal dinámico de bases de datos Cloudflare D1.  
2. **Domain-Agnostic Core (Capabilities) & Modular Tax Engine:** El motor de cobro/stock/caja **no ramifica por vertical de marketing**. El runtime pregunta **capabilities** del tenant (`inventory.batches`, `orders.kds`, … — ADR-ARCH-002), no `if (vertical === 'pharmacy')`. Los impuestos (IGV, ICBPER, IVA, etc.), tipos de documento e identidades tributarias se desacoplan vía `taxes` / `product_taxes` y se calculan strictly en el servidor. `vertical_type` es solo onboarding/analytics/playbooks (GTM), nunca eje del hot path.  

3. **Zero-Trust Client Execution & Anti-Tampering:** El frontend del POS es un cliente no confiable. Todos los precios, tipos de cambio (Forex), descuentos, impuestos y deducciones de stock se calculan e imponen de forma estricta en el servidor antes de autorizar la persistencia.  
4. **Multi-Branch, Split Payments & Cash Control:** Aislamiento estricto de inventarios por sucursal (branches), pagos fraccionados múltiples (sale\_payments) y vinculación obligatoria a sesiones de caja abiertas (cash\_register\_sessions) para arqueos y reportes Z.  
5. **SaaS Monetization, Soft Caps & Fail-Closed Revocation (v8.2):** Control de vigencia de Trial/planes con HTTP 402 **solo en features premium** (Modo Dueño, multi-caja, reportes, API) — **nunca en cobro ni emisión**. Arranque incluye un cupo mensual de comprobantes; el **excedente se factura** (sobregiro, GTM §4.1 / Arquitectura §4.1) — **jamás se apaga la caja** en hora punta. El upgrade por capacidad (segunda caja, local, Dueño) sigue vigente. Periodo de gracia ante pago fallido (GTM §4.3). Suspensión de tenants en tiempo real vía webhooks Stripe/MercadoPago con firma criptográfica; si el control de revocación no está disponible, las rutas protegidas responden 503 y no autorizan acceso.  
6. **Máquina de Estados Estricta, Formalización Progresiva & Pipeline Fiscal SUNAT:** Atlas opera en tres modos (`INTERNAL_CONTROL` | `FORMALIZING` | `ELECTRONIC_ISSUER`). **NV** = control interno (`NOT_APPLICABLE`). CPE: Factura `01` se envía **unitaria** (plazo máx. **3 días calendario**); Boleta `03` y NC/ND de boleta van por **Resumen Diario** (plazo máx. **7 días calendario**). Canal de transporte: puerto `FiscalTransport` (ADR-FISCAL-002) — default **PSE Atlas directo a SUNAT**; OSE/PSE tercero como adaptadores. **No** se usa “contingencia SUNAT” como eufemismo de “aún no hay certificado” (ADR-FISCAL-001). Guards: régimen×modo, RUC en factura, ID si boleta ≥ S/ 700, CDR `ACCEPTED` antes de NC.  
7. **Zona Horaria Oficial (UTC-5) y Skew de `issuedAt`:** Normalización America/Lima; `issuedAt` offline aceptado solo dentro de ventana de skew máxima **±6 horas** vs reloj de servidor; la fecha fiscal (día del Resumen Diario y `must_submit_by`) se deriva de la fecha Lima autoritativa tras reconciliación.  
8. **Atomicidad Transaccional Garantizada (Financial ACID Guarantee):** Ninguna operación que altere inventario, caja o cuentas por cobrar/pagar puede persistir parcialmente. Toda escritura multi-tabla se ejecuta en un `db.batch([...])` D1 atómico (la API no expone `db.transaction(callback)`); las validaciones se preparan antes y los guards SQL hacen fallar el batch si cambia una precondición. **Todo monto se almacena como INTEGER en centavos** (convención `*_cents`, §5.0) — la garantía financiera es falsa con coma flotante.
9. **Ledger Completo del Ciclo Económico (Full Economic Cycle Ledger):** El sistema modela el ciclo financiero completo: cuentas por cobrar (CxC), cuentas por pagar (CxP), órdenes de compra, proveedores y egresos de caja chica como entidades de primera clase en el DDL.  
10. **Resiliencia de Red Adversarial y de Dispositivo:** Payloads masivos se fragmentan proactivamente (*chunking* con snapshot de perfil CRM por venta; la consolidación de clientes es **server-side** vía upsert idempotente LWW — §6, con una única excepción de single-writer en cliente: el Service Worker consolida los snapshots del **mismo** cliente nuevo (`local_client_id`) dentro del mismo turno para emitir una sola escritura — SYN-11 enmendada; el servidor sigue siendo la autoridad final con LWW por `profile_updated_at`), las respuestas de idempotencia devuelven el estado reconciliable completo y ninguna rutina asume una respuesta HTTP exitosa como única fuente de verdad. Incluye límites de IndexedDB (`QuotaExceededError`), presión de memoria en dispositivos de gama baja y alerta al cajero antes de corromper la cola offline.
11. **Zero-Dependency Client & Computational Offloading (v8.2):** El Edge **no renderiza** tickets, QR ni PDF. Cero dependencias npm de runtime en el POS para generación visual/hardware (pdfmake, qrcode.js, etc.). QR, ticket e ESC/POS se resuelven con Web Platform APIs + Worker + (si hace falta) código **vendorizado** fijado en el repo. Presupuesto de bundle enforceable en CI (Arquitectura §7.5).

### **1.1 Principios de ingeniería de código (Atlas v8.1) — DRY, SOLID, hexagonal**

Contrato staff para que el corpus no escale como monolito improvisado. **No reabre** ADR-FISCAL-001 ni el pipeline §5.2. Detalle enforceable: Agents (principio rector + Quality Gate transversal).

#### Auditoría de partida (veredicto)

| Patrón | Estado pre-v8.1 | Remediación |
|---|---|---|
| Zero-Trust / ACID / multi-tenant / ADRs fiscales | Fuerte | Mantener |
| DRY de dominio | No especificado | Una regla = un módulo dueño; Agents/GTM **citan** Arquitectura, no re-especifican |
| Agnosticismo de vertical | Parcial (tax sí; ops ramificaba por enum) | Capability model (ADR-ARCH-002) |
| SOLID / boundaries | Débil (`processOfflineSaleAtomic` God Function; solo Strategy de impresión) | Pipeline + ports |
| Crecimiento de código | Sin mapa de packages | Monorepo objetivo abajo |

#### DRY de dominio

1. **Single source of truth:** reglas de cobro, stock, fiscal y caja viven en Arquitectura (+ packages `domain-*` al codear). Agents describe sprints/gates; GTM describe claims comerciales — ambos **referencian**, no duplican matrices normativas.
2. **Prohibido copiar** el sale engine entre Worker API, crons, admin o POS offline: un solo pipeline de dominio; adapters solo traducen I/O.
3. Landings GTM pueden variar copy; el **producto** no forkea por vertical.

#### SOLID mínimo — pipeline de venta

`processOfflineSaleAtomic` es el **orquestador ACID** (preflight + `db.batch([...])` atómico), no el dueño de cada regla. Pasos con interfaces (Dependency Inversion):

1. `PriceResolver` — listas de precio Zero-Trust  
2. `TaxComputer` — motor modular de impuestos  
3. `DiscountAuthzPolicy` / `CreditLimitPolicy` — umbrales + override  
4. `StockAllocator` — implementaciones: simple | FEFO (`inventory.batches`) | BOM (`inventory.bom`)  
5. `LedgerPoster` — CxC/CxP/caja  
6. `AuditSink` — `audit_events`  
7. Pre-sale opcional: `OrderBilling` si capability `orders.*` (split → 1..N sales)

**Open/Closed:** FEFO/BOM/órdenes/transferencias se agregan como implementaciones o módulos de capability, **sin** editar el orquestador con `switch(vertical)`.

**Interface Segregation:** roles/permisos por capability (`orders.kds.operate`), no inflar el union global de roles con formas de un solo vertical (p. ej. evitar que `kds` sea el único modelo de “estación”). Roles core (`UserSession.role`): `owner | admin | supervisor | cashier` — **`supervisor`** = aprobaciones con PIN (descuentos, arqueos, mermas) con permisos restringidos por capability (GTM §3.3.1); **`kds` NO es rol core** — el acceso a pantalla de cocina se otorga por capability `orders.kds.operate` sobre el rol `cashier` (ADR-ARCH-002).

**Puertos conocidos hoy:** `LanWssPrinterStrategy` (hardware). Dominio de venta: `TaxPolicy`, `StockAllocator`, `PriceResolver`, `AuditSink`, `FiscalEmitter` (ACL SUNAT en worker fiscal).

**Puertos de ecosistema / v8.2 (FASE 7–8):**

| Puerto | Responsabilidad | Adapters iniciales |
|---|---|---|
| `PaymentAcquirer` | Captura/autorización de pago en caja (no billing SaaS) | Yape, Plin, Mercado Pago QR, Culqi, Niubiz |
| `CatalogImporter` | Import idempotente catálogo/clientes/series | Bsale, Alegra, CSV |
| `AccountingExporter` | Asientos / libros para el contador | Contasis, Concar |
| `MessagingSender` | Envío post-venta de representación (PDF/QR) | WhatsApp Business |
| `PublicApiWebhook` | Eventos salientes firmados a integradores | HMAC + reintentos |
| `FiscalTransport` | Envío/consulta CPE (ADR-FISCAL-002) | `ATLAS_PSE_DIRECT` (default), `ose_*`, `pse_third_party` |
| `PrinterTransport` | Entrega de ticket ESC/POS o sistema | WebUSB → WSS LAN → Web Bluetooth → `window.print()` / SystemPrint |

Stripe/MercadoPago en middleware de **suscripción Atlas** ≠ `PaymentAcquirer` de punto de venta.

#### Hexagonal / monorepo objetivo (mapa; no scaffold aún)

```text
packages/
  domain-sales/          # pipeline + policies de cobro
  domain-inventory/      # FEFO, BOM, transfers
  domain-fiscal-pe/      # UBL, RC, formalization guards (Anti-Corruption Layer Perú)
  domain-cash/           # sesiones, Z ciego, authz descuentos
  domain-integrations/   # importers, exporters, messaging contracts
  contracts-sync/        # idempotency envelopes / outbox
  adapters-d1/
  adapters-sunat/
  adapters-payments-pe/  # Yape, Plin, MP, Culqi, Niubiz
  adapters-importers/    # Bsale, Alegra, CSV
  adapters-accounting/   # Contasis, Concar
  adapters-messaging/    # WhatsApp Business
apps/
  pos-web/               # SvelteKit
  worker-api/            # Hono composition root
  worker-fiscal/
```

Regla: `packages/domain-*` **sin** imports de Hono, D1, Svelte ni SDK SUNAT. Workers/apps = composition root + adapters.

#### ADR-ARCH-002 — Capability model vs `vertical_type`

**Estado:** aceptado (v8.1). **Supersede parcialmente** la lectura ingenua del Principio 2 pre-v8.1 (“agnóstico” = solo tax tables).

| Concepto | Uso permitido | Uso prohibido |
|---|---|---|
| `vertical_type` / `TenantContext.vertical` | Onboarding, playbooks, analytics, empaquetado GTM | `if` / `switch` en sale, stock, fiscal, caja |
| `tenant_capabilities` (flags o filas) | Runtime: habilitar módulos y policies | Sustituir cumplimiento SUNAT o ACID |

**Capabilities canónicas (FASE 6 → flags):**

| Capability | Sprint Agents | Empaquetado GTM típico |
|---|---|---|
| `cash.blind_z` | 17 | Retail / “cada sol cuadra” |
| `cash.discount_authz` | 17 | Retail |
| `ledger.credit_limit_cents` | 17 | Retail / CxC |
| `audit.sensitive_actions` | 17 | Todos |
| `inventory.batches` (FEFO) | 18 | Farmacias |
| `inventory.bom` | 18 | Retail / food |
| `pricing.lists` | 18 | Multi-lista |
| `orders.lifecycle` | 19 | Restaurantes |
| `orders.kds` | 19 | Restaurantes |
| `orders.split_bill` | 19 | Restaurantes |
| `stock.transfers` | 20 | Cadenas |
| `purchasing.partial_receive` | 20 | Cadenas / retail |

**Capabilities canónicas (FASE 7 / ecosistema → flags):**

| Capability | Sprint Agents | Empaquetado GTM típico |
|---|---|---|
| `integrations.catalog_import` | 21 | Migración / objeción #1 |
| `payments.qr_wallets` | 22 | Cobro PE (Yape/Plin/MP) |
| `payments.card_acquirer` | 22 | Retail / Culqi-Niubiz |
| `integrations.accounting_export` | 23 | Crece+ / contador |
| `integrations.api` | 23 | Cadena (API + webhooks) |
| `messaging.whatsapp_receipt` | 24 | Post-venta / activación |
| `loyalty.points` | 24 | Cadena (fidelización light) |

**Capabilities canónicas (FASE 6B, reglas 13–17, sprints 28–32):**

| Capability | Sprint Agents | Empaquetado GTM típico |
|---|---|---|
| `sales.returns` | 28–32 | Devoluciones con política N días |
| `purchasing.three_way` | 28–32 | Control de proveedor / OC |
| `pricing.promotions` | 28–32 | Promos y tramos |
| `catalog.variants`, `catalog.uom` | 28–32 | Multi-variante / unidades |
| `sales.layaway` | 28–32 | Apartados |
| `ledger.chart_of_accounts` | 28–32 | Diario contable (retail) |

**Capabilities canónicas (FASE 6C, reglas 18–22, sprints 33–37):**

| Capability | Sprint Agents | Empaquetado GTM típico |
|---|---|---|
| `sales.quotes` | 33–37 | Cotizaciones/presupuestos |
| `purchasing.returns` | 33–37 | Devolución a proveedor |
| `ledger.store_credit` | 33–37 | Crédito de tienda / gift cards |
| `sales.installments` | 33–37 | Cuotas / pago en partes |
| `sales.commissions` | 33–37 | Comisiones de vendedor |

**Capabilities canónicas (FASE 6D, reglas 23–27, sprints 38–42):**

| Capability | Sprint Agents | Empaquetado GTM típico |
|---|---|---|
| `inventory.locations` | 38–42 | Ubicaciones de inventario |
| `inventory.serials` | 38–42 | Números de serie |
| `inventory.scale` | 38–42 | Venta por peso / balanza |
| `catalog.price_labels` | 38–42 | Etiquetas de precio |
| `data.backup` | 38–42 | Export / restore del negocio |

**Capabilities canónicas (FASE 6E, reglas 28–30, sprints 43–45):**

| Capability | Sprint Agents | Empaquetado GTM típico |
|---|---|---|
| `orders.customer_orders` | 43–45 | Preventa / pedido a cliente |
| `sales.recurring` | 43–45 | Recurrentes / membresías |
| `mobile.push`, `client.mobile_pos` | 43–45 | Push + caja móvil |

**Capabilities canónicas (FASE 6F, reglas 31–33, sprints 46–49):**

| Capability | Sprint Agents | Empaquetado GTM típico |
|---|---|---|
| `analytics.forecasting` | 46 | Predictiva (Cadena, freeze 46) |
| `compliance.lpdp`, `platform.dr` | 47–48 | LPDP / DR-BCP (Cadena) |
| `analytics.agentic_insights` | 49 | Insight / briefing (Cadena/Enterprise, freeze 49) |

**Capabilities canónicas (FASE 6G, reglas 34–37, sprints 50–53):**

| Capability | Sprint Agents | Empaquetado GTM típico |
|---|---|---|
| `catalog.quick_add`, `sales.quick_line` | 50 | Escáner con cámara + venta rápida (gate 50) |
| `ops.shift_handoff` | 51 | Handoff de turno sin cerrar caja (gate 51) |
| `ops.team_invite` | 51 | Equipo: invitación + PIN/badge |
| `onboarding.tour` | 52 | Product Tour + checklist "segundo día" |
| `hardware.diagnostics` | 53 | Troubleshooter de impresora/balanza |

> FASE 8 (sprints 25–27) no introduce capabilities de producto: añade infraestructura transversal (`print outbox` §7.5, `cupo` §4.1, `FiscalTransport/breaker` §8.1) — no forman parte del empaquetado GTM.

Playbooks de onboarding (farmacia vs resto) **activan bundles de capabilities**; no crean forks de código.

## **2\. Diagrama de Arquitectura Global (v8.0)**

┌─────────────────────────────────────────────────────────────────────────────────────────────────┐  
│                                   CLIENT / POS (SvelteKit)                                      │  
│ \- Offline-First Engine (IndexedDB \+ Outbound Event Queue \+ Batch/BOM Allocation)                 │  
│ \- Chunked Sync Dispatcher (Lotes de 25-35 tx, perfil CRM snapshot + upsert LWW server, backpressure-aware) │  
│ \- Hardware Router (LanWssPrinterStrategy / Dynamic Width 58mm-80mm / Capacitor Bridge)          │  
│ \- Modo Vitrina (Customer-Facing Display) — diferenciador visual en punto físico                 │  
│ \- DLQ Remediation, Cash Management UI & Feature-Gated Views                                     │  
└────────────────────────────────────────────────┬────────────────────────────────────────────────┘  
                                                 │ HTTPS / WebSockets (Durable Objects)  
                                                 ▼  
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐  
│                               CLOUDFLARE EDGE WORKER (Hono.js)                                  │  
│                                                                                                 │  
│  ┌───────────────────────┐   ┌────────────────────────┐   ┌──────────────────────────────────┐  │  
│  │ Tenant Context Router │───│ Fail-Closed DO Guard   │───│ Plan & Trial Guard (402)         │  │  
│  │ (KV Cache \+ DO Flag)  │   │ (DO Instant Revoke)    │   │ (Trial Ends \+ Plan Limits)       │  │  
│  └───────────────────────┘   └────────────────────────┘   └──────────────────────────────────┘  │  
│                                           │                                                     │  
│  ┌────────────────────────────────────────┴──────────────────────────────────────────────────┐  │  
│  │     CORE DOMAIN, ERP ENGINE & AUTH SYNC (Zero-Trust, Tax Engine & UTC-5 Timezone)             │  │  
│  │  \- Auth Sync Middleware (IdP \-\> D1 UserSession) \- Server Tax & Forex Engine                   │  │  
│  │  \- Zero-Trust Price & Exchange Rate Validator  \- Cash Session Check                         │  │  
│  │  \- Formalization Mode × Document Type Guard    \- Service Inventory Bypass                    │  │  
│  │  \- Multi-Payment Split Engine                  \- Credit Note Double-Refund Guard             │  │  
│  │  \- D1 Explicit Transaction Engine (ACID Guard) \- AR/AP Ledger Engine (CxC/CxP)                │  │  
│  │  \- Idempotent Sync Reconciliation Responder    \- Cash Session Expense Guard                  │  │  
│  └───────────────────────┬──────────────────────────────────────────────────────────────────┘  │  
└───────────────┬──────────┴────────────────┬───────────────────────────┬─────────────────────────┘  
                │                           │                           │  
                ▼                           ▼                           ▼  
┌──────────────────────────┐    ┌──────────────────────────┐    ┌─────────────────────────────────┐  
│ Dynamic D1 Shard Router  │    │ Cloudflare KV \+ DO       │    │ Cloudflare Queues               │  
│ (Tenant \-\> Shard Map)    │    │ Tenant Config & Revoke   │    └────────────────┬────────────────┘  
└───────────────┬──────────┘    └──────────────────────────┘                     │ Async Ingestion  
                │                                                                ▼  
   ┌────────────┴────────────┐                                      ┌─────────────────────────────┐  
   ▼                         ▼                                      │ SUNAT Async Resilient Worker│  
┌──────────────┐      ┌──────────────┐                              │ \- Branch Series Resolver    │  
│ D1 Shard \#1  │  ... │ D1 Shard \#N  │                              │ \- UBL 2.1 XML Generator     │  
│ (Tenants 1-N)│      │(Tenants M-Z) │                              │ \- WebCrypto XMLDSIG Signer  │  
└──────┬───────┘      └──────┬───────┘                              └──────────────┬──────────────┘  
       │                     │                                                     │  
       └──────────┬──────────┘                                       ┌─────────────┴──────────────┐  
                  │ Async Parallel Cron Aggregator                   ▼                            ▼  
                  ▼                                     ┌─────────────────────────┐  ┌────────────────────┐  
     ┌──────────────────────────┐                       │ SUNAT / OSE / R2 Store  │  │ Dead-Letter Queue  │  
     │ Cloudflare Analytics     │                       └─────────────────────────┘  │ (DLQ Re-queue Loop)│  
     │ Engine (Global Metrics)  │                                                    └────────────────────┘  
     └──────────────────────────┘

## **3\. Autenticación Integrada (IdP Sync) & SaaS Plan Enforcement Middleware**

// src/middleware/tenantAndAuthRouter.ts  
import { createMiddleware } from 'hono/factory';  
import { Context } from 'hono';

export interface UserSession {  
  userId: string;  
  tenantId: string;  
  branchId: string;  
  allowedBranches: string\[\];  
  // Roles de caja (producto, GTM §3.3.1). kds NO es rol core: es capability
  // `orders.kds.operate` (Interface Segregation, ADR-ARCH-002) — no vertical_type
  // en el núcleo (regla §1.1).
  role: 'owner' | 'admin' | 'supervisor' | 'cashier';  
  permissions: string\[\];  
}

export interface TenantContext {  
  id: string;  
  ruc: string;  
  shardId: string;  
  // Planes de producto (GTM §4.1): arranque|crece|cadena|enterprise — el enum
  // del middleware y el gating de capabilities/reportes usan estos 4 valores.
  planId: 'arranque' | 'crece' | 'cadena' | 'enterprise';  
  subscriptionStatus: 'trial' | 'active' | 'past\_due' | 'canceled';  
  trialEndsAt: string | null;  
  vertical: 'restaurant' | 'pharmacy' | 'hardware' | 'retail' | 'service';  
  status: 'active' | 'suspended';  
}

export const tenantAndAuthMiddleware \= () \=\> {  
  return createMiddleware(async (c: Context, next) \=\> {  
    const host \= c.req.header('host') || '';  
    // SEC-01: identidad SOLO desde el JWT verificado. El middleware exige
    // `Authorization: Bearer <JWT>` y verifica firma (WebCrypto), exp/iat/nbf y
    // denylist de alg (`none`, HS si hay JWKS). `tenantId` y `externalAuthId` se
    // derivan ÚNICAMENTE de los claims verificados.
    // `x-tenant-id` se usa solo como HINT de shard y DEBE coincidir con el claim
    // (mismatch → 403). `x-external-auth-id` deja de ser fuente de identidad.
    const authz \= c.req.header('authorization') || '';  
    const jwtClaims \= authz.startsWith('Bearer ')  
      ? await verifyJwt(c.env, authz.slice(7))   // throws JWT_INVALID | JWT_EXPIRED | JWT_ALG_NONE
      : null;  
    if (\!jwtClaims) {  
      return c.json({ error: 'Missing or invalid Bearer JWT', code: 'UNAUTHENTICATED' }, 401);  
    }  
    const tenantId \= jwtClaims.tenantId;  
    const externalAuthId \= jwtClaims.sub || jwtClaims.externalAuthId;  
    const hintTenantId \= c.req.header('x-tenant-id') || host.split('.')\[0\];  
    if (hintTenantId && hintTenantId \!== tenantId) {  
      return c.json({ error: 'Tenant hint mismatch with verified JWT', code: 'TENANT_HINT_MISMATCH' }, 403);  
    }

    // PERF-04: caché de 2 niveles (anti thundering herd, §8.1) en el AUTH path:
    // in-isolate (TTL 5-10s) → KV fallback → DO SOLO en cache-miss. El DO NUNCA se
    // consulta por request (contradice §8.1 "DO no se consulta en el hot path de lectura").
    let tenant: TenantContext | null;
    try {
      tenant \= await getTenantCached(c.env, tenantId);
    } catch (err) {
      return c.json({ error: 'Tenant control plane unavailable', code: 'AUTH_CONTROL_UNAVAILABLE' }, 503);
    }
    if (\!tenant) {  
      return c.json({ error: 'Tenant non-existent' }, 404);  
    }  
    try {
      if (await isTenantRevokedCached(c.env, tenantId)) {
        return c.json({ error: 'Tenant account suspended or revoked' }, 403);
      }
    } catch (err) {
      return c.json({ error: 'Tenant revocation control plane unavailable', code: 'REVOCATION_CHECK_UNAVAILABLE' }, 503);
    }

    if (tenant.status \!== 'active') {  
      return c.json({ error: 'Tenant account inactive' }, 403);  
    }

    // 3\. Evaluar vigencia de suscripción / Trial (SaaS Enforcement \- Code 402)  
    // IMPORTANTE (GTM §4.1 / §4.3): 402 aplica SOLO a features premium.  
    // Rutas de cobro / caja / emisión de comprobantes NUNCA se bloquean por plan,  
    // volumen de boletas ni past_due dentro del periodo de gracia.  
    // En past_due post-gracia: degradar capabilities premium según plan
    // (modo_dueño, multi_caja, reportes_avanzados, api, insights — registro
    // canónico §1.1 / ADR-ARCH-002); mantener sale/checkout fail-open.  
    if (tenant.subscriptionStatus \=== 'trial' && tenant.trialEndsAt) {  
      const trialEnd \= new Date(tenant.trialEndsAt).getTime();  
      if (Date.now() \> trialEnd && isPremiumFeatureRoute(c.req.path)) {  
        return c.json({   
          error: 'Payment Required: Trial period expired. Please upgrade your plan.',  
          code: 'TRIAL\_EXPIRED'  
        }, 402);  
      }  
    }

    if ((tenant.subscriptionStatus \=== 'past\_due' || tenant.subscriptionStatus \=== 'canceled')  
        && isPremiumFeatureRoute(c.req.path)  
        && isPastGracePeriod(tenant)) {  
      return c.json({   
        error: 'Payment Required: Subscription past due or canceled.',  
        code: 'SUBSCRIPTION\_INACTIVE'  
      }, 402);  
    }

    // 4\. Inyectar binding dinámico de D1  
    const dbShard \= c.env\[tenant.shardId\] as D1Database;  
    if (\!dbShard) {  
      return c.json({ error: 'Database shard unmapped' }, 500);  
    }

    // 5\. Autenticación y Carga de Permisos (IdP Sync \-\> D1)
    if (!externalAuthId) {
      return c.json({ error: 'JWT subject missing', code: 'UNAUTHENTICATED' }, 401);
    }
    if (externalAuthId) {  
      const userRecord \= await dbShard.prepare(  
        \`SELECT id, role, permissions, branch\_id FROM users   
         WHERE external\_auth\_id \= ? AND tenant\_id \= ? AND is\_active \= 1 AND deleted\_at IS NULL\`  
      ).bind(externalAuthId, tenant.id).first\<{  
        id: string;  
        role: UserSession\['role'\];  
        permissions: string;  
        branch\_id: string | null;  
      }\>();

      if (!userRecord) {
        return c.json({ error: 'Local user is not active for this tenant', code: 'FORBIDDEN_USER' }, 403);
      }
      if (!userRecord.branch\_id && ['cashier', 'supervisor'].includes(userRecord.role)) {
        return c.json({ error: 'Cash role requires a branch', code: 'FORBIDDEN_BRANCH' }, 403);
      }
      {  
        const userSession: UserSession \= {  
          userId: userRecord.id,  
          tenantId: tenant.id,  
          branchId: userRecord.branch\_id ?? '',  
          allowedBranches: userRecord.branch\_id ? [userRecord.branch\_id] : [],  
          role: userRecord.role,  
          permissions: JSON.parse(userRecord.permissions || '\[\]')  
        };  
        c.set('user', userSession);  
      }  
    }

    c.set('tenant', tenant);  
    c.set('db', dbShard);

    await next();  
  });  
};

// PERF-04: helpers de caché de 2 niveles del auth path (mismo patrón que el breaker §8.1).
// El mapa es por-isolate, TTL 10s y con límite de entradas para no retener tenants sin límite.
const isolateCache \= new Map\<string, { value: any; ts: number }\>();  
const MAX_ISOLATE_CACHE_ENTRIES \= 10_000;  

function putIsolateCache(key: string, value: any): void {  
  if (isolateCache.size \>= MAX_ISOLATE_CACHE_ENTRIES && \!isolateCache.has(key)) {  
    const oldest \= isolateCache.keys().next().value as string | undefined;  
    if (oldest) isolateCache.delete(oldest);  
  }  
  isolateCache.set(key, { value, ts: Date.now() });  
}

function mapTenantRow(raw: any): TenantContext {
  return {
    id: raw.id,
    ruc: raw.ruc,
    shardId: raw.shardId ?? raw.shard_id,
    planId: raw.planId ?? raw.plan_id,
    subscriptionStatus: raw.subscriptionStatus ?? raw.subscription_status,
    trialEndsAt: raw.trialEndsAt ?? raw.trial_ends_at ?? null,
    vertical: raw.vertical ?? raw.vertical_type,
    status: raw.status ?? (raw.is_active ? 'active' : 'suspended')
  } as TenantContext;
}

async function getTenantCached(env: any, tenantId: string): Promise\<TenantContext | null\> {  
  const cached \= isolateCache.get(\`tenant:${tenantId}\`);  
  if (cached && Date.now() \- cached.ts < 10_000) return cached.value;  
  try {  
    const raw \= await env.TENANT\_KV.get(\`tenant:${tenantId}\`);  
    if (\!raw) return null;  
    const parsed \= mapTenantRow(JSON.parse(raw));  
    putIsolateCache(\`tenant:${tenantId}\`, parsed);  
    return parsed;  
  } catch (err) {  
    throw new Error('TENANT_CACHE_UNAVAILABLE');  
  }  
}

async function isTenantRevokedCached(env: any, tenantId: string): Promise\<boolean\> {  
  const cached \= isolateCache.get(\`revoked:${tenantId}\`);  
  if (cached && Date.now() \- cached.ts < 10_000) return cached.value;  

  // KV solo puede acelerar una revocación positiva; un `0` no puede ocultar el estado
  // autoritativo del DO y nunca se persiste como permiso indefinido.
  let kvFlag: string | null \= null;  
  try {  
    kvFlag \= await env.TENANT\_KV.get(\`revocation:${tenantId}\`);  
  } catch (err) {  
    // Continúa al DO; no convierte una caída de KV en un falso `revoked=false` cacheado.
  }  
  if (kvFlag \=== '1') {  
    putIsolateCache(\`revoked:${tenantId}\`, true);  
    return true;  
  }  

  try {  
    const id \= env.TENANT\_STATE\_DO.idFromName(tenantId);  
    const stub \= env.TENANT\_STATE\_DO.get(id);  
    const res \= await stub.fetch(new URL('/status', env.FQDN));  
    if (\!res.ok) throw new Error(\`DO responded with status ${res.status}\`);  
    const data \= await res.json() as { revoked: boolean };  
    const revoked \= data.revoked \=== true;  
    putIsolateCache(\`revoked:${tenantId}\`, revoked);  
    return revoked;  
  } catch (err) {  
    // Fail-closed explícito: no autorizar cuando no puede comprobarse revocación.
    throw new Error('REVOCATION_CHECK_UNAVAILABLE');  
  }  
}

// SEC-03 — Gestión de secretos (política):
//   password_hash, pin_hash, transfer_pin_hash → argon2id (m=64MiB, t=3, p=1).
//   api_keys.key_hash → HMAC-SHA256 con salt aleatorio por key (+ pepper).
//   webhook_endpoints.secret_hash → SHA-256 con salt.
//   PIN de caja verificado server-side con lockout 5 fallos/15 min (SEC-11).
//   Clave privada del .pfx SUNAT: SOLO en Workers Secrets / envoltura KMS
//   (tabla tenant_certificates.private_key_kms_ref); jamás en D1/KV/R2. Rotación ≥ 2 años
//   y en caso de compromiso (SEC-03).

## **4\. Webhooks de Pasarela de Pago & Invalidation Instantánea con Firma Criptográfica WebCrypto**

// src/workers/paymentWebhookWorker.ts  
import { Hono } from 'hono';

const app \= new Hono\<{ Bindings: Env }\>();

app.post('/v1/webhooks/stripe', async (c) \=\> {  
  const signatureHeader \= c.req.header('stripe-signature');  
  const rawBody \= await c.req.text();  
  const webhookSecret \= c.env.STRIPE\_WEBHOOK\_SECRET;

  if (\!signatureHeader || \!webhookSecret) {  
    return c.json({ error: 'Webhook signature verification failed: Missing headers/secrets' }, 400);  
  }

  // 1\. Validar firma HMAC SHA-256 de Stripe mediante WebCrypto nativa  
  const isValid \= await verifyStripeSignature(rawBody, signatureHeader, webhookSecret);  
  if (\!isValid) {  
    return c.json({ error: 'Invalid Stripe signature' }, 401);  
  }

  const event \= JSON.parse(rawBody);
  const eventId \= event.id as string | undefined;  
  const tenantId \= event.data?.object?.metadata?.tenant\_id as string | undefined;  
  const isSubscriptionEvent \= [
    'customer.subscription.deleted', 'customer.subscription.updated',
    'invoice.payment_failed', 'invoice.paid'
  ].includes(event.type);
  if (\!eventId) return c.json({ error: 'Missing Stripe event id' }, 400);  
  if (isSubscriptionEvent && \!tenantId) {  
    return c.json({ error: 'Missing tenant\_id in metadata' }, 400);  
  }

  // SEC-08: dedup por (source, event.id) ANTES de procesar — re-deliveries legítimas o
  // replays dentro de la ventana de 5 min no re-ejecutan efectos (doble revoke/escritura KV).
  // WEBHOOK_EVENTS_DB es el binding D1 canónico del registro de eventos entrantes.
  const db \= c.env.WEBHOOK\_EVENTS\_DB as D1Database;  
  const priorEvent \= await db.prepare(
    `SELECT id, status FROM webhook_events WHERE source = 'stripe' AND event_id = ?`
  ).bind(eventId).first<{ id: string; status: 'PROCESSING' | 'PROCESSED' | 'FAILED' }>();
  if (priorEvent?.status === 'PROCESSED') {
    return c.json({ received: true, deduplicated: true });  
  }
  if (priorEvent) {
    await db.prepare(
      `UPDATE webhook_events SET status = 'PROCESSING', attempt_count = attempt_count + 1,
         last_error = NULL WHERE id = ?`
    ).bind(priorEvent.id).run();
  } else {
    await db.prepare(
      `INSERT INTO webhook_events (id, tenant_id, source, event_id, status, attempt_count)
       VALUES (?, ?, 'stripe', ?, 'PROCESSING', 1)`
    ).bind(crypto.randomUUID(), tenantId ?? 'system', eventId).run();
  }

  try {
  if (isSubscriptionEvent) {  
    // Solo una cancelación definitiva revoca el tenant. Un pago fallido entra en gracia
    // (GTM §4.3): actualiza `past_due`, pero no bloquea caja ni emisión con un revoke DO.
    if (event.type \=== 'customer.subscription.deleted') {  
      const doId \= c.env.TENANT\_STATE\_DO.idFromName(tenantId\!);  
      const stub \= c.env.TENANT\_STATE\_DO.get(doId);  
      await stub.fetch(new Request(new URL('/revoke', c.env.FQDN), { method: 'POST' }));
      await c.env.TENANT\_KV.put(\`revocation:${tenantId}\`, '1');
    } else if (event.type === 'invoice.paid' || event.type === 'customer.subscription.updated') {
      const doId \= c.env.TENANT\_STATE\_DO.idFromName(tenantId\!);
      const stub \= c.env.TENANT\_STATE\_DO.get(doId);
      await stub.fetch(new Request(new URL('/unrevoke', c.env.FQDN), { method: 'POST' }));
      await c.env.TENANT\_KV.delete(\`revocation:${tenantId}\`);
    }

    // Actualizar estado en KV Cache  
    const tenantRaw \= await c.env.TENANT\_KV.get(\`tenant:${tenantId}\`);  
    if (tenantRaw) {  
      const tenant \= JSON.parse(tenantRaw);  
      tenant.subscriptionStatus \= event.type \=== 'customer.subscription.deleted'
        ? 'canceled'
        : event.type \=== 'invoice.payment\_failed' ? 'past\_due' : 'active';
      await c.env.TENANT\_KV.put(\`tenant:${tenantId}\`, JSON.stringify(tenant));  
    }  
  }
    await db.prepare(
      `UPDATE webhook_events SET status = 'PROCESSED', processed_at = CURRENT_TIMESTAMP WHERE source = 'stripe' AND event_id = ?`
    ).bind(eventId).run();
  } catch (error) {
    await db.prepare(
      `UPDATE webhook_events SET status = 'FAILED', last_error = ? WHERE source = 'stripe' AND event_id = ?`
    ).bind(String(error), eventId).run();
    return c.json({ error: 'Webhook effect failed; retryable', code: 'WEBHOOK_RETRYABLE' }, 503);
  }

  return c.json({ received: true });  
});

async function verifyStripeSignature(  
  rawBody: string,  
  signatureHeader: string,  
  secret: string  
): Promise\<boolean\> {  
  try {  
    const parts \= signatureHeader.split(',').reduce(  
      (acc: { timestamp?: string; v1: string[] }, item) \=\> {  
        const \[key, val\] \= item.split('=');  
        if (key?.trim() \=== 't' && val) acc.timestamp \= val.trim();  
        if (key?.trim() \=== 'v1' && val) acc.v1.push(val.trim());  
        return acc;  
      },  
      { v1: [] }  
    );

    const timestamp \= parts.timestamp;  
    const stripeSigs \= parts.v1;  
    if (\!timestamp || stripeSigs.length \=== 0) return false;

    // Prevenir ataques de Replay (5 minutos) — SEC-08: ventana con cota SUPERIOR e INFERIOR
    // (0 ≤ ageSeconds ≤ 300): una firma con timestamp FUTURO se rechaza, no solo la vieja.  
    const timestampSeconds \= Number(timestamp);  
    if (\!Number.isInteger(timestampSeconds)) return false;  
    const ageSeconds \= Math.floor(Date.now() / 1000\) \- timestampSeconds;  
    if (ageSeconds \> 300 || ageSeconds < 0\) return false;

    const payloadToSign \= \`${timestamp}.${rawBody}\`;  
    const encoder \= new TextEncoder();  
    const key \= await crypto.subtle.importKey(  
      'raw',  
      encoder.encode(secret),  
      { name: 'HMAC', hash: 'SHA-256' },  
      false,  
      \['sign'\]  
    );

    const signatureBuffer \= await crypto.subtle.sign('HMAC', key, encoder.encode(payloadToSign));  
    const computedSig \= Array.from(new Uint8Array(signatureBuffer))  
      .map((b) \=\> b.toString(16).padStart(2, '0'))  
      .join('');

    // SEC-08: comparación CONSTANTE en tiempo sobre bytes, no `===` sobre strings directos.
    const expected \= decodeHex(computedSig);  
    if (\!expected) return false;  
    let valid \= 0;  
    for (const stripeSig of stripeSigs) {  
      const received \= decodeHex(stripeSig);  
      if (\!received || expected.length \!== received.length) continue;  
      let diff \= 0;  
      for (let i \= 0; i < expected.length; i++) diff |\= expected[i] ^ received[i];  
      valid |\= diff \=== 0 ? 1 : 0;  
    }  
    return valid \=== 1;  
  } catch (err) {  
    console.error('Crypto Webhook Verification Error:', err);  
    return false;  
  }  
}

function decodeHex(value: string): Uint8Array | null {  
  if (value.length % 2 \!== 0 || /[^0-9a-f]/i.test(value)) return null;  
  const bytes \= new Uint8Array(value.length / 2);  
  for (let i \= 0; i < bytes.length; i++) bytes[i] \= parseInt(value.slice(i * 2, i * 2 \+ 2), 16);  
  return bytes;  
}

export default app;

### **4.0 Política de seguridad transversal (SEC-11 / SEC-04)**

- **Rate limit por ruta (Cloudflare Rate Limiting):** login/PIN → 5 fallos/15 min + lockout; webhooks entrantes → 100/min/IP; API pública → por API key (429); insights AI → por tenant/día (regla 33).
- **CORS:** allowlist por tenant (solo el origen del dashboard), jamás `*` en rutas autenticadas.
- **CSRF:** cookies de sesión `SameSite=Lax/Strict` + `Secure`; tokens CSRF/`Authorization` para mutaciones; nunca cookies de sesión sin `Secure` ni `SameSite`.
- **PIN de caja (`users.pin_hash`, `transfer_pin_hash`):** argon2id; verificado server-side; lockout 5 fallos/15 min (SEC-03/SEC-11).
- **Webhooks salientes (`webhook_endpoints`):** URL solo HTTPS, resuelta contra deny-list (IP privada, link-local, `169.254.169.254`); timeout 5 s; 3 reintentos con backoff; auto-disable tras N fallos (`failure_count`); rotación de API keys cada 180 días con alerta (`last_used_at`).

### **4.1 Medición de uso y sobregiro facturado (v8.2)**

Principio 5: **nunca apagar la caja**; el excedente del cupo Arranque se factura.

**Fuente de verdad de dinero:** `usage_counters` en D1, **no** Cloudflare Analytics Engine (AE es muestreado → solo dashboards).

```sql
CREATE TABLE usage_counters (
    tenant_id TEXT NOT NULL,
    period_ym TEXT NOT NULL,      -- 'YYYY-MM' America/Lima
    doc_count INTEGER NOT NULL DEFAULT 0,
    overage_reported_thru INTEGER NOT NULL DEFAULT 0, -- último doc_count ya enviado a Stripe
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, period_ym)
);

CREATE TABLE usage_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    usage_key TEXT NOT NULL,             -- usage:{documentId}
    period_ym TEXT NOT NULL,
    document_id TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, usage_key),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE billing_overages (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    period_ym TEXT NOT NULL,
    units INTEGER NOT NULL,       -- comprobantes cobrados en este batch
    stripe_idempotency_key TEXT NOT NULL UNIQUE, -- tenant:period:day
    reported_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Reglas:**

1. Dentro del mismo `db.batch([...])` atómico de la venta CPE/NV que cuenta para cupo: `INSERT ... ON CONFLICT ... DO UPDATE SET doc_count = doc_count + 1`.
2. Cron diario (aislado del hot path): lee `doc_count - overage_reported_thru` vs cupo del plan; si hay excedente, `Stripe Metered Billing` batch con `idempotency_key = tenant:period:day`; escribe `billing_overages` y avanza `overage_reported_thru`.
3. Cobro / emisión **nunca** hacen `fetch` a Stripe.
4. Cupo Arranque: **1,000 comprobantes/mes** incluidos; **S/ 0.05** por adicional (GTM §4.1). Crece/Cadena: cupo holgado o incluido en precio (sin sobregiro en pitch).

**Documentos que cuentan para cupo (regla cerrada):**

| Documento | `doc_count + 1` | Nota |
|---|---|---|
| Factura `01`, Boleta `03`, Ticket `12`, NC `07`, ND `08` | **Sí** | Cada CPE emitido = 1 doc, incluida la corrección. Idempotency: `usage:{docId}` en la misma tx. |
| `NV` / `NV_RETURN` | **Sí** | Comprobante interno emitido; consume cupo como cualquier venta. |
| Baja de boleta (void → RC) | **No suma ni resta** | El doc ya consumió cupo al emitirse; la baja es cambio de estado sobre el mismo doc, no un documento nuevo. |
| Resumen Diario (RC) | **Cada boleta del RC = 1** | El RC es solo el vehículo de envío, no un documento facturable; los docs que contiene ya contaron en su emisión. |

Regla anti-ambigüedad: el cupo se consume **al emitir** el comprobante (venta, NC, ND, NV), nunca al anular. Un error del cajero que se corrige con 50 NC consume 50 docs de cupo (cada NC es un XML real enviado a SUNAT). La NC **no** reembolsa el cupo consumido por la venta original.

Regla de aceptación SUNAT: el cupo cubre la **generación/procesamiento** del comprobante (XML emitido y enviado), **independiente del estado final de aceptación** (`ACEPTADO`, `QUARANTINED`, `REJECTED`, `DEADLINE_EXCEEDED`). Un CPE que SUNAT nunca acepta ya consumió su doc; solo una NC posterior anula el efecto comercial, pero cada XML generado contó para el cupo. La caja nunca se detiene por rechazo: el cobro commite y el reintento de envío queda en la cola de resumen, sin exigir doc nuevo. **Anulación de CPE no aceptado (edge E-A):** si el origen está `REJECTED`/`QUARANTINED`/`DEADLINE_EXCEEDED` (jamás tuvo CDR `ACCEPTED`), la NC de anulación **no exige** CDR aceptado — no existe CDR que exigir. Se emite la NC con motivo Catálogo 09 de anulación (por el total, no parcial), se revierte el efecto comercial (el dinero ya está contabilizado en caja/rollups), se alerta al Dueño vía Modo Dueño (`audit_events` `CREDIT_NOTE_NO_CDR` con el estado origen) y el XML de la NC se envía como corrección del original no aceptado (unitaria o en RC, según §5.2). La precondición `ACCEPTED` (§8, Sprint 5) aplica **solo** cuando el origen sí tiene CDR. Jamás se bloquea la caja por un rechazo.

## **5\. Esquema DDL SQL Desacoplado, Multi-Branch, Full Economic Ledger & Tax Engine (v8.0)**

### **5.0 Representación de dinero (convención obligatoria, v8.1)**

**Todo monto se almacena como INTEGER en centavos** (sufijo `_cents`) — nunca `REAL`/float. Motivo: la "Financial ACID Guarantee" es falsa con coma flotante (`0.1+0.2`, redondeo IGV/SUNAT inestable). Reglas:

1. **Columnas monetarias = `INTEGER` cents:** `price_cents`, `cost_cents`, `unit_price_cents`, `unit_cost_cents`, `total_*_cents`, `subtotal_cents`, `igv_/icbper_amount_cents`, `discount_amount_cents`, `amount_cents`, `original_amount_cents`, `balance_due_cents`, `credit_limit_cents`, `opening_/closing_balance_cents`, `denomination_cents`, `flat_fee_amount_cents`, `max_amount_without_auth_cents`, etc. Las columnas `REAL` restantes son **ratios/cantidades**: `rate_percentage`, `exchange_rate`, `rate`, `stock`, `quantity`, `points_balance`, `quantity_delta`, `qty_*`.
2. **Redondeo de centavo en servidor** (`Math.round`), nunca `toFixed` del cliente; el cliente envía/recibe centavos y la UI los formatea a S/ solo para display.
3. **Tolerancias explícitas** (vuelto, conciliación de pagos) definidas por el servidor; nunca comparaciones `==` de flotantes.
4. **Conversión S/ ↔ centavos** ocurre **una sola vez** en el límite de entrada/salida (payload → D1 y D1 → reporte), nunca en el motor de cálculo.

### 5.0.1 Invariante de aislamiento tenant

Toda FK entre tablas tenant-owned debe incluir `(tenant_id, parent_id)` y apuntar a
una clave única equivalente `(tenant_id, id)`. Las FKs simples por UUID quedan
prohibidas porque permiten referencias cruzadas entre tenants si un ID se filtra.
El CI de migraciones debe revisar que cada tabla con `tenant_id` cumpla esta regla;
las tablas críticas ya aplican el patrón en `sales`, `customers`, `users`,
`payment_methods`, `sale_items`, `sale_payments`, `accounts_receivable` y
`payment_captures`. Toda tabla nueva debe incluir la misma pareja y su índice único.

## **5.1 Formalización progresiva y matriz régimen × documento (Zero-Trust)**

Atlas no asume que todo tenant es emisor electrónico desde el día 1. El servidor valida cada emisión contra `tax_regime` × `formalization_mode` × `enabled_document_types` antes de persistir (rechazo 422 si el cliente pide un tipo no permitido).

| `formalization_mode` | Quién | Default en caja | Camino CPE | Documentos tipicos |
|---|---|---|---|---|
| `INTERNAL_CONTROL` | Pre-formalización / control interno | **Nota de Venta (`NV`)** | N/A (`NOT_APPLICABLE`) | Solo `NV` (CPE bloqueados) |
| `FORMALIZING` | RUC activo; activando facturación | Boleta `03` / Factura `01` | **PSE Atlas** (firma/envío por plataforma o cert tenant) → `PENDING` | CPE según régimen + `NV` opcional (leyenda) |
| `ELECTRONIC_ISSUER` | Emisor electrónico operativo | Boleta `03` / Factura `01` | Envío unitario / Resumen Diario según tipo | CPE según régimen; `NV` no sustituye boleta |

**Matriz `tax_regime` → documentos CPE permitidos (modos FORMALIZING / ELECTRONIC_ISSUER):**

| Régimen | `NV` | Boleta `03` / Ticket `12` | Factura `01` | NC `07` / ND `08` |
|---|---|---|---|---|
| `UNKNOWN` / pre-RUC | Sí (default) | No | No | No |
| `NRUS` | Solo si aún `INTERNAL_CONTROL`; al formalizar, no sustituye boleta | Sí | **No** | Sobre boleta |
| `RER` / `RMT` / `RG` | Opcional (control/crédito interno; leyenda obligatoria) | Sí (consumidor final) | Sí (cliente con RUC) | Sí |

**Reglas duras:**

1. `NV` **no** está en Catálogo 01 SUNAT. Impresión con leyenda: *"Nota de venta — documento de control interno. No es comprobante de pago autorizado por SUNAT."*
2. Upgrade `INTERNAL_CONTROL` → `FORMALIZING` / `ELECTRONIC_ISSUER`: las NV históricas **no se convierten** en boletas (prohibida re-numeración). Ventas nuevas usan CPE.
3. **PSE ≠ contingencia normativa.** Contingencia SUNAT = formatos preimpresos autorizados ante falla del sistema. Atlas **no** emite serie B/F “en contingencia” solo porque falta `.pfx`. Default de producto: **PSE Atlas** en modos formales (ADR-FISCAL-001).
4. NRUS formalizado: ventas ≤ S/ 5 pueden omitir emisión unitaria + **boleta de consolidación diaria**; boleta ≥ **S/ 700** exige tipo+número de doc y nombres del adquirente; Factura exige RUC (`6`).
5. **Guía de Remisión Electrónica (GRE)** y percepciones/retenciones/detracciones = **fuera de MVP v8.0** (post-MVP).

#### ADR-FISCAL-001 v2 — Decisiones cerradas (obligatorio Sprint 5)

1. `INTERNAL_CONTROL` = solo NV (`NOT_APPLICABLE`).
2. `FORMALIZING` / `ELECTRONIC_ISSUER` = **PSE Atlas** por defecto (`pse_mode = ATLAS_PSE`); cert propio del tenant es opción avanzada.
3. Boletas → **Resumen Diario**; Facturas → envío **unitario** XML.
4. Plazos: factura **3 días calendario**; RC boletas **7 días calendario**; alertas T-24h; DLQ por vencimiento.
 5. Guards: boleta ≥ S/ 700 ⇒ identificación; factura ⇒ RUC; NC/ND ⇒ origen `ACCEPTED`.
 6. **Constante fiscal legal (única fuente de verdad):** umbral de identificación en boleta = **S/ 700 → 70000 cents** (`DOC_TOTAL_THRESHOLD_FOR_ID`); umbral NRUS de omisión unitaria = **S/ 5 → 500 cents**. Estas constantes se referencian (no se re-definen) en código (→ `total_amount_cents >= 70000`), GTM FAQ y Agents; cualquier cambio futuro se edita aquí.
 7. Series CPE por **branch** (sucursal); correlativo autoritativo en servidor/DO.
 8. GRE, percepciones, retenciones, detracciones = **fuera de MVP v8.0**.
 9. Prohibido en producto/copy llamar “contingencia SUNAT” a la falta de `.pfx`.

### **5.2 Pipeline de envío fiscal (Factura vs Resumen Diario)**

| Tipo | Cómo llega a SUNAT/OSE | Plazo máximo | Campo `must_submit_by` |
|---|---|---|---|
| Factura `01` + NC/ND de factura | XML unitario firmado | Fecha emisión o hasta **3 días calendario** contados desde el día siguiente | `issued_date_lima + 3 días` fin de día Lima *(corrección off-by-one: `+1+3` daba día+4)* |
| Boleta `03` + NC/ND de boleta | **Resumen Diario (RC)** — no se exige XML unitario de boleta al OSE como factura | Día de emisión o hasta **7 días calendario** siguientes | `issued_date_lima + 7 días` fin de día Lima |
| `NV` / `NV_RETURN` | No se envía | N/A | NULL |

**Jobs:**

- `submitInvoiceWorker`: prioriza por `must_submit_by`; alerta Admin/Dueño a **T-24h y T-6h**; DLQ `DEADLINE_EXCEEDED` si vence (comprobante entregado al cliente puede perder validez tributaria). **Auto-sugerencia de reversión:** un CPE que entra a `DEADLINE_EXCEEDED` dispara en el panel Modo Dueño la sugerencia de **NC de anulación sin CDR (E-A)** para desbloquear la contabilidad del contribuyente sin esperar acción manual.
- `buildDailySummaryCron`: agrupa boletas/NC-boleta del día Lima por **emisor (`tenant_id` + `summary_date`)** — SUNAT admite **un único RC por día por emisor**; `branch_id` queda como atributo de cada línea (boleta→branch), nunca como clave del RC (corrección FIS-03). Genera RC; espera CDR; permite baja (`void`) de boleta informada en RC del mismo día de emisión. **RC complementaria (SYN-11):** una boleta con `issued_at` de un día cerrado que sincroniza después admite **RC complementaria del mismo `summary_date`** mientras esté dentro de `must_submit_by`, con alerta Modo Dueño; si se vence la ventana, runbook de NC/re-facturación (reusa E-A/E-B §8).
- **Arqueo Z / cierre de caja ≠ Resumen Diario.** El RC es job fiscal independiente; banner si hay boletas del día sin RC aceptado.

**Representación impresa / PDF CPE (mínimo obligatorio):**

- RUC, razón social, dirección, serie-número, fecha/hora Lima.
- Código **hash** del XML y **QR** de consulta.
- Leyendas: *"Representación impresa de la [FACTURA/BOLETA/NOTA] ELECTRÓNICA"*; *"Autorizado mediante Resolución …"* (o equivalente PSE).
- NV: solo leyenda de control interno (sin hash/QR SUNAT).

### **5.3 Operación comercial (Atlas v8.1) — Zero-Trust de caja, inventario y comandas**

Extiende el DDL base con entidades de operación. Implementación por sprints Agents FASE 6 (17–20). **No sustituye** el pipeline fiscal §5.2.

#### Reglas Zero-Trust de negocio

1. **Precios:** el cliente nunca impone `unit_price_cents`; el servidor resuelve lista (branch → customer → default) y recalcula IGV/ICBPER.
2. **Descuentos:** si % o monto supera umbral del tenant → requiere `authorization_token` de supervisor/Dueño; siempre `audit_events`. **Mecánica del token (SEC-09):** el `authorization_token` es un JWT o UUID hasheado emitido server-side tras verificar el **PIN del supervisor** (argon2id + rate limit 5 fallos/15 min), con **TTL 90 s** y **un solo uso**; se guarda como `authorization_token_hash` en `audit_events.payload_json` (y en `sale_items`/`cash_register_cash_movements` cuando aplica). El motor §6 rechaza (422 `AUTH_TOKEN_REQUIRED`/`AUTH_TOKEN_INVALID`) cualquier descuento, precio manual, monto de merma o cierre sobre umbral sin token válido. Nunca se verifica client-side.
3. **Crédito:** `payment_method = credit` ⇒ `saldo_cxc + venta ≤ credit_limit_cents` salvo override auditado.
4. **FEFO (`inventory.batches`):** productos con lotes: descontar batch con `expiry_date` más próxima y `quantity_available > 0`; lote vencido = 422.
5. **Kits (`inventory.bom`):** explosión BOM atómica; fallo de un componente = rollback de toda la venta.
6. **Arqueo Z ciego (`cash.blind_z`):** en cierre, el cajero no recibe `expected_cash` hasta confirmar conteo; diferencia documentada. **Gate de impresión (edge 2D):** antes de iniciar el flujo de cierre Z, el POS consulta la **print outbox** (IndexedDB, Sprint 25); si hay tickets en `PENDING`/`FAILED`, muestra un **modal bloqueante** — *"Tienes N comprobantes sin imprimir. Resuélvelos o cancélalos antes de arquear la caja"* — y **no permite** avanzar hasta resolverlos o cancelarlos (reimprimir en caja, o cancelar con motivo que se audita como `REPRINT`); se evita cerrar el turno con boletas "huérfanas" de impresión.
7. **Órdenes (`orders.*`):** si el tenant tiene capability `orders.lifecycle`, el stock de ítems físicos sigue la política configurable del tenant (`reserve_on_fired` \| `deduct_on_sale`); **default:** descontar al convertir order_item → `sale`. Sin `switch(vertical)` (ADR-ARCH-002).
8. **Transferencias (`stock.transfers`):** suma (destino recibido + merma) = cantidad enviada; estados monotónicos.
9. **Costo promedio ponderado — PMP (`inventory.pmp`):** el COGS no se configura a mano. Al recibir una compra/ajuste en un branch se recomputa el costo promedio del `(product, branch)` en la **misma tx** (`avg = valor_inventario_cents / stock`); la venta usa el PMP vigente como snapshot `unit_cost_cents` en `sale_items`; una NC/devolución restaura stock y **revierte el efecto de costo**; el invariante `refresh_avg_cost(product_id, branch_id)` se ejecuta en recepción, transferencia, ajuste y merma. **Invariante forward-only:** el COGS de una venta cerrada es su snapshot `unit_cost_cents` **inmutable**; ningún evento posterior (compra, devolución, ajuste) recalcula ventas pasadas. El PMP solo se ajusta para transacciones futuras; los rollups y reportes ya generados (§9) jamás se recalculan ni reescriben — **excepción única (PERF-11, edge D §9):** ante un sync offline tardío que mueve `issued_at_lima` de un día cerrado, SOLO se re-materializan las filas `(tenant, branch, report_date)` de **días anteriores y cerrados**, recomputadas desde `sale_items`/`inventory_movements` (snapshots), **sin tocar** PMP ni `forecast_outputs`; si un reporte se regenera, lo hace con los snapshots históricos, nunca con el PMP vigente.
10. **Conteo físico y merma (`inventory.counts`, `inventory.losses`):** el inventario se controla por conteo ciego (el cajero no ve el stock esperado por línea) → diferencias → `AJUSTE` con motivo + authz si `|diff|` supera umbral; **merma** (dañado/caducado/sospecha de hurto) es append-only con evidencia foto (R2) y aprobación; nunca se edita un conteo ya aprobado.
11. **Movimientos de caja no-venta (`cash.cash_movements`):** todo flujo de efectivo que no es una venta (envío de valores, fondo para cambio, pago a proveedor, ajuste) se registra en `cash_register_cash_movements` con `authorized_by` si supera umbral. **Fórmula de arqueo:** `expected_cash = opening_balance_cents + Σ ventas efectivo + Σ ingresos − Σ retiros − Σ egresos`; el Z ciego concilia contra `cash_count_lines` y documenta la diferencia. **Desglose por operador (edge de integración, FASE 6G):** como el handoff (R35) transfiere una sesión `OPEN` con conteo intermedio opcional, el reporte Z impreso y el Modo Dueño **desglosan la diferencia total del día por tramo de `cash_register_shifts`** (cada `SHIFT_TRANSFER` con su `cash_diff_cents` e `interim_count_cents`), de modo que `Σ tramos + diferencia del tramo final = diferencia total del cierre`; si faltan S/ 50 en todo el día, el dueño ve si faltaron en el turno de la mañana (registrado en el `SHIFT_TRANSFER`) o en el de la noche, sin culpar al cajero incorrecto.
12. **Reimpresión y auditoría de config (`audit.reprints`, `audit.config`):** reimprimir un comprobante es un acto fiscal → `sale_reprints` con sello **"COPIA"**; todo cambio sensible (precio, producto, permiso, formalización, PMP) genera `audit_events`. Ningún rol reimprime sin dejar rastro.
13. **Devoluciones con política N días (`sales.returns`, FASE 6B):** ventana configurable por tenant (días, por método de pago/categoría); unidad mínima = `sale_item` con su `batch_id`; genera **NC fiscal (07)** en electrónico o **NV_RETURN** en control interno; **revierte el efecto PMP** del `unit_cost_cents` snapshot del item original (reusa `refresh_avg_cost`); vuelto por el mismo método si aplica, asentado en `cash_register_cash_movements`; devolución de turno cerrado o sobre umbral requiere authz (regla 2). La NC no reembolsa el cupo del doc original (§4.1). **Excepción de línea genérica (edge de integración, FASE 6G):** si `sale_item.is_uncatalogued = TRUE` (venta rápida, R34), la devolución genera la NC/NV_RETURN y el vuelto según método, pero **omite** la restauración de stock y `refresh_avg_cost` — la línea **nunca descontó stock** (`unit_cost_cents = 0`, sin `batch_id`); re-materializar el rollup (§9) refleja solo el efecto monetario. El flag viaja en el ítem devuelto (`audit_events` `RETURN` con `is_uncatalogued` en payload) para que el contador no confunda un inventario "positivo fantasma". **Compensación de CxC (edge E-D):** si la venta original tenía saldo pendiente (`accounts_receivable.balance_due_cents > 0`, regla 21), la NC/NV_RETURN reduce ese saldo en la **misma tx** por el monto acreditado (total o prorrateado); vuelto ya cobrado se entrega por método del último abono/efectivo o se convierte en crédito de tienda (regla 20); nunca se ajusta CxC en silencio (`audit_events`).
14. **Proveedores 3-way (`purchasing.three_way`, FASE 6B):** la compra (factura de proveedor) se liga a su OC y recepción; el **matching 3-way** exige cantidad OC = recepción = factura y precio/costo coherentes; diferencia = `422` o `override` autorizado + audit (`SUPPLIER_PRICE_DIFF`); al cerrar se actualiza `inventory_movements` + `refresh_avg_cost` + CxP por lo facturado. Jamás se ajusta CxP en silencio.
15. **Promociones y tramos (`pricing.promotions`, FASE 6B):** 2x1, % fijo, % por umbral de monto/cantidad, precio por tramo; **el precio final lo impone el sale engine** (el cliente envía solo el ID de la promoción); anti-apilamiento configurable; descuento manual sobre umbral → authz (regla 2); promoción sobre producto con lote respeta asignación `batch_id` (regla 4). Crear/editar regla = `audit_events`.
16. **Variantes y unidades de medida (`catalog.variants`, `catalog.uom`, FASE 6B):** variantes = filas `products` con `parent_product_id`, stock propio y precio derivado del padre con override; `product_uoms` con factor de conversión y costo base; venta registra cantidad en UM base; PMP y conteo físico se resuelven por variante/base. 0 stock cruzado entre variantes; redondeo de cantidad en servidor (nunca `toFixed`).
17. **Apartados y diario contable (`sales.layaway`, `ledger.chart_of_accounts`, FASE 6B):** el apartado reserva ítems y recibe abonos (`sale_deposits`); **no emite CPE hasta la conversión a venta completa**; cancelación devuelve según política (reusa regla 13). `chart_of_accounts` + asientos automáticos desde ventas/cobros/pagos/CxP/CxC/arqueo; el ledger es **solo lectura** para la UI (el contador lee vía export Cadena, no muta).
18. **Cotizaciones/presupuestos (`sales.quotes`, FASE 6C):** la cotización congela los precios resueltos por el servidor (Zero-Trust, regla 1) con vencimiento; **no emite doc fiscal**; estados `DRAFT → SENT → APPROVED → CONVERTED | EXPIRED | CANCELLED`; solo la `CONVERTED` genera venta (reusa pricing y listas); `audit_events` `QUOTE_*`. **COM-05:** el precio congelado de la cotización (`quote_items.unit_price_cents` snapshot) es el vigente al convertirla a venta **aunque** el precio de lista haya cambiado después (venta hereda el snapshot; si la cotización expira, la nueva venta se cotiza con pricing actual y requiere re-aprobación).
19. **Devolución a proveedor (`purchasing.returns`, FASE 6C):** espejo de la regla 13 pero de compra: genera NC de proveedor, **revierte `inventory_movements` + PMP** (reverso de `refresh_avg_cost` por `(product, branch)`) + CxP por lo devuelto; nunca se ajusta CxP en silencio; `audit_events` `SUPPLIER_RETURN`. **Forward-only (regla 9):** la reversión solo ajusta el PMP **para transacciones futuras**; las ventas pasadas conservan su snapshot `unit_cost_cents` y los márgenes históricos no cambian.
20. **Crédito de tienda / vales / gift cards (`ledger.store_credit`, FASE 6C):** cuenta de saldo por cliente; la venta del vale se registra como venta (doc según modo) y el **canje se impone desde el servidor** (nunca el cliente); una NC sin reembolso (regla 13) puede convertirse en crédito de tienda; vencimiento configurable; `audit_events` `STORE_CREDIT_ISSUE`/`STORE_CREDIT_REDEEM`.
21. **Cuotas / pago en partes (`sales.installments`, FASE 6C):** venta a crédito con plan de pagos (`sale_installments`: abono + saldo + vencimiento); cada pago actualiza CxC y el arqueo; atraso → alerta Modo Dueño; respeta `credit_limit` (regla 3); `audit_events` `INSTALLMENT`.
22. **Comisiones de vendedor (`sales.commissions`, FASE 6C):** comisión por `seller_id` a nivel venta/ítem (%, monto o por categoría); reporte Dueño y conciliación de pagos; **la nómina queda fuera** (Agents §5.4); `audit_events` `COMMISSION`.
23. **Ubicaciones de inventario (`inventory.locations`, FASE 6D):** stock por ubicación/rack dentro de la sucursal; conteo físico por ubicación; transferencia intra-sucursal; picking guiado para OC; el stock "de venta" es la suma por ubicaciones activas.
24. **Números de serie (`inventory.serials`, FASE 6D):** asignación en recepción, venta con `serial_number` por `sale_item`, devolución revierte la serie a disponible; garantía/audit; duplicados = 422; `audit_events` `SERIAL_ASSIGN`.
25. **Venta por peso variable (`inventory.scale`, FASE 6D):** captura de peso en caja (balanza USB o manual), precio por unidad de base, redondeo de monto en servidor; el peso lo fija la caja pero el precio/monto final lo recalcula el servidor. **Heartbeat anti desconexión silenciosa (edge 2C):** el Staff Hardware mantiene un **heartbeat continuo** hacia la balanza (WebUSB); si la conexión se pierde (suspensión de la tablet, cable movido), el POS **nunca lee 0.00 silencioso** — cambia de inmediato a una interfaz **roja "Peso Manual"** que exige al cajero teclear el peso para poder cobrar; si el peso se teclea manualmente, se registra `WEIGHT_OVERRIDE` en `audit_events` y, si supera el umbral del tenant, requiere **PIN de supervisor** (reusa authz de reglas 2/17) antes de continuar.
26. **Etiquetas de precio/estantería (`catalog.price_labels`, FASE 6D):** plantillas de etiqueta (producto, precio vigente según lista, código de barras) impresas vía `PrinterTransport` (§7.5); reimpresión en lote; nunca edita precios, solo los imprime.
27. **Export/restore total del negocio (`data.backup`, FASE 6D/6F):** export completo versionado y cifrado de todos los datos del tenant + restore con dry-run; **respaldar la promesa GTM §5.7.1 ("tus datos son tuyos")**; RPO/RTO base; eslabón de la regla 32 (DR).
28. **Preventa / pedido a cliente (`orders.customer_orders`, FASE 6E):** reserva de ítems sin pago previo → aviso al cliente → venta al retiro; distinto de `orders.lifecycle` (food service); cumplimiento parcial permitido; `audit_events` `CUSTOMER_ORDER_*`. **COM-05:** el precio se congela al crear el pedido (`customer_order_items.unit_price_cents` snapshot); la venta que cumple el pedido hereda esos precios incluso si cambiaron; `reserved_until` caducada → se liberan `reserved_qty` y la venta final se cotiza con pricing actual.
29. **Ventas recurrentes / membresías (`sales.recurring`, FASE 6E):** generación programada de venta/NV por plan con **idempotencia** (cada ocurrencia = doc fiscal propio); cancelación y proporcionalidad; adaptada a la vertical Servicios; `audit_events` `RECURRING_*`.
30. **Notificaciones push + caja móvil (`mobile.push`, `client.mobile_pos`, FASE 6E):** push real (Web Push/FCM) al Modo Dueño para arqueo, quiebre y discrepancias (no solo polling); la caja móvil es una terminal PWA que reusa el core (multi-caja portátil); sin fork de dominio.
31. **Analítica predictiva (`analytics.forecasting`, FASE 6F):** modelo sobre `daily_product_rollups` (D1) + features de Analytics Engine; forecast de ventas por sucursal/producto y detección de quiebre; salida = **sugerencias** (reposición, alertas), **nunca decisiones automáticas de precio/stock**; gated a plan Cadena con disclaimer; respalda el claim GTM §4.1 "analítica predictiva".
32. **LPDP y DR/BCP (`compliance.lpdp`, `platform.dr`, FASE 6F):** (a) **LPDP Perú**: inventario de PII, consentimiento explícito (reusa opt-in de mensajería), derecho de export y **borrado/anonimización** — los doc fiscales se retienen (SUNAT ~5 años) pero **se anonimizan**, no se destruyen; (b) **DR/BCP**: RPO=0 en tx ACID comprometidas, RPO≤1d en rollups, RTO objetivo por shard con replay de colas, backups versionados (regla 27) con restauración probada y simulacro anual (extiende Sprint 14).
33. **Inteligencia del negocio / Agente de insights (`analytics.agentic_insights`, FASE 6F, Sprint 49):** capa **determinista** sobre D1 — el LLM **nunca calcula ni decide**; D1 es la única calculadora (Principio 9). Pipeline: (1) **router de intención** (LLM ligero) clasifica la pregunta en una lista whitelist de acciones; (2) **Text-to-SQL** (LLM solo traductor) genera el `SELECT` sobre un **schema estricto** (tablas/columnas conocidas, sin `JOIN` libre ni funciones fuera de whitelist) validado por schema JSON y **parametrizado** — jamás se concatena texto del LLM; (3) la consulta se ejecuta en **D1** (calculadora exacta, `_cents`) — **PERF-12:** con `sql_timeout` y contra la **réplica de lectura** del shard (si no hay réplica, prioridad baja / ventana fuera de hora punta) para no competir con el write-lock del cobro; el validador del schema **inyecta forzosamente `LIMIT 50`** (umbral configurable por tenant) en todo `SELECT` generado; para listas amplias fuerza **agregaciones** (`GROUP BY`/totales) y, si la pregunta pide detalle masivo, responde *"los datos son muy amplios para el chat: muestro los 50 principales, descarga el Excel completo en Configuración"* — **jamás** se materializa un listado grande en el isolate (memoria 128 MB, evita OOM/5xx que degraden el SLO); (4) **NLG server-side**: los números se computan antes y se inyectan como **hechos tipados** con placeholders; el LLM solo redacta prosa conectándolos verbatim, con un **post-check determinista** que rechaza cualquier cifra que contradiga el input (0 alucinaciones verificable por Staff QA); (5) respuesta por **SSE** (P95 <2s, canal premium — no es hot path de cobro, no aplica el SLO Sub-50ms). **Idempotencia del chat (anti doble cobro):** cada pregunta desde el móvil lleva `insight_idempotency_key` (UUID del mensaje); si el SSE se corta por red móvil y el cliente reenvía, el backend devuelve la respuesta cacheada en KV `insights:{tenant_id}:{idem}` (TTL ~10 min) **sin re-invocar al LLM**; `ai_usage_counters` sube solo en el primer procesamiento (reusa el patrón `sale_idempotency_key`). **Morning Briefing proactivo:** cron 3:30 AM post `buildDailySummaryCron`, genera 3 viñetas (ventas, quiebre, excepciones de caja) y las cachea en **KV** `insights:{tenant_id}:{fecha}` (lectura UI <10ms); el usuario puede abrir el chat para profundizar. **Regeneración ante sync offline tardío:** si una venta con `issued_at` de un día cerrado se reconcilia después del cron, la re-materialización del rollup (§9) **invalida** la llave KV del briefing y lo regenera con las cifras ya integradas (edge D, Sprint 6/49). **Zero-trust multi-tenant:** `tenant_id` se extrae del JWT y se fuerza en el `WHERE` **fuera del prompt**; el LLM es stateless y no ve datos de otros tenants; el output se renderiza como **texto plano escapado** (los nombres de producto son data, nunca markdown/HTML del modelo). **Schema PII-free (LPDP, regla 32):** el whitelist del Text-to-SQL **excluye columnas de datos personales** (`email`, `phone`, `address`, `document_number` de `customers`) y expone `customer_id` + **seudónimo** (iniciales/alias) para el análisis; un **post-check escanea `facts_json`** y rechaza la respuesta si detecta PII crudo antes de la NLG — la IA nunca procesa datos personales identificables. **Metering:** `ai_usage_counters` por tenant/día (queries, tokens de entrada/salida) + rate limit → costo Workers AI cubierto por el modelo de sobregiro (§4.1); gated a **Cadena/Enterprise**. **Auditabilidad:** cada interacción se persiste en `insight_log` (append-only) con la consulta SQL ejecutada, los hechos JSON, el texto NLG y `model_version`. Se **compone** con `analytics.forecasting` (regla 31): el briefing puede citar el forecast, pero no lo reemplaza. Respalda el claim GTM "El único POS que viene con un Gerente de Operaciones incluido" (freeze hasta Sprint 49).
34. **Alta rápida de catálogo + venta rápida (`catalog.quick_add`, `sales.quick_line`, FASE 6G, Sprint 50):** (a) **Escáner Rápido** en Modo Dueño/Admin: cámara del celular (`BarcodeDetector`/`getUserMedia`, cliente) lee un código y **rutea por namespace** — prefijo `EMP-` ⇒ lookup en `users` (atribución de vendedor, R36); dígitos EAN-13/UPC ⇒ lookup en `products.barcode` (si existe → edición de stock/precio; si no → crea producto con nombre + precio en ~3 segundos, reusa `products.barcode`, sin depender de CSV ni de CatalogImporter del Sprint 21); **`EMP-` está prohibido como barcode de producto** (validación en Escáner Rápido y CatalogImporter); (b) **Venta rápida sin catálogo**: línea genérica en caja (`sale_items.is_uncatalogued = TRUE`, precio libre del cajero dentro del umbral sin authz, regla 2/17) para vender un artículo aún no catalogado a mitad de transacción; la línea queda **marcada** para catalogarse después (pendiente visible en Admin) y jamás corrompe stock (no descuenta ítem sin sku/barcode). **Excepción Zero-Trust offline (edge de integración):** como la línea genérica no tiene producto en listas, el motor `processOfflineSaleAtomic` (§6) **acepta `manualPriceCents` del cliente como fuente de verdad** para `is_uncatalogued = TRUE` (dentro del umbral sin authz), en vez de rechazarla por `Product not found` o sobreescribir el precio con la lista (regla 1) — la venta sincroniza y se audita como `GENERIC_LINE`. `audit_events` `QUICK_ADD`/`GENERIC_LINE`.
35. **Handoff de turno (`ops.shift_handoff`, FASE 6G, Sprint 51):** el cambio de operador **no cierra la caja**: la sesión `cash_register_sessions` **sigue `OPEN`** y se transfiere con un **PIN temporal** de un solo uso (TTL corto, hash servidor, verificado server-side; el entrante nunca recibe las credenciales del saliente). La atribución queda garantizada por `sales.user_id` (operador real de cada venta) + `cash_register_shifts` (log de operadores por sesión). **Conteo ligero intermedio opcional**: `interim_count_cents` nullable + `interim_required` en política del tenant (`branch_stock_policies`/tenant policy) — si se exige, el cajero saliente confirma el efectivo (diferencia → `audit_events` `SHIFT_TRANSFER` con `cash_diff_cents`) **sin** emitir cierre Z; si no se exige, transferencia instantánea. El arqueo Z real (regla 11) sigue siendo del cierre de sesión/caja y **desglosa las diferencias por operador usando `cash_register_shifts`** (regla 11), visible en el ticket Z y en el Modo Dueño.
36. **Equipo e invitaciones (`ops.team_invite`, FASE 6G, Sprint 51):** el Owner/Admin invita cajeros y vendedores (email/link) y les emite **PIN de caja** y/o **badge barcode** (`users.pin_hash`, `users.badge_barcode`); el cajero asigna el vendedor en el carrito en <1s escaneando su badge o tecleando su PIN (reusa el lector del Escáner Rápido, R34) — `sale_items.seller_id` se setea a nivel **carrito** con override por ítem; sin menú desplegable largo. **Namespace anti-colisión:** todo `badge_barcode` generado por Atlas usa el prefijo reservado **`EMP-`** + identificador server-side (`EMP-12345`), **único por tenant** y **fuera** del espacio EAN-13/UPC de los productos físicos — así un producto chino `12345` jamás colisiona con un badge `EMP-12345`; los badges no se editan a mano y el prefijo `EMP-` está **prohibido** en `products.barcode` (validado también por `CatalogImporter`/Escáner Rápido, R34). `audit_events` `TEAM_INVITE`.
37. **Descubrimiento de capabilities + diagnóstico de hardware (`onboarding.tour`, `hardware.diagnostics`, FASE 6G, Sprints 52–53):** (a) **Product Tour** post-onboarding activado **por las capabilities del tenant** (ADR-ARCH-002): al elegir rubro, tooltips contextuales guían la primera configuración ("Como eres restaurante, activamos las comandas de cocina — configura aquí tu pantalla de chef") + **checklist de setup del "segundo día"** (logo, impresora, invitar cajero, activar facturación, subir catálogo) que mide completitud y reduce abandono del trial; (b) **Troubleshooter de hardware**: asistente visual en Admin → Configuración (Impresión/hardware) con botones *"Probar impresora USB"* / *"Buscar impresoras en mi red"* / *"Probar balanza"* — oculta la escalera WebUSB → WSS → Bluetooth (Sprint 25) y el diagnóstico de red detrás de estados claros (✓/✗ con causa y paso siguiente); `audit_events` `HARDWARE_DIAG`.

#### DDL adicional (v8.1)

```sql
-- Runtime flags (ADR-ARCH-002). vertical_type sigue en tenants solo para UX/analytics.
CREATE TABLE tenant_capabilities (
    tenant_id TEXT NOT NULL,
    capability TEXT NOT NULL,
    -- 'cash.blind_z' | 'inventory.batches' | 'orders.kds' | 'stock.transfers' | ...
    enabled INTEGER NOT NULL DEFAULT 1,
    config_json TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (tenant_id, capability),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE audit_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT,
    actor_user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    -- Catálogo canónico de códigos por FASE: Nota v8.1 (catálogo de
    -- audit_events.action). Base (FASE 6): 'DISCOUNT_OVERRIDE' | 'CREDIT_OVERRIDE' |
    -- 'CASH_CLOSE' | 'VOID' | 'NC' | 'FORMALIZATION_CHANGE' | 'ORDER_ITEM_CANCEL' |
    -- 'TRANSFER_VARIANCE' | ... (ver tabla canónica Nota v8.1 — no hardcodear nuevos aquí)
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    prev_hash TEXT,                  -- SEC-10: hash-chaining SHA-256(fila anterior) → tamper-evidence
    row_hash TEXT NOT NULL,           -- SHA-256 de canonical(row sin hash + prev_hash)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_audit_tenant_time ON audit_events(tenant_id, created_at);
CREATE TRIGGER audit_events_no_update
BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER audit_events_no_delete
BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'AUDIT_APPEND_ONLY'); END;

CREATE TABLE authorization_tokens (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    approved_by_user_id TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, token_hash),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (tenant_id, approved_by_user_id) REFERENCES users(tenant_id, id)
);
CREATE INDEX idx_authorization_tokens_active
    ON authorization_tokens(tenant_id, expires_at) WHERE used_at IS NULL;

CREATE TABLE fiscal_outbox (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sale_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    must_submit_by DATETIME,
    next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_error TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, sale_id),
    CHECK (status IN ('PENDING','PROCESSING','SENT','FAILED','QUARANTINED')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id)
);

CREATE TABLE cash_count_lines (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    cash_register_session_id TEXT NOT NULL,
    denomination_cents INTEGER NOT NULL,  -- 0.10, 0.20, 1, 2, 5, 10, 20, 50, 100, 200
    quantity INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (cash_register_session_id) REFERENCES cash_register_sessions(id)
);

-- Extender cash_register_sessions:
-- counted_total_cents INTEGER, expected_total_cents INTEGER, difference_amount_cents INTEGER,
-- difference_reason TEXT, closed_blind BOOLEAN DEFAULT TRUE,
-- authorized_by_user_id TEXT

CREATE TABLE tenant_discount_policies (
    tenant_id TEXT PRIMARY KEY,
    max_percent_without_auth REAL NOT NULL DEFAULT 5.0,
    max_amount_without_auth_cents INTEGER NOT NULL DEFAULT 2000,  -- S/ 20.00 en centavos
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE orders (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    table_label TEXT,           -- mesa / salón
    status TEXT NOT NULL DEFAULT 'OPEN',
    -- OPEN | FIRED | READY | PAID | CANCELLED
    opened_by_user_id TEXT NOT NULL,
    customer_id TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE order_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit_price_cents INTEGER NOT NULL,   -- snapshot servidor
    status TEXT NOT NULL DEFAULT 'PENDING',
    -- PENDING | FIRED | READY | CANCELLED | BILLED
    sale_id TEXT,               -- set al split/cobro
    authorized_cancel_by TEXT,
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE stock_transfers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    from_branch_id TEXT NOT NULL,
    to_branch_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    -- DRAFT | IN_TRANSIT | RECEIVED | CANCELLED
    notes TEXT,
    created_by_user_id TEXT NOT NULL,
    shipped_at DATETIME,
    received_at DATETIME,
    FOREIGN KEY (from_branch_id) REFERENCES branches(id),
    FOREIGN KEY (to_branch_id) REFERENCES branches(id)
);

CREATE TABLE stock_transfer_lines (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    transfer_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT,
    qty_sent REAL NOT NULL,
    qty_received REAL DEFAULT 0,
    qty_shrink REAL DEFAULT 0,  -- merma; requiere reason + audit
    shrink_reason TEXT,
    FOREIGN KEY (transfer_id) REFERENCES stock_transfers(id)
);

-- purchase_orders.status ampliado: DRAFT | SENT | PARTIALLY_RECEIVED | RECEIVED | CANCELLED
-- Tabla receiving sugerida:
CREATE TABLE purchase_receipts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    purchase_order_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    received_by_user_id TEXT NOT NULL,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id)
);

CREATE TABLE purchase_receipt_lines (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    receipt_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_number TEXT,
    expiry_date DATE,
    quantity REAL NOT NULL,
    unit_cost_cents INTEGER NOT NULL,
    FOREIGN KEY (receipt_id) REFERENCES purchase_receipts(id)
);

-- ============================================================================
-- v8.1 — Control de inventario y caja retail
-- ============================================================================

-- M4: política de stock por (product, branch): punto de reposición y sugerencia de OC
CREATE TABLE branch_stock_policies (
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    min_stock REAL NOT NULL DEFAULT 0,       -- alerta de stock mínimo
    reorder_point REAL NOT NULL DEFAULT 0,   -- cruzar este nivel dispara sugerencia
    reorder_qty REAL NOT NULL DEFAULT 0,     -- cantidad sugerida de reposición
    is_active INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (tenant_id, branch_id, product_id)
);

-- M4: conteo físico de inventario (hoja ciega → diferencias → AJUSTE)
CREATE TABLE inventory_counts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    created_by_user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'COUNTING',
    -- COUNTING | DIFFERENCE_REVIEW | APPROVED | CANCELLED
    blind INTEGER NOT NULL DEFAULT 1,        -- 1 = el cajero no ve stock esperado
    approved_by_user_id TEXT,
    difference_threshold_cents INTEGER,      -- authz si |diff| valorizado > umbral
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME
);

CREATE TABLE inventory_count_lines (
    id TEXT PRIMARY KEY,
    count_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT,
    counted_qty REAL,
    system_qty REAL NOT NULL,
    difference_qty REAL,                     -- counted - system (server)
    unit_cost_cents INTEGER,
    diff_value_cents INTEGER,                -- |difference| * PMP, para threshold de authz
    approved_by_user_id TEXT,
    FOREIGN KEY (count_id) REFERENCES inventory_counts(id)
);

-- M5: merma/faltante con evidencia y aprobación (append-only)
CREATE TABLE stock_losses (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT,
    quantity REAL NOT NULL CHECK (quantity > 0),
    category TEXT NOT NULL,
    -- 'DAMAGED' | 'EXPIRED' | 'THEFT_SUSPECTED' | 'SHRINK' | 'OTHER'
    evidence_r2_key TEXT,                    -- foto/PDF en R2
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    -- PENDING | APPROVED | REJECTED
    created_by_user_id TEXT NOT NULL,
    approved_by_user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME
);
-- Aprobar una merma genera un inventory_movements 'AJUSTE' negativo + audit_events.

-- M6: movimientos de caja que NO son venta
CREATE TABLE cash_register_cash_movements (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    cash_register_session_id TEXT NOT NULL,
    movement_type TEXT NOT NULL,
    -- 'DEPOSIT_VALUES' (envío de valores) | 'CHANGE_FUND_IN' | 'CHANGE_FUND_OUT'
    -- | 'SUPPLIER_PAYMENT' | 'ADJUSTMENT'
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    counterparty_ref TEXT,                   -- supplier_id / accounts_payable_id
    reason TEXT,
    created_by_user_id TEXT NOT NULL,
    authorized_by_user_id TEXT,              -- obligatorio si amount_cents > umbral
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cash_register_session_id) REFERENCES cash_register_sessions(id)
);
-- Arqueo: expected_cash_cents = opening_balance_cents + ventas efectivo + ingresos − retiros − egresos.

-- M7: reimpresión con sello fiscal COPIA
CREATE TABLE sale_reprints (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sale_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    printed_by_user_id TEXT NOT NULL,
    copied_watermark INTEGER NOT NULL DEFAULT 1,  -- sello "COPIA" obligatorio en reimpresión
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sale_id) REFERENCES sales(id)
);
```

**Nota v8.1:** la extensión de `cash_register_sessions` (`counted_total_cents INTEGER, expected_total_cents INTEGER, difference_amount_cents INTEGER, difference_reason TEXT, closed_blind BOOLEAN DEFAULT TRUE, authorized_by_user_id TEXT`) y los umbrales de descuento (`max_percent_without_auth REAL`, `max_amount_without_auth_cents INTEGER`) aplican junto con las tablas anteriores. **Catálogo canónico de `audit_events.action` por FASE** (única fuente de verdad; el DDL arriba lo referencia — nuevos códigos se agregan aquí, no como literales sueltos):

| FASE / sprint | `audit_events.action` |
|---|---|
| Base (FASE 6, sprints 17–20) | `DISCOUNT_OVERRIDE`, `CREDIT_OVERRIDE`, `CASH_CLOSE`, `VOID`, `NC`, `FORMALIZATION_CHANGE`, `ORDER_ITEM_CANCEL`, `TRANSFER_VARIANCE` + `PRICE_CHANGE`, `PRODUCT_EDIT`, `PERMISSION_CHANGE`, `REPRINT`, `STOCK_ADJUST`, `MERMA_APPROVE`, `CASH_MOVEMENT`, `CONFIG_CHANGE` |
| FASE 6B (28–32) | `RETURN`, `SUPPLIER_PRICE_DIFF`, `PROMOTION_CHANGE`, `LAYAWAY_CANCEL`, `JOURNAL_POST` |
| FASE 6C-6F (33–49) | `QUOTE_CONVERT`, `QUOTE_EXPIRE`, `SUPPLIER_RETURN`, `STORE_CREDIT_ISSUE`, `STORE_CREDIT_REDEEM`, `INSTALLMENT`, `COMMISSION`, `SERIAL_ASSIGN`, `WEIGHT_OVERRIDE`, `PRICE_LABEL_REPRINT`, `DATA_BACKUP`, `DATA_RESTORE`, `CUSTOMER_ORDER_CANCEL`, `RECURRING_CANCEL`, `FORECAST_CREATE`, `FORECAST_RUN`, `FORECAST_REFRESH`, `LPDP_ERASE`, `DR_SIMULATION` |
| Sprint 24 (edge A, fidelidad) | `LOYALTY_RESERVATION_EXPIRED` |
| Sprint 49 (insights) | `INSIGHT_GENERATED`, `AI_QUOTA_EXCEEDED` |
| FASE 6G (50–53) | `SHIFT_TRANSFER`, `TEAM_INVITE`, `QUICK_ADD`, `GENERIC_LINE`, `HARDWARE_DIAG` |

#### DDL adicional (v8.1, FASE 6B — profundidad retail)

```sql
-- FASE 6B / Sprint 28 — devoluciones con política N días
CREATE TABLE return_policies (
    tenant_id TEXT PRIMARY KEY,
    window_days INTEGER NOT NULL DEFAULT 7,
    by_payment_method_json TEXT NOT NULL DEFAULT '{}',   -- {"cash": 7, "card": 7, "credit": 0}
    refund_to_original_method BOOLEAN NOT NULL DEFAULT TRUE,
    allow_turn_closed_with_auth BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sales_returns (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    sale_id TEXT NOT NULL,
    doc_type TEXT NOT NULL,               -- '07' (NC fiscal) | 'NV_RETURN'
    doc_series TEXT, doc_number TEXT,
    refund_amount_cents INTEGER NOT NULL,
    refund_payment_method TEXT NOT NULL,
    refund_movement_id TEXT,              -- cash_register_cash_movements.id (si cash)
    reason TEXT NOT NULL,
    authorized_by_user_id TEXT,           -- obligatorio si turno cerrado / sobre umbral
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sale_id) REFERENCES sales(id)
);
CREATE INDEX idx_sales_returns_sale ON sales_returns(tenant_id, sale_id);

CREATE TABLE sale_return_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,               -- COM-01: toda tabla de dominio lleva tenant_id (aislamiento multi-tenant)
    return_id TEXT NOT NULL,
    original_sale_item_id TEXT NOT NULL,  -- revierte unit_cost_cents snapshot + batch_id
    batch_id TEXT,
    qty REAL NOT NULL,
    unit_price_cents INTEGER NOT NULL,    -- del item original (Zero-Trust)
    igv_affectation_code TEXT NOT NULL DEFAULT '10',  -- COM-03: snapshot fiscal del ítem devuelto (la NC 07 exige base+IGV+afectación)
    igv_amount_cents INTEGER NOT NULL DEFAULT 0,
    icbper_amount_cents INTEGER NOT NULL DEFAULT 0,
    unit_price_without_tax_cents INTEGER NOT NULL DEFAULT 0,
    line_total_cents INTEGER NOT NULL,
    FOREIGN KEY (return_id) REFERENCES sales_returns(id)
);

-- FASE 6B / Sprint 29 — proveedores 3-way (OC → recepción → compra)
CREATE TABLE supplier_invoices (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    supplier_id TEXT NOT NULL,
    purchase_order_id TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',  -- OPEN | MATCHED | PARTIAL | CLOSED
    total_cents INTEGER NOT NULL,
    igv_cents INTEGER NOT NULL,
    matched_qty REAL NOT NULL DEFAULT 0,
    matched_amount_cents INTEGER NOT NULL DEFAULT 0,
    price_diff_override BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, supplier_id, invoice_number),
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id)  -- COM-04: 3-way OC→recepción→factura
);

-- FASE 6B / Sprint 30 — promociones y tramos
CREATE TABLE promotions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    starts_at DATETIME, ends_at DATETIME,
    applies_to TEXT NOT NULL,             -- 'PRODUCT' | 'CATEGORY' | 'LIST' | 'CART'
    rule_json TEXT NOT NULL,              -- {"kind":"buy_x_get_y"|"percent"|"threshold"|"tier", ...}
    max_stack_json TEXT NOT NULL DEFAULT '{}',
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE product_promotions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    promotion_id TEXT NOT NULL,
    product_id TEXT,
    category_id TEXT,
    price_list_id TEXT,
    UNIQUE (tenant_id, promotion_id, product_id, category_id, price_list_id),
    FOREIGN KEY (promotion_id) REFERENCES promotions(id),  -- COM-04
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (price_list_id) REFERENCES price_lists(id)
);

-- FASE 6B / Sprint 31 — variantes y unidades de medida
-- products.parent_product_id TEXT NULL (FK products.id); variante = fila products con parent.
CREATE TABLE product_uoms (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    uom_code TEXT NOT NULL,               -- 'UND' | 'CAJA' | 'PACK' | ...
    factor REAL NOT NULL,                 -- unidades base por UOM (rate, no money)
    is_base BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (tenant_id, product_id, uom_code)
);

-- FASE 6B / Sprint 32 — apartados y diario contable
-- COM-08: TODO abono es una fila de sale_deposit_payments (sin initial_deposit_cents duplicado);
-- Σ sale_deposit_payments = total cobrado; la conversión valida saldo contra la venta.
CREATE TABLE sale_deposits (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    customer_id TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN',  -- OPEN | OVERDUE | CONVERTED | CANCELLED
    deposit_date DATE NOT NULL,
    due_date DATE,
    sale_id TEXT,                         -- set al convertir (emite CPE)
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (status IN ('OPEN','OVERDUE','CONVERTED','CANCELLED')),
    FOREIGN KEY (sale_id) REFERENCES sales(id),  -- COM-04
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE TABLE sale_deposit_payments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sale_deposit_id TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sale_deposit_id) REFERENCES sale_deposits(id)  -- COM-04
);
-- COM-08: ítems apartados (reserva física) — resuelve qué productos/cantidades están apartados
CREATE TABLE sale_deposit_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sale_deposit_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT,
    qty REAL NOT NULL,
    unit_price_cents INTEGER NOT NULL,    -- congelado por servidor (Zero-Trust)
    FOREIGN KEY (sale_deposit_id) REFERENCES sale_deposits(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE chart_of_accounts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,                   -- ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE
    UNIQUE (tenant_id, code)
);
CREATE TABLE journal_entries (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    source_type TEXT NOT NULL,            -- SALE | PAYMENT | SUPPLIER_INVOICE | AR_AP | CASH_COUNT
    -- COM-07: extiende el ledger a la capa comercial
    --   + COMMISSION | SUPPLIER_RETURN | SALES_RETURN | STORE_CREDIT | LAYAWAY | INSTALLMENT
    source_id TEXT NOT NULL,
    post_date DATE NOT NULL,
    balanced_cents INTEGER NOT NULL DEFAULT 0,   -- sum debits - credits; debe ser 0
    posted_by_user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, source_type, source_id)
);
CREATE TABLE journal_lines (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    journal_entry_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    debit_cents INTEGER NOT NULL DEFAULT 0,
    credit_cents INTEGER NOT NULL DEFAULT 0,
    memo TEXT,
    FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id),  -- COM-04
    FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
);
-- DAT-07: lectura del asiento completo por entrada
CREATE INDEX idx_journal_lines_entry ON journal_lines(journal_entry_id);
```

#### DDL adicional (v8.1, FASE 6C — cierre comercial)

```sql
-- FASE 6C / Sprint 33 — cotizaciones/presupuestos
CREATE TABLE quotes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    customer_id TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT',  -- DRAFT | SENT | APPROVED | CONVERTED | EXPIRED | CANCELLED
    valid_until DATE,
    total_cents INTEGER NOT NULL DEFAULT 0,
    sale_id TEXT,                          -- set al CONVERTED
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE quote_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,               -- COM-01: aislamiento multi-tenant
    quote_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT,
    qty REAL NOT NULL,
    unit_price_cents INTEGER NOT NULL,     -- congelado por servidor (Zero-Trust)
    line_total_cents INTEGER NOT NULL,
    FOREIGN KEY (quote_id) REFERENCES quotes(id)
);

-- FASE 6C / Sprint 34 — devolución a proveedor
CREATE TABLE supplier_returns (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    supplier_id TEXT NOT NULL,
    supplier_invoice_id TEXT,              -- si proviene de compra facturada
    purchase_receipt_id TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN',   -- OPEN | CLOSED | CANCELLED
    total_cents INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE supplier_return_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,               -- COM-01
    return_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT,
    qty REAL NOT NULL,
    unit_cost_cents INTEGER NOT NULL,      -- revierte el PMP del momento
    igv_affectation_code TEXT NOT NULL DEFAULT '10',  -- COM-03: snapshot fiscal
    igv_amount_cents INTEGER NOT NULL DEFAULT 0,
    icbper_amount_cents INTEGER NOT NULL DEFAULT 0,
    line_total_cents INTEGER NOT NULL,
    FOREIGN KEY (return_id) REFERENCES supplier_returns(id)
);

-- FASE 6C / Sprint 35 — crédito de tienda / vales / gift cards
CREATE TABLE store_credit_accounts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    balance_cents INTEGER NOT NULL DEFAULT 0,   -- solo el servidor lo modifica
    currency TEXT NOT NULL DEFAULT 'PEN',
    expires_at DATETIME,
    UNIQUE (tenant_id, customer_id)
);
CREATE TABLE store_credit_transactions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    store_credit_account_id TEXT NOT NULL,
    type TEXT NOT NULL,                   -- ISSUE (venta de vale/NC convertida) | REDEEM | EXPIRE | ADJUST
    amount_cents INTEGER NOT NULL,
    sale_id TEXT,
    source_ref TEXT,                      -- 'gift_card_sale:{saleId}' | 'nc:{docId}'
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_credit_account_id) REFERENCES store_credit_accounts(id),  -- COM-04
    FOREIGN KEY (sale_id) REFERENCES sales(id)
);

-- FASE 6C / Sprint 36 — cuotas / pago en partes
-- COM-06: la cuota separa principal (base imponible+IGV) del interés; el interés se asienta
-- por separado con su IGV financiero y NUNCA reduce CxC 1:1 (Σcuotas > venta si hay interés).
CREATE TABLE sale_installments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sale_id TEXT NOT NULL,
    installment_number INTEGER NOT NULL,
    principal_cents INTEGER NOT NULL,     -- parte de la venta (base+IGV)
    interest_cents INTEGER NOT NULL DEFAULT 0,  -- interés financiero del tramo
    amount_cents INTEGER NOT NULL,        -- principal + interest (total a cobrar del tramo)
    due_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | PAID | OVERDUE | CANCELLED
    paid_at DATETIME,
    UNIQUE (tenant_id, sale_id, installment_number),
    FOREIGN KEY (sale_id) REFERENCES sales(id),  -- COM-04
    CHECK (status IN ('PENDING','PAID','OVERDUE','CANCELLED'))
);
-- COM-06: pago por cuota idempotente (anti doble aplicación)
CREATE TABLE sale_installment_payments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sale_installment_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    idempotency_key TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, idempotency_key),
    FOREIGN KEY (sale_installment_id) REFERENCES sale_installments(id)
);

-- FASE 6C / Sprint 37 — comisiones de vendedor
CREATE TABLE commission_rates (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    product_id TEXT, category_id TEXT,
    rate_percent REAL NOT NULL,           -- ratio, no money
    rate_amount_cents INTEGER,
    UNIQUE (tenant_id, seller_id, product_id, category_id),
    FOREIGN KEY (seller_id) REFERENCES users(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);
CREATE TABLE commission_payouts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    gross_cents INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',   -- OPEN | PAID | VOID
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (seller_id) REFERENCES users(id)
);
-- COM-07: devengo de comisión por venta — la NC/devolución revierte la fila (nunca se borra)
CREATE TABLE commission_accruals (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sale_id TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    reversed_at DATETIME,                 -- set si la venta se anula/devolvió (regla 13)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sale_id) REFERENCES sales(id),
    FOREIGN KEY (seller_id) REFERENCES users(id)
);
```

#### DDL adicional (v8.1, FASE 6D — inventario avanzado)

```sql
-- FASE 6D / Sprint 38 — ubicaciones/racks
CREATE TABLE inventory_locations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    code TEXT NOT NULL,                   -- 'A-01', 'B-02'...
    name TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (tenant_id, branch_id, code)
);
CREATE TABLE inventory_location_stock (
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    location_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    qty REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, branch_id, location_id, product_id)
);

-- FASE 6D / Sprint 39 — números de serie
CREATE TABLE serial_numbers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    serial_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'AVAILABLE',  -- AVAILABLE | SOLD | RETURNED | IN_TRANSIT
    sale_item_id TEXT,
    supplier_invoice_id TEXT,
    UNIQUE (tenant_id, product_id, serial_number)
);

-- FASE 6D / Sprint 40 — venta por peso variable
-- sale_items.qty REAL (ya existente) es la base; para productos type 'WEIGH':
CREATE TABLE weight_measurements (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sale_item_id TEXT NOT NULL,
    weight REAL NOT NULL,                 -- unidades base (kg)
    unit_price_per_base_cents INTEGER NOT NULL,
    override_reason TEXT,                 -- solo con authz (WEIGHT_OVERRIDE)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- FASE 6D / Sprint 41 — etiquetas de precio
CREATE TABLE price_label_templates (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    template_json TEXT NOT NULL,          -- campos: producto, precio vigente, barcode, shelf
    paper_width_mm INTEGER NOT NULL DEFAULT 58,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- FASE 6G / Sprint 25 — config de terminales POS (fuente del printRouter)
-- La adaptabilidad de ticketera (58/80mm) es config del DISPOSITIVO, no del ticket:
-- el servidor la resuelve al abrir la sesión de caja y el cliente solo la sobreescribe
-- como fallback. 58mm => line_width 32 chars (maxNameLen 14); 80mm => 48 chars (26).
CREATE TABLE pos_terminals (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    label TEXT,                           -- "Caja 1", "Terraza", ...
    paper_width_mm INTEGER NOT NULL DEFAULT 58,  -- 58 | 80
    line_width INTEGER NOT NULL DEFAULT 32,      -- 32 | 48 (derivado: 58mm->32, 80mm->48)
    printer_strategy TEXT NOT NULL DEFAULT 'webusb',  -- webusb | wss_lan | bluetooth | system_print
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, branch_id, id),
    CHECK (paper_width_mm IN (58, 80)),
    CHECK (line_width IN (32, 48)),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- FASE 6D / Sprint 42 — export/restore del negocio
CREATE TABLE data_backups (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'RUNNING',  -- RUNNING | READY | FAILED | RESTORED
    r2_key TEXT NOT NULL,
    encryption_ref TEXT NOT NULL,         -- envoltura KMS, nunca clave en claro
    size_bytes INTEGER,
    created_by_user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### DDL adicional (v8.1, FASE 6E — servicios y fuerza de venta)

```sql
-- FASE 6E / Sprint 43 — preventa / pedido a cliente
CREATE TABLE customer_orders (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    customer_id TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN',  -- OPEN | FULFILLED | PARTIAL | CANCELLED
    pickup_at DATE,
    reserved_until DATETIME,              -- COM-09: la reserva sin pago previo caduca (regla 28)
    sale_id TEXT,
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE TABLE customer_order_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,               -- COM-01: aislamiento multi-tenant
    customer_order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT,
    qty REAL NOT NULL,
    reserved_qty REAL NOT NULL DEFAULT 0,  -- COM-09: cantidad físicamente apartada del stock
    fulfilled_qty REAL NOT NULL DEFAULT 0,
    unit_price_cents INTEGER NOT NULL,    -- Zero-Trust al momento del pedido
    FOREIGN KEY (customer_order_id) REFERENCES customer_orders(id)
);

-- FASE 6E / Sprint 44 — ventas recurrentes / membresías
-- COM-09: cada ocurrencia re-resuelve el precio del ítem (regla 1); la idempotencia
-- plan×run_date es física (anti duplicado de ocurrencia), no solo un criterio.
CREATE TABLE recurring_plans (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    doc_type TEXT NOT NULL DEFAULT 'NV',  -- NV | 03 (boleta) | 01 (factura)
    frequency TEXT NOT NULL,              -- DAILY | WEEKLY | MONTHLY
    next_run DATE NOT NULL,
    items_json TEXT NOT NULL,             -- [{product_id, qty, unit_price_cents}]
    status TEXT NOT NULL DEFAULT 'ACTIVE',-- ACTIVE | PAUSED | CANCELLED
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- FASE 6E / Sprint 45 — notificaciones push + caja móvil
CREATE TABLE push_subscriptions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- COM-09: ocurrencias ejecutadas del plan recurrente (idempotencia física por plan×fecha)
CREATE TABLE recurring_occurrences (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    run_date DATE NOT NULL,
    sale_id TEXT,
    idempotency_key TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (plan_id, run_date),
    UNIQUE (tenant_id, idempotency_key),
    FOREIGN KEY (plan_id) REFERENCES recurring_plans(id),
    FOREIGN KEY (sale_id) REFERENCES sales(id)
);
-- Caja móvil: reusa el core (PWA terminal); sin tablas nuevas de dominio.
```

#### DDL adicional (v8.1, FASE 6F — analítica predictiva + compliance)

```sql
-- FASE 6F / Sprint 46 — analítica predictiva (gated Cadena)
CREATE TABLE forecast_outputs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    forecast_date DATE NOT NULL,
    predicted_qty REAL NOT NULL,
    predicted_gross_cents INTEGER NOT NULL,
    confidence_low_qty REAL, confidence_high_qty REAL,
    model_version TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, branch_id, product_id, forecast_date)
);

-- FASE 6F / Sprint 47 — LPDP: PII y consentimiento
CREATE TABLE consent_records (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    purpose TEXT NOT NULL,                -- 'messaging_whatsapp' | 'marketing' | ...
    granted BOOLEAN NOT NULL,
    granted_at DATETIME,
    revoked_at DATETIME,
    UNIQUE (tenant_id, customer_id, purpose)
);
-- Borrado/anonimización: customers.pii_erased BOOLEAN DEFAULT FALSE (anonimiza nombre/email/tel);
-- los doc fiscales se retienen (SUNAT) pero quedan anonimizados en su vínculo a persona.

-- FASE 6F / Sprint 48 — DR/BCP
-- Reusa data_backups (regla 27); los simulacros y RPO/RTO son runbooks de Staff SRE,
-- no tablas de dominio. Alarma: dr_simulation log vía audit_events.

-- FASE 6F / Sprint 49 — inteligencia del negocio (analytics.agentic_insights, gated Cadena/Enterprise)
CREATE TABLE insight_log (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,        -- UUID del mensaje por tenant; reenvío devuelve respuesta cacheada
    interaction_type TEXT NOT NULL,       -- 'chat_query' | 'briefing_generated' | 'briefing_viewed'
    status TEXT NOT NULL DEFAULT 'OK',    -- 'OK' | 'LIMIT_CAPPED' | 'PII_BLOCKED' | 'TOO_WIDE'
    sql_executed TEXT NOT NULL,           -- SELECT exacto ejecutado en D1 (auditable, append-only)
    facts_json TEXT NOT NULL,             -- hechos tipados que el NLG recibió verbatim
    response_text TEXT NOT NULL,          -- prosa generada (data de output, jamás se re-ejecuta)
    model_version TEXT NOT NULL,
    tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_insight_log_tenant ON insight_log(tenant_id, created_at);
CREATE UNIQUE INDEX uq_insight_log_tenant_idem ON insight_log(tenant_id, idempotency_key);

CREATE TABLE ai_usage_counters (
    tenant_id TEXT NOT NULL,
    usage_date DATE NOT NULL,
    queries INTEGER NOT NULL DEFAULT 0,
    tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    quota_queries INTEGER NOT NULL,        -- cupo diario de consultas según plan (metering)
    PRIMARY KEY (tenant_id, usage_date)
);
-- Nota: el briefing diario (cron 3:30 AM) consume ai_usage_counters como 1 query + tokens_out;
-- el excedente del cupo se factura según el modelo de sobregiro (§4.1) y `AI_QUOTA_EXCEEDED` se
-- registra en audit_events + rate limit. El LLM es stateless; tenant_id viene del JWT (WHERE forzado).

-- FASE 6G / Sprints 50-53 — flujo del cliente (product/UX)
-- Handoff de turno (regla 35): log de operadores por sesión; la sesión NO se cierra, cambia de operador.
CREATE TABLE cash_register_shifts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    cash_register_session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,                    -- operador saliente del tramo
    started_at DATETIME NOT NULL,
    ended_at DATETIME,
    transfer_pin_hash TEXT,                   -- PIN temporal de un solo uso (hash, expira)
    transfer_pin_expires_at DATETIME,
    interim_count_cents INTEGER,              -- conteo ligero intermedio (nullable, según política)
    cash_diff_cents INTEGER,                  -- diferencia si interim_required = true
    FOREIGN KEY (cash_register_session_id) REFERENCES cash_register_sessions(id)
);

-- Equipo (regla 36): PIN de caja + badge para el vendedor (atribución <1s en carrito).
-- Extensión de users: pin_hash TEXT, badge_barcode TEXT.
-- badge_barcode: generado server-side con prefijo reservado 'EMP-' + id (ej. 'EMP-12345'),
-- UNIQUE por tenant y FUERA del espacio EAN-13/UPC (regla 36). Nunca se edita a mano;
-- 'EMP-' está prohibido en products.barcode (validación Escáner Rápido + CatalogImporter, regla 34).

-- Venta rápida sin catálogo (regla 34b): línea genérica, no descuenta stock.
-- sale_items.is_uncatalogued INTEGER DEFAULT 0 declarado en el DDL §5.3 (product_id NULL si =1).
```


**Fuera de §5.3 / v8.1:** ver FASE 6B (reglas 13–17, profundidad retail), FASE 6C-6F (reglas 18–33: cierre comercial, inventario avanzado, servicios, predictiva + compliance + inteligencia del negocio), FASE 6G (reglas 34–37: flujo del cliente — catálogo rápido, handoff, equipo, tour/troubleshooter), §5.4 (ecosistema v9) y backlog v10 en Agents FASE 7 (multi-moneda UI, propinas, cajón de efectivo, GRE completo, percepciones/retenciones/detracciones, ND completa, e-commerce, portal adquirente, importer Siigo, sandbox SUNAT).

### **5.4 Ecosistema Perú (Atlas v9) — puertos de integración Zero-Trust**

Extiende el core sin meter SDKs de terceros en `domain-sales`. Implementación: Agents FASE 7 (sprints 21–24). **Stripe de billing SaaS** no es medio de pago de caja.

#### Reglas

1. **Import:** `CatalogImporter` solo escribe tras dry-run aprobado; claves externas (`external_source`, `external_id`) evitan duplicados; impuestos se mapean a tablas Atlas, nunca se copian reglas fiscales opacas del competidor.
2. **Pagos en caja:** el cliente elige método; el servidor llama `PaymentAcquirer` y persiste `sale_payments` con estado monotónico; montos los impone el sale engine; reintentos idempotentes. **Captura offline de medio electrónico (edge 2B):** si el POS está sin red, un pago con billetera/QR (Yape/Plin/MP) puede marcarse **"Captura Manual"**: la UI muestra alerta ámbar al cajero *"Sin conexión. Verifica visualmente la app del cliente antes de entregar el producto"*; al sincronizar, el servidor persiste el pago con estado **`MANUAL_ELECTRONIC_CAPTURE`** en `payment_captures` (sin llamar al adquirente) y Modo Dueño lo lista como **no conciliado por API** (reporte §9), para que el dueño audite la confianza del cajero. Nunca se marca manual un pago online con captura API confirmada.
3. **Export contable:** `AccountingExporter` es de solo lectura sobre ventas/CxC/CxP ya ACID; no altera el ledger al exportar.
4. **API pública:** autenticación por API key de tenant; webhooks con HMAC; eventos mínimos `sale.created`, `cpe.accepted`, `cpe.rejected`; capability `integrations.api` (Plan Guard 402 en rutas API, nunca en cobro).
5. **Messaging:** `MessagingSender` post-commit; opt-in del cliente; NV y CPE usan plantillas distintas (leyendas correctas).
6. **Loyalty:** puntos como policy de descuento/`CreditLimit`-adjacent; canje pasa por authz Sprint 17; no `switch(vertical)`.

#### DDL adicional (v9)

```sql
CREATE TABLE external_entity_map (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    source TEXT NOT NULL,          -- 'bsale' | 'alegra' | 'csv'
    entity_type TEXT NOT NULL,     -- 'product' | 'customer' | 'series'
    external_id TEXT NOT NULL,
    internal_id TEXT NOT NULL,
    UNIQUE (tenant_id, source, entity_type, external_id)
);

CREATE TABLE payment_captures (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sale_id TEXT NOT NULL,
    sale_payment_id TEXT NOT NULL,
    acquirer TEXT NOT NULL,        -- 'yape' | 'plin' | 'mercadopago' | 'culqi' | 'niubiz'
    acquirer_ref TEXT,
    status TEXT NOT NULL,          -- 'PENDING' | 'CAPTURED' | 'FAILED' | 'REFUNDED' | 'MANUAL_ELECTRONIC_CAPTURE'
    amount_cents INTEGER NOT NULL,
    idempotency_key TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, idempotency_key),
    FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id),
    FOREIGN KEY (tenant_id, sale_payment_id) REFERENCES sale_payments(tenant_id, id),
    -- DAT-04: catálogo cerrado de estados de captura
    CHECK (status IN ('PENDING','CAPTURED','FAILED','REFUNDED','MANUAL_ELECTRONIC_CAPTURE'))
);

CREATE TABLE api_keys (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL,           -- HMAC-SHA256 con salt aleatorio por key (+ pepper) — nunca SHA-1 sin salt
    status TEXT NOT NULL DEFAULT 'active',
    last_used_at DATETIME,            -- SEC-04: telemetría de uso/rotación
    created_by_user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    revoked_at DATETIME,
    UNIQUE (tenant_id, key_prefix),   -- SEC-04
    CHECK (status IN ('active','revoked'))  -- SEC-04
);

CREATE TABLE webhook_endpoints (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    url TEXT NOT NULL,                -- SEC-04: solo HTTPS, deny-list de IP privada/link-local/169.254.169.254
    secret_hash TEXT NOT NULL,        -- SHA-256 con salt; lookup/compare de configuración
    secret_kms_ref TEXT NOT NULL,     -- secreto operativo cifrado; nunca se intenta reconstruir desde el hash
    secret_salt BLOB NOT NULL,
    events_json TEXT NOT NULL,        -- ["sale.created","cpe.accepted"]
    status TEXT NOT NULL DEFAULT 'active',
    failure_count INTEGER NOT NULL DEFAULT 0,  -- SEC-04: auto-disable tras N fallos (5s timeout, backoff)
    last_failure_at DATETIME
);
CREATE UNIQUE INDEX uq_webhook_endpoints_tenant_id ON webhook_endpoints(tenant_id, id);

CREATE TABLE webhook_deliveries (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    endpoint_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_error TEXT,
    delivered_at DATETIME,
    UNIQUE (endpoint_id, event_id),
    CHECK (status IN ('PENDING','PROCESSING','DELIVERED','FAILED','DISABLED')),
    FOREIGN KEY (tenant_id, endpoint_id) REFERENCES webhook_endpoints(tenant_id, id)
);

-- SEC-03: certificados SUNAT del tenant — la clave privada vive SOLO en Workers Secrets/envoltura KMS,
-- jamás en D1/KV/R2; rotación ≥ 2 años y en caso de compromiso.
CREATE TABLE tenant_certificates (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    alias TEXT NOT NULL,              -- 'SUNAT' | 'PSE_PLATFORM'
    private_key_kms_ref TEXT NOT NULL, -- ref KMS/Secret, no la clave
    cert_chain_pem TEXT NOT NULL,
    fingerprint_sha256 TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    rotated_at DATETIME,
    UNIQUE (tenant_id, alias),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- SEC-08: dedup de eventos entrantes de pasarelas/Stripe (anti replay y anti re-entrega doble)
CREATE TABLE webhook_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    source TEXT NOT NULL,             -- 'stripe' | 'yape' | 'plin' | 'mercadopago' | ...
    event_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PROCESSING',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    processed_at DATETIME,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (source, event_id),
    CHECK (status IN ('PROCESSING','PROCESSED','FAILED'))
);

CREATE TABLE loyalty_accounts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    points_balance REAL NOT NULL DEFAULT 0,
    UNIQUE (tenant_id, customer_id),
    -- COM-12: saldo jamás negativo + vínculo al cliente
    CHECK (points_balance >= 0),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Canje con bloqueo pesimista (v8.2). Offline: loyalty deshabilitado.
CREATE TABLE loyalty_reservations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    sale_idempotency_key TEXT NOT NULL,  -- misma key que la venta offline/online
    points REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'RESERVED',
    -- RESERVED | REDEEMED | EXPIRED | CANCELLED
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, sale_idempotency_key),
    CHECK (points >= 0),
    CHECK (status IN ('RESERVED','REDEEMED','EXPIRED','CANCELLED')),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE INDEX idx_loyalty_res_expiry ON loyalty_reservations(status, expires_at);
```

**Loyalty (FASE 7, v9 — `loyalty.points`, Sprint 24):** al aplicar puntos online → `RESERVED` (no resta del balance visible hasta commit); al consolidar venta ACID → `REDEEMED` + `audit_events`; si falla/offline/expira → barrendero (`alarm`/cron) marca `EXPIRED` y libera. Reintento de venta con la misma `idempotency_key` **reutiliza** la reserva.

**Reserva expirada en retry offline (edge case, Sprint 24):** si una venta **empezó online** (puntos `RESERVED`), la red se cortó antes del commit, la venta cayó a la cola offline y el barrendero expiró la reserva antes del sync, al consolidar el retry el servidor **commite la venta sin puntos** (promesa de caja intacta, Principio 5): no bloquea el cobro, no descuenta del balance y **jamás** genera saldo negativo de puntos. Se registra `audit_events` `LOYALTY_RESERVATION_EXPIRED` (`sale_id`, `loyalty_reservation_id`, motivo `EXPIRED_ON_RETRY`) + notificación al Dueño vía push (Modo Dueño) para ofrecer crédito de cortesía. Alternativa válida para el cajero online: si la reserva aún está vigente, el retry la reutiliza (canje normal).

**No copiar de la categoría (fuera de Atlas):** ERP nómina/MRP, marketplace propio, “contingencia SUNAT” por falta de `.pfx`.

\-- DDL para Cloudflare D1 (SQLite) \- Arquitectura Enterprise Atlas v8.0

CREATE TABLE tenants (  
    id TEXT PRIMARY KEY,  
    ruc TEXT,                          -- NULL permitido en INTERNAL_CONTROL pre-RUC  
    business\_name TEXT NOT NULL,  
    trade\_name TEXT,  
    address TEXT,  
    ubigeo TEXT,  
    logo\_url TEXT,  
    vertical\_type TEXT NOT NULL,  
    tax\_regime TEXT NOT NULL DEFAULT 'UNKNOWN',  
    -- 'NRUS' | 'RER' | 'RMT' | 'RG' | 'UNKNOWN' (pre-formalización)  
    formalization\_mode TEXT NOT NULL DEFAULT 'INTERNAL_CONTROL',  
    -- 'INTERNAL_CONTROL' | 'FORMALIZING' | 'ELECTRONIC_ISSUER'  
    sunat\_certificate\_status TEXT NOT NULL DEFAULT 'NONE',  
    -- 'NONE' | 'PENDING_UPLOAD' | 'ACTIVE' | 'EXPIRED' | 'REVOKED'  
    -- En FORMALIZING/ELECTRONIC: PSE Atlas puede operar con cert de plataforma aunque tenant.cert = NONE  
    pse\_mode TEXT NOT NULL DEFAULT 'ATLAS_PSE',  
    -- 'ATLAS_PSE' (default producto) | 'TENANT_CERT' (emisor con .pfx propio)  
    enabled\_document\_types TEXT NOT NULL DEFAULT '["NV"]',  
    -- JSON array: NV, 01, 03, 07, 08, 12 — filtrado por tax_regime × formalization_mode  
    -- Planes de producto (GTM §4.1): arranque | crece | cadena | enterprise
    plan\_id TEXT NOT NULL DEFAULT 'arranque'
        CHECK (plan\_id IN ('arranque', 'crece', 'cadena', 'enterprise')),  
    subscription\_status TEXT NOT NULL DEFAULT 'trial'
        CHECK (subscription\_status IN ('trial', 'active', 'past_due', 'canceled')),  -- SEC-12
    trial\_ends\_at DATETIME,  
    shard\_id TEXT NOT NULL DEFAULT 'D1_SHARD_01',
    is\_active BOOLEAN NOT NULL DEFAULT TRUE,  
    deleted\_at DATETIME,  
    created\_at DATETIME DEFAULT CURRENT\_TIMESTAMP  
);  
CREATE UNIQUE INDEX idx\_tenants\_ruc ON tenants(ruc) WHERE ruc IS NOT NULL AND deleted\_at IS NULL;

CREATE TABLE branches (  
    id TEXT PRIMARY KEY,  
    tenant\_id TEXT NOT NULL,  
    code TEXT NOT NULL,  
    name TEXT NOT NULL,
    address TEXT NOT NULL,  
    ubigeo TEXT,  
    is\_active BOOLEAN NOT NULL DEFAULT TRUE,  
    deleted\_at DATETIME,  
    created\_at DATETIME DEFAULT CURRENT\_TIMESTAMP,  
    FOREIGN KEY (tenant\_id) REFERENCES tenants(id)  
);  
CREATE UNIQUE INDEX idx\_branches\_tenant\_code ON branches(tenant\_id, code) WHERE deleted\_at IS NULL;

CREATE TABLE cash\_registers (  
    id TEXT PRIMARY KEY,  
    tenant\_id TEXT NOT NULL,  
    branch\_id TEXT NOT NULL,  
    name TEXT NOT NULL,  
    paper\_width\_mm INTEGER NOT NULL DEFAULT 80, \-- 58mm (32 chars) o 80mm (48 chars)  
    line\_width INTEGER NOT NULL DEFAULT 48,      \-- Ancho de línea dinámico para ESC/POS  
    is\_active BOOLEAN NOT NULL DEFAULT TRUE,  
    deleted\_at DATETIME,  
    created\_at DATETIME DEFAULT CURRENT\_TIMESTAMP,  
    FOREIGN KEY (branch\_id) REFERENCES branches(id)  
);

-- Series por SUCURSAL (establecimiento), no por caja — alineado a práctica SUNAT.
-- La caja solo selecciona una serie habilitada de su branch.
-- Correlativo offline: reserva vía Durable Object por (tenant, series) o bloque local reconciliado en servidor.
CREATE TABLE branch\_document\_series (  
    id TEXT PRIMARY KEY,  
    tenant\_id TEXT NOT NULL,  
    branch\_id TEXT NOT NULL,  
    document\_type\_code TEXT NOT NULL,  
    -- 'NV' | 'NV_RETURN' | '01' | '03' | '07' | '08' | '12'  
    series TEXT NOT NULL,             -- 'NV01', 'F001', 'B001', 'FC01'  
    current\_number INTEGER NOT NULL DEFAULT 0,  
    authorization\_status TEXT NOT NULL DEFAULT 'INTERNAL',  
    -- 'INTERNAL' (solo NV) | 'PENDING_SUNAT' | 'AUTHORIZED' | 'REVOKED'  
    is\_active BOOLEAN NOT NULL DEFAULT TRUE,  
    FOREIGN KEY (branch\_id) REFERENCES branches(id)  
);  
CREATE UNIQUE INDEX idx\_branch\_series\_type  
  ON branch\_document\_series(tenant\_id, branch\_id, document\_type\_code, series);

CREATE TABLE cash\_register\_sessions (  
    id TEXT PRIMARY KEY,  
    tenant\_id TEXT NOT NULL,  
    branch\_id TEXT NOT NULL,  
    cash\_register\_id TEXT NOT NULL,  
    user\_id TEXT NOT NULL,  
    opening\_balance_cents INTEGER NOT NULL DEFAULT 0,  
    closing\_balance_cents INTEGER,  
    status TEXT NOT NULL DEFAULT 'OPEN', \-- 'OPEN', 'CLOSED'  
    opened\_at DATETIME DEFAULT CURRENT\_TIMESTAMP,  
    closed\_at DATETIME,  
    -- DAT-04: catálogo cerrado de estados de caja
    CHECK (status IN ('OPEN','CLOSED')),
    FOREIGN KEY (cash\_register\_id) REFERENCES cash\_registers(id)  
);

CREATE TABLE users (  
    id TEXT PRIMARY KEY,  
    tenant\_id TEXT NOT NULL,  
    branch\_id TEXT,  
    external\_auth\_id TEXT,  
    email TEXT NOT NULL,  
    password\_hash TEXT,  
    role TEXT NOT NULL DEFAULT 'cashier',  
    permissions TEXT NOT NULL DEFAULT '\[\]',  
    is\_active BOOLEAN NOT NULL DEFAULT TRUE,  
    deleted\_at DATETIME,  
    created\_at DATETIME DEFAULT CURRENT\_TIMESTAMP,  
    -- SEC-12: catálogo cerrado de roles (autorización §3)
    CHECK (role IN ('owner','admin','supervisor','cashier')),
    FOREIGN KEY (tenant\_id) REFERENCES tenants(id)  
);  
CREATE UNIQUE INDEX idx\_users\_tenant\_email ON users(tenant\_id, email) WHERE deleted\_at IS NULL;
-- PERF-05: lookup de sesión por request (external_auth_id)
CREATE UNIQUE INDEX idx\_users\_external\_auth ON users(tenant\_id, external\_auth\_id) WHERE deleted\_at IS NULL AND is\_active = 1;
CREATE UNIQUE INDEX uq\_users\_tenant\_id ON users(tenant\_id, id);

CREATE TABLE customers (  
    id TEXT PRIMARY KEY,  
    tenant\_id TEXT NOT NULL,  
    document\_type\_code TEXT NOT NULL, \-- '1' DNI, '6' RUC, '4' CE  
    document\_number TEXT NOT NULL,  
    name TEXT,  -- NULL después de anonimización LPDP; el documento fiscal conserva snapshot legal separado
    email TEXT,  
    phone TEXT,  
    address TEXT,  
    credit\_limit_cents INTEGER DEFAULT 0,  
    profile\_updated\_at DATETIME DEFAULT CURRENT\_TIMESTAMP, \-- LWW: quien trae el timestamp más nuevo gana  
    is\_active BOOLEAN NOT NULL DEFAULT TRUE,  
    deleted\_at DATETIME,  
    pii\_erased INTEGER NOT NULL DEFAULT 0,       \-- SEC-07/LPDP (regla 32): 1 = PII anonimizada (nombre/email/tel = NULL); el doc fiscal SUNAT se retiene
    erased\_at DATETIME,                          \-- sello de cuándo se anonimizó
    created\_at DATETIME DEFAULT CURRENT\_TIMESTAMP,  
    -- SEC-07: una fila anonimizada/borrada NO puede ser re-viva por un upsert LWW offline
    CHECK (pii\_erased IN (0,1)),
    FOREIGN KEY (tenant\_id) REFERENCES tenants(id)  
);  
CREATE UNIQUE INDEX idx\_customers\_doc ON customers(tenant\_id, document\_type\_code, document\_number) WHERE deleted\_at IS NULL;
CREATE UNIQUE INDEX uq\_customers\_tenant\_id ON customers(tenant\_id, id);

-- LPDP: la solicitud de anonimización pone PII viva en NULL y marca pii_erased/erased_at.
-- En snapshots fiscales NOT NULL (sales.client_name) usa '[ANONYMIZED]'; conserva solo los
-- campos exigidos por SUNAT, hash/serie/número y la trazabilidad del comprobante.

CREATE TABLE taxes (  
    id TEXT PRIMARY KEY,  
    tenant\_id TEXT NOT NULL,  
    code TEXT NOT NULL, \-- '1000' IGV, '7152' ICBPER  
    name TEXT NOT NULL,  
    rate\_percentage REAL NOT NULL,  
    is\_flat\_fee BOOLEAN DEFAULT FALSE,  
    flat\_fee\_amount_cents INTEGER DEFAULT 0,  
    is\_active BOOLEAN NOT NULL DEFAULT TRUE,  
    FOREIGN KEY (tenant\_id) REFERENCES tenants(id)  
);

CREATE TABLE products (  
    id TEXT PRIMARY KEY,  
    tenant\_id TEXT NOT NULL,  
    sku TEXT NOT NULL,  
    barcode TEXT,  
    name TEXT NOT NULL,  
    description TEXT,  
    product\_type TEXT NOT NULL DEFAULT 'physical', \-- 'physical', 'service', 'kit'  
    unit\_code TEXT NOT NULL,  
    price_cents INTEGER NOT NULL,  
    cost_cents INTEGER DEFAULT 0,  
    currency TEXT DEFAULT 'PEN',  
    stock REAL NOT NULL DEFAULT 0.0,  
    allow\_negative\_stock BOOLEAN DEFAULT FALSE,  
    charges\_icbper BOOLEAN NOT NULL DEFAULT FALSE, \-- bolsas plásticas: motor suma ICBPER en servidor  
    -- FIS-11: charges_icbper es SOLO flag de conveniencia derivado de product_taxes→taxes(code='7152');
    -- el importe por bolsa vive únicamente en taxes.flat_fee_amount_cents (fuente única, nunca duplicado).  
    igv\_affectation\_code\_default TEXT NOT NULL DEFAULT '10',  
    -- Catálogo 07 default del producto (gravado 10, exonerado 20, inafecto 30, gratuito 31, …)  
    version INTEGER NOT NULL DEFAULT 1,  
    is\_active BOOLEAN NOT NULL DEFAULT TRUE,  
    deleted\_at DATETIME,  
    created\_at DATETIME DEFAULT CURRENT\_TIMESTAMP,  
    FOREIGN KEY (tenant\_id) REFERENCES tenants(id)  
);  
CREATE UNIQUE INDEX idx\_products\_tenant\_sku ON products(tenant\_id, sku) WHERE deleted\_at IS NULL;

CREATE TABLE product\_taxes (  
    id TEXT PRIMARY KEY,  
    tenant\_id TEXT NOT NULL,  
    product\_id TEXT NOT NULL,  
    tax\_id TEXT NOT NULL,  
    FOREIGN KEY (product\_id) REFERENCES products(id),  
    FOREIGN KEY (tax\_id) REFERENCES taxes(id)  
);
-- PERF-03: JOIN product_taxes×taxes por producto en el hot path
CREATE INDEX idx\_product\_taxes\_product ON product\_taxes(tenant\_id, product\_id);

CREATE TABLE product\_recipes (  
    id TEXT PRIMARY KEY,  
    tenant\_id TEXT NOT NULL,  
    parent\_product\_id TEXT NOT NULL,  
    child\_product\_id TEXT NOT NULL,  
    quantity REAL NOT NULL,  
    deleted\_at DATETIME,  
    created\_at DATETIME DEFAULT CURRENT\_TIMESTAMP,  
    FOREIGN KEY (parent\_product\_id) REFERENCES products(id),  
    FOREIGN KEY (child\_product\_id) REFERENCES products(id)  
);

CREATE TABLE price\_lists (  
    id TEXT PRIMARY KEY,  
    tenant\_id TEXT NOT NULL,  
    name TEXT NOT NULL,  
    is\_default BOOLEAN DEFAULT FALSE,  
    is\_active BOOLEAN DEFAULT TRUE,  
    deleted\_at DATETIME,  
    created\_at DATETIME DEFAULT CURRENT\_TIMESTAMP  
);

CREATE TABLE product\_prices (  
    id TEXT PRIMARY KEY,  
    tenant\_id TEXT NOT NULL,  
    price\_list\_id TEXT NOT NULL,  
    product\_id TEXT NOT NULL,  
    price_cents INTEGER NOT NULL,  
    FOREIGN KEY (price\_list\_id) REFERENCES price\_lists(id),  
    FOREIGN KEY (product\_id) REFERENCES products(id)  
);
-- PERF-03: lookup de precio por (lista, producto) en el hot path
CREATE INDEX idx\_product\_prices\_list\_product ON product\_prices(tenant\_id, price\_list\_id, product\_id);

CREATE TABLE inventory\_batches (  
    id TEXT PRIMARY KEY,  
    tenant\_id TEXT NOT NULL,  
    branch\_id TEXT NOT NULL,  
    product\_id TEXT NOT NULL,  
    batch\_number TEXT NOT NULL,  
    expiration\_date DATE,  
    stock REAL NOT NULL DEFAULT 0,  
    is\_active BOOLEAN NOT NULL DEFAULT TRUE,  
    deleted\_at DATETIME,  
    created\_at DATETIME DEFAULT CURRENT\_TIMESTAMP,  
    FOREIGN KEY (branch\_id) REFERENCES branches(id),  
    FOREIGN KEY (product\_id) REFERENCES products(id)  
);

CREATE TABLE branch_product_stock (
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    stock REAL NOT NULL DEFAULT 0, -- puede ser negativo solo por OFFLINE_OVERSELL y queda auditado
    pmp_unit_cost_cents INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, branch_id, product_id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);
CREATE INDEX idx_branch_product_stock_product ON branch_product_stock(tenant_id, product_id, branch_id);

CREATE TABLE inventory\_movements (  
    id TEXT PRIMARY KEY,  
    tenant\_id TEXT NOT NULL,  
    branch\_id TEXT NOT NULL,  
    product\_id TEXT NOT NULL,  
    batch\_id TEXT,  
    movement\_type TEXT NOT NULL, \-- 'VENTA', 'COMPRA', 'AJUSTE', 'DEVOLUCION\_NC', 'VENTA\_BOM'  
    quantity\_delta REAL NOT NULL,  
    unit\_cost_cents INTEGER NOT NULL DEFAULT 0,  
    stock\_after REAL NOT NULL,  
    user\_id TEXT NOT NULL,  
    reference\_id TEXT,  
    created\_at DATETIME DEFAULT CURRENT\_TIMESTAMP,  
    FOREIGN KEY (branch\_id) REFERENCES branches(id),  
    FOREIGN KEY (product\_id) REFERENCES products(id)  
);

CREATE TABLE payment\_methods (  
    id TEXT PRIMARY KEY,  
    tenant\_id TEXT NOT NULL,  
    code TEXT NOT NULL,  
    name TEXT NOT NULL,  
    is\_active BOOLEAN DEFAULT TRUE  
);
CREATE UNIQUE INDEX uq\_payment\_methods\_tenant\_id ON payment\_methods(tenant\_id, id);

CREATE TABLE exchange\_rates (  
    id TEXT PRIMARY KEY,  
    tenant\_id TEXT NOT NULL,  
    source\_currency TEXT NOT NULL,  
    target\_currency TEXT NOT NULL,  
    rate REAL NOT NULL,  
    effective\_date DATE NOT NULL,  
    created\_at DATETIME DEFAULT CURRENT\_TIMESTAMP  
);
-- PERF-06: snapshot de tipo de cambio por (tenant, par, vigencia) — se lee FUERA de la tx (es snapshot)
CREATE INDEX idx\_exchange\_rates\_tenant\_ccy ON exchange\_rates(tenant\_id, source\_currency, target\_currency, effective\_date);

CREATE TABLE sales (  
    id TEXT PRIMARY KEY,  
    tenant\_id TEXT NOT NULL,  
    branch\_id TEXT NOT NULL,  
    cash\_register\_session\_id TEXT NOT NULL,  
    user\_id TEXT NOT NULL,  
    customer\_id TEXT,  
    offline\_client\_sale\_id TEXT,  
    client\_document\_type TEXT NOT NULL,  
    client\_document\_number TEXT NOT NULL,  
    client\_name TEXT NOT NULL,  
    document\_type TEXT NOT NULL, \-- 'NV' | 'NV_RETURN' | '01' | '03' | '07' | '08' | '12'  
    series TEXT NOT NULL,  
    number INTEGER NOT NULL,  
    referenced\_sale\_id TEXT,  
    credit\_note\_motive\_code TEXT, \-- Catálogo 09 (NC) / 10 (ND)  
    currency TEXT NOT NULL DEFAULT 'PEN',  
    exchange\_rate REAL DEFAULT 1.0,  
    total\_taxable_cents INTEGER DEFAULT 0,  
    total\_exempt_cents INTEGER DEFAULT 0,  
    total\_igv_cents INTEGER DEFAULT 0,  
    total\_icbper_cents INTEGER DEFAULT 0,  
    total\_discount_cents INTEGER DEFAULT 0,  
    total\_cogs_cents INTEGER DEFAULT 0,  
    total\_amount_cents INTEGER NOT NULL,  
    issued\_at\_lima DATETIME NOT NULL,  
    must\_submit\_by DATETIME, \-- NULL para NV; factura ~+3d; boleta/~RC ~+7d (fin día Lima)  
    daily\_summary\_id TEXT, \-- FK lógica a sunat_daily_summaries (boletas)  
    void\_status TEXT NOT NULL DEFAULT 'NONE',  
    -- 'NONE' | 'VOID_PENDING_RC' | 'VOIDED' (baja informada en Resumen Diario)  
    sunat\_status TEXT NOT NULL DEFAULT 'PENDING',  
    -- CPE: PENDING | PROCESSING | ACCEPTED | REJECTED | QUARANTINED (mensaje venenoso) | DEADLINE_EXCEEDED | DLQ_REQUIRES_INTERVENTION (negocio 4xx)  
    -- NV: NOT_APPLICABLE  
    -- Deprecated: PENDING_CERTIFICATE (reemplazado por PSE Atlas — ADR-FISCAL-001)  
    sunat\_xml\_hash TEXT,  
    sunat\_qr\_payload TEXT,  
    sunat\_response\_code TEXT,  
    sunat\_error\_message TEXT,  
    retry\_count INTEGER DEFAULT 0,  
    deleted\_at DATETIME,  
    created\_at DATETIME DEFAULT CURRENT\_TIMESTAMP,  
    -- FIS-07: catálogos cerrados como CHECK (la lógica sola no basta; el motor re-valida en INSERT)
    CHECK (document\_type IN ('NV','NV\_RETURN','01','03','07','08','12')),
    CHECK (sunat\_status IN ('PENDING','PROCESSING','ACCEPTED','REJECTED','QUARANTINED','DEADLINE\_EXCEEDED','DLQ\_REQUIRES\_INTERVENTION','NOT\_APPLICABLE')),
    CHECK (void\_status IN ('NONE','VOID\_PENDING\_RC','VOIDED')),
    FOREIGN KEY (branch\_id) REFERENCES branches(id),  
    FOREIGN KEY (cash\_register\_session\_id) REFERENCES cash\_register\_sessions(id),  
    -- DAT-07: FK compuesta multi-tenant (uq_customers_tenant_id) — NULL para venta anónima (LPDP)
    FOREIGN KEY (tenant\_id, customer\_id) REFERENCES customers(tenant\_id, id)  
);  
-- SYN-03: folio único por (tenant, branch, tipo, serie) — SUNAT emite series por ESTABLECIMIENTO; nunca por tenant global
CREATE UNIQUE INDEX idx\_sales\_series\_number ON sales(tenant\_id, branch\_id, document\_type, series, number);  
CREATE UNIQUE INDEX uq\_sales\_tenant\_id ON sales(tenant\_id, id);
CREATE INDEX idx\_sales\_must\_submit ON sales(tenant\_id, must\_submit\_by) WHERE must\_submit\_by IS NOT NULL AND sunat\_status IN ('PENDING','PROCESSING');
-- PERF-02/SYN-01: idempotencia física del sync offline (reemplaza al SELECT pre-tx; ON CONFLICT → ALREADY_SYNCED)
CREATE UNIQUE INDEX idx\_sales\_offline\_id ON sales(tenant\_id, offline\_client\_sale\_id) WHERE offline\_client\_sale\_id IS NOT NULL AND deleted\_at IS NULL;
-- PERF-10: walk FIFO de la cola fiscal por (estado, deadline) — el índice por tenant no sirve para ordenar el shard
CREATE INDEX idx\_sales\_fifo ON sales(sunat\_status, must\_submit\_by) WHERE must\_submit\_by IS NOT NULL;
-- PERF-09: barrido del cron de rollups por día Lima (cubre 01 y NV, no solo 03/07/08)
CREATE INDEX idx\_sales\_issued\_day ON sales(issued\_at\_lima) WHERE deleted\_at IS NULL;
-- DAT-07: consulta de NC/ND previas por origen (residual §8) y agrupación de RC por día Lima
CREATE INDEX idx\_sales\_referenced ON sales(tenant\_id, referenced\_sale\_id, document\_type) WHERE referenced\_sale\_id IS NOT NULL;

CREATE TABLE sunat\_daily\_summaries (  
    id TEXT PRIMARY KEY,  
    tenant\_id TEXT NOT NULL,  
    branch\_id TEXT,  -- DAT-01: NULL — el RC es por EMISOR (FIS-03) y cubre varias sucursales; cada boleta línea conserva su branch
    summary\_date DATE NOT NULL, \-- día de emisión Lima de las boletas incluidas  
    status TEXT NOT NULL DEFAULT 'PENDING',  
    -- PENDING | PROCESSING | ACCEPTED | REJECTED | DLQ | DEADLINE_EXCEEDED
    must\_submit\_by DATETIME NOT NULL,  
    rc\_type TEXT NOT NULL DEFAULT 'PRIMARY',  -- PRIMARY | COMPLEMENTARY (SYN-11: boleta tardía del mismo summary_date)
    ticket\_count INTEGER NOT NULL DEFAULT 0,  
    sunat\_ticket TEXT,  
    cdr\_code TEXT,  
    cdr\_message TEXT,  
    created\_at DATETIME DEFAULT CURRENT\_TIMESTAMP,  
    submitted\_at DATETIME,  
    -- DAT-04: catálogo cerrado de estados
    CHECK (status IN ('PENDING','PROCESSING','ACCEPTED','REJECTED','DLQ','DEADLINE_EXCEEDED')),
    CHECK (rc\_type IN ('PRIMARY','COMPLEMENTARY'))
);  
-- Un solo RC PRIMARY por día por EMISOR (SUNAT); branch_id es atributo de las líneas, no clave del RC (FIS-03);
-- una RC COMPLEMENTARY del mismo día solo si la PRIMARY ya fue enviada y la boleta sigue dentro de must_submit_by (SYN-11).
CREATE UNIQUE INDEX idx\_daily\_summary\_day ON sunat\_daily\_summaries(tenant\_id, summary\_date, rc\_type);

CREATE TABLE sale\_items (  
    id TEXT PRIMARY KEY,  
    tenant\_id TEXT NOT NULL,  
    sale\_id TEXT NOT NULL,  
    product\_id TEXT,                    \-- COM-02: NULL solo para línea genérica is_uncatalogued=1 (regla 34b)
    product\_name TEXT NOT NULL,  
    product\_type TEXT NOT NULL DEFAULT 'physical',  
    quantity REAL NOT NULL,  
    unit\_price_cents INTEGER NOT NULL,  
    unit\_cost_cents INTEGER NOT NULL DEFAULT 0,  
    discount\_amount_cents INTEGER DEFAULT 0,  
    subtotal_cents INTEGER NOT NULL,  
    igv\_affectation\_code TEXT NOT NULL DEFAULT '10', \-- Catálogo 07 SUNAT  
    igv\_amount_cents INTEGER NOT NULL,  
    icbper\_amount_cents INTEGER DEFAULT 0,  
    total\_amount_cents INTEGER NOT NULL,  
    batch\_id TEXT,  
    seller\_id TEXT,                     \-- COM-07/regla 36: atribución de vendedor (comisiones)
    is\_uncatalogued INTEGER NOT NULL DEFAULT 0, \-- regla 34b: línea genérica sin catálogo
    -- COM-02: línea genérica NO puede tener product_id; catálogo SÍ debe tenerlo
    CHECK (is\_uncatalogued = 0 OR product\_id IS NULL),
    FOREIGN KEY (tenant\_id, sale\_id) REFERENCES sales(tenant\_id, id),  
    FOREIGN KEY (tenant\_id, seller\_id) REFERENCES users(tenant\_id, id)  
);
-- DAT-07: toda lectura de líneas por venta (rollup §9, recálculo impuestos §6)
CREATE INDEX idx\_sale\_items\_sale ON sale\_items(sale\_id);

CREATE TABLE sale\_payments (  
    id TEXT PRIMARY KEY,  
    tenant\_id TEXT NOT NULL,  
    sale\_id TEXT NOT NULL,  
    payment\_method\_id TEXT NOT NULL,  
    amount_cents INTEGER NOT NULL,  
    reference\_number TEXT,  
    FOREIGN KEY (tenant\_id, sale\_id) REFERENCES sales(tenant\_id, id),  
    FOREIGN KEY (tenant\_id, payment\_method\_id) REFERENCES payment\_methods(tenant\_id, id)  
);
-- PERF-09: Σ por método de pago en el cron de rollups
CREATE INDEX idx\_sale\_payments\_sale ON sale\_payments(sale\_id);
CREATE UNIQUE INDEX uq\_sale\_payments\_tenant\_id ON sale\_payments(tenant\_id, id);

\-- \===================================================================  
\-- LEDGER ECONÓMICO COMPLETO (CxP, CxC, Proveedores, Egresos de Caja)  
\-- \===================================================================

CREATE TABLE suppliers (  
    id TEXT PRIMARY KEY,  
    tenant\_id TEXT NOT NULL,  
    ruc TEXT,  
    business\_name TEXT NOT NULL,  
    contact\_name TEXT,  
    contact\_phone TEXT,  
    payment\_terms\_days INTEGER DEFAULT 0,  
    is\_active BOOLEAN NOT NULL DEFAULT TRUE,  
    deleted\_at DATETIME,  
    created\_at DATETIME DEFAULT CURRENT\_TIMESTAMP,  
    FOREIGN KEY (tenant\_id) REFERENCES tenants(id)  
);  
CREATE INDEX idx\_suppliers\_tenant ON suppliers(tenant\_id) WHERE deleted\_at IS NULL;

CREATE TABLE purchase\_orders (  
    id TEXT PRIMARY KEY,  
    tenant\_id TEXT NOT NULL,  
    branch\_id TEXT NOT NULL,  
    supplier\_id TEXT NOT NULL,  
    status TEXT NOT NULL DEFAULT 'DRAFT', \-- DRAFT, SENT, RECEIVED, CANCELED  
    total\_amount_cents INTEGER NOT NULL DEFAULT 0,  
    currency\_code TEXT NOT NULL DEFAULT 'PEN',  
    created\_by\_user\_id TEXT NOT NULL,  
    created\_at DATETIME DEFAULT CURRENT\_TIMESTAMP,  
    FOREIGN KEY (supplier\_id) REFERENCES suppliers(id),  
    FOREIGN KEY (branch\_id) REFERENCES branches(id)  
);

CREATE TABLE purchase\_order\_items (  
    id TEXT PRIMARY KEY,  
    purchase\_order\_id TEXT NOT NULL,  
    product\_id TEXT NOT NULL,  
    quantity\_ordered REAL NOT NULL,  
    quantity\_received REAL NOT NULL DEFAULT 0.0,  
    unit\_cost_cents INTEGER NOT NULL,  
    FOREIGN KEY (purchase\_order\_id) REFERENCES purchase\_orders(id)  
);

CREATE TABLE accounts\_payable (  
    id TEXT PRIMARY KEY,  
    tenant\_id TEXT NOT NULL,  
    supplier\_id TEXT NOT NULL,  
    purchase\_order\_id TEXT,  
    original\_amount_cents INTEGER NOT NULL,  
    balance\_due_cents INTEGER NOT NULL,  
    due\_date DATETIME NOT NULL,  
    status TEXT NOT NULL DEFAULT 'OPEN', \-- OPEN, PARTIALLY\_PAID, PAID, OVERDUE  
    created\_at DATETIME DEFAULT CURRENT\_TIMESTAMP,  
    FOREIGN KEY (supplier\_id) REFERENCES suppliers(id),  
    FOREIGN KEY (purchase\_order\_id) REFERENCES purchase\_orders(id)  
);  
CREATE INDEX idx\_ap\_status\_due ON accounts\_payable(tenant\_id, status, due\_date);

CREATE TABLE accounts\_payable\_payments (  
    id TEXT PRIMARY KEY,  
    accounts\_payable\_id TEXT NOT NULL,  
    amount_cents INTEGER NOT NULL,  
    payment\_method TEXT NOT NULL,  
    cash\_register\_session\_id TEXT,  
    paid\_at DATETIME DEFAULT CURRENT\_TIMESTAMP,  
    FOREIGN KEY (accounts\_payable\_id) REFERENCES accounts\_payable(id),  
    FOREIGN KEY (cash\_register\_session\_id) REFERENCES cash\_register\_sessions(id)  
);

CREATE TABLE accounts\_receivable (  
    id TEXT PRIMARY KEY,  
    tenant\_id TEXT NOT NULL,  
    customer\_id TEXT NOT NULL,  
    sale\_id TEXT NOT NULL,  
    original\_amount_cents INTEGER NOT NULL,  
    balance\_due_cents INTEGER NOT NULL,  
    due\_date DATETIME NOT NULL,  
    status TEXT NOT NULL DEFAULT 'OPEN', \-- OPEN, PARTIALLY\_PAID, PAID, OVERDUE  
    created\_at DATETIME DEFAULT CURRENT\_TIMESTAMP,  
    -- DAT-04: catálogo cerrado de estados CxC
    CHECK (status IN ('OPEN','PARTIALLY\_PAID','PAID','OVERDUE')),
    FOREIGN KEY (tenant\_id, customer\_id) REFERENCES customers(tenant\_id, id),  
    FOREIGN KEY (tenant\_id, sale\_id) REFERENCES sales(tenant\_id, id)  
);  
CREATE INDEX idx\_ar\_status\_due ON accounts\_receivable(tenant\_id, status, due\_date);

CREATE TABLE accounts\_receivable\_payments (  
    id TEXT PRIMARY KEY,  
    accounts\_receivable\_id TEXT NOT NULL,  
    amount_cents INTEGER NOT NULL,  
    payment\_method TEXT NOT NULL,  
    cash\_register\_session\_id TEXT,  
    collected\_by\_user\_id TEXT NOT NULL,  
    paid\_at DATETIME DEFAULT CURRENT\_TIMESTAMP,  
    FOREIGN KEY (accounts\_receivable\_id) REFERENCES accounts\_receivable(id),  
    FOREIGN KEY (cash\_register\_session\_id) REFERENCES cash\_register\_sessions(id)  
);

CREATE TABLE cash\_register\_expenses (  
    id TEXT PRIMARY KEY,  
    cash\_register\_session\_id TEXT NOT NULL,  
    tenant\_id TEXT NOT NULL,  
    branch\_id TEXT NOT NULL,  
    category TEXT NOT NULL, \-- 'SUPPLIES', 'TRANSPORT', 'OTHER'  
    accounts\_payable\_id TEXT,  
    amount_cents INTEGER NOT NULL CHECK (amount_cents \> 0),  
    description TEXT NOT NULL,  
    receipt\_r2\_key TEXT,  
    authorized\_by\_user\_id TEXT NOT NULL,  
    created\_at DATETIME DEFAULT CURRENT\_TIMESTAMP,  
    FOREIGN KEY (cash\_register\_session\_id) REFERENCES cash\_register\_sessions(id),  
    FOREIGN KEY (accounts\_payable\_id) REFERENCES accounts\_payable(id)  
);  
CREATE INDEX idx\_expenses\_session ON cash\_register\_expenses(cash\_register\_session\_id);

## **6\. Motor de Transacciones Explícitas D1 (processOfflineSaleAtomic) & Reconciliación Autoritativa (v8.0)**

### Contrato de atomicidad D1 (API vigente)

D1 no expone `db.transaction(callback)`. El patrón obligatorio es: (1) leer y validar con
`db.withSession('first-primary')`; (2) construir todos los `D1PreparedStatement` de escritura;
(3) ejecutar **una sola** `await db.batch(statements)`; (4) interpretar los resultados y emitir
el ack. `batch()` es la frontera atómica: si una sentencia falla, D1 aborta/revierte la secuencia.
No se permite ejecutar escrituras una por una ni llamar al REST API de D1.

`runD1AtomicPlan` es el adapter de composition root: `txn.prepare(...)` en el pseudocódigo solo
agrega statements al plan; no ejecuta I/O inmediato. Las lecturas del preflight usan una sesión
D1 separada y se inyectan como datos validados al plan; las llamadas `.first()`/`.all()` que
aparecen dentro del bloque son marcadores de esa etapa y no ejecutan lecturas durante el batch.
Los resultados del `batch()` se convierten en `SUCCESS`, `ALREADY_SYNCED` o un error de dominio.

Para condiciones que deben abortar el batch (stock, versión, cupo o serie), la migración crea
`atomic_guards` con `CHECK (ok = 1)`. La primera sentencia del batch inserta un guard calculado
desde el estado actual; una precondición falsa viola el `CHECK` y revierte toda la secuencia; la
última sentencia elimina el guard. El bloque de referencia siguiente es **pseudocódigo de
orquestación**, no un fragmento copiable: la implementación debe compilarlo a una lista de
statements y usar `db.batch()`.

```sql
CREATE TABLE atomic_guards (
    id TEXT PRIMARY KEY,
    ok INTEGER NOT NULL CHECK (ok = 1),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

// src/services/transactionEngine.ts  
import type { D1Database } from '@cloudflare/workers-types';

export class InsufficientStockError extends Error {  
  constructor(public productId: string, public requested: number, public available: number) {  
    super(\`Stock insuficiente para producto ${productId}: solicitado ${requested}, disponible ${available}\`);  
    this.name \= 'InsufficientStockError';  
  }  
}

export interface OfflinePaymentPayload {  
  paymentMethodId: string;  
  amount_cents: number;  
  isCredit?: boolean;                  // solo con payment method CREDIT; monto restante queda en CxC
  referenceNumber?: string;  
  // Captura offline de medio electrónico (regla 2 §5.4, edge 2B): 'API' si el
  // adquirente confirmó en línea; 'MANUAL' = el cajero verificó visualmente la app
  // del cliente sin red (persistido como MANUAL_ELECTRONIC_CAPTURE).
  captureStatus?: 'API' | 'MANUAL';  
}

export interface OfflineSaleItemPayload {  
  productId: string | null;             // NULL obligatorio cuando isUncatalogued=true
  saleItemId?: string;                  // obligatorio para NC/NV_RETURN parcial; origen server-side
  batchId?: string;  
  quantity: number;  
  discountAmountCents?: number;  
  igvAffectationCode?: string;          // hint; el servidor resuelve el catálogo fiscal del producto
  // Venta rápida sin catálogo (regla 34): el motor acepta manualPriceCents como
  // fuente de verdad y NO descuenta stock. Nunca coexiste con productId real.
  isUncatalogued?: boolean;  
  manualPriceCents?: number;  
  // SEC-02: el descuento/sobreprecio manual solo se acepta server-side; si supera
  // los umbrales de tenant_discount_policies requiere authorizationToken (regla 2/17).
  requiresAuth?: boolean;  
}

export interface OfflineSalePayload {  
  offlineSaleId: string;  
  issuedAt?: string;  
  branchId: string;  
  cashRegisterSessionId: string;  
  customerId?: string;  
  clientDocumentType: string;  
  clientDocumentNumber: string;  
  clientName: string;  
  clientEmail?: string;  
  clientPhone?: string;  
  clientAddress?: string;  
  clientProfileUpdatedAt?: string;  
  priceListId?: string;  
  documentType: 'NV' | 'NV_RETURN' | '01' | '03' | '07' | '08' | '12';  // SYN-12: NV_RETURN viaja por el canal offline
  referencedSaleId?: string;              // obligatorio para NC '07' / ND '08' / NV_RETURN (residual §8)
  creditNoteMotiveCode?: string;          // Catálogo 09 (NC) / 10 (ND)
  authorizationToken?: string;            // SEC-02/09: supervisor/Dueño para overrides sobre umbral
  series?: string;                       // hint de idempotencia; nunca se persiste sin resolver servidor/DO
  number?: number;                       // hint de idempotencia; nunca es folio autoritativo
  currency?: string;  
  sellerId?: string;                   // COM-07/regla 36: atribución de vendedor (badge/PIN, carrito)
  items: OfflineSaleItemPayload\[\];  
  payments: OfflinePaymentPayload\[\];  
}

function assertOfflineSaleShape(payload: OfflineSalePayload): void {
  if (!Array.isArray(payload.items) || payload.items.length === 0) throw new Error('SALE_ITEMS_REQUIRED');
  for (const item of payload.items) {
    if (!Number.isFinite(item.quantity) || !Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error('INVALID_QUANTITY');
    }
    if (item.discountAmountCents !== undefined &&
        (!Number.isFinite(item.discountAmountCents) || !Number.isInteger(item.discountAmountCents) || item.discountAmountCents < 0)) {
      throw new Error('INVALID_DISCOUNT_CENTS');
    }
    if (item.isUncatalogued &&
        (typeof item.manualPriceCents !== 'number' || !Number.isFinite(item.manualPriceCents) || !Number.isInteger(item.manualPriceCents) || item.manualPriceCents < 0)) {
      throw new Error('INVALID_MANUAL_PRICE_CENTS');
    }
    if (item.isUncatalogued !== (item.productId === null)) throw new Error('GENERIC_LINE_PRODUCT_MISMATCH');
  }
  for (const payment of payload.payments) {
    if (!Number.isFinite(payment.amount_cents) || !Number.isInteger(payment.amount_cents) || payment.amount_cents < 0) {
      throw new Error('INVALID_PAYMENT_CENTS');
    }
  }
}

async function assertTenantUserAndBranch(db: D1Database, tenantId: string, userId: string, branchId: string): Promise<void> {
  const user = await db.prepare(
    `SELECT id FROM users WHERE id = ? AND tenant_id = ? AND branch_id = ? AND is_active = 1 AND deleted_at IS NULL`
  ).bind(userId, tenantId, branchId).first();
  if (!user) throw new Error('FORBIDDEN_USER_BRANCH');
}

async function reserveServerFolio(
  tenantId: string,
  branchId: string,
  documentType: string,
  clientHint?: string
): Promise<{ series: string; number: number }> {
  // Implementado por el Series DO/lease server-side; `clientHint` solo selecciona una serie
  // habilitada. La respuesta se valida contra branch_document_series y el índice único de sales;
  // una colisión se reintenta como SERIES_MISMATCH, nunca se acepta el número del cliente.
  return seriesAuthority.reserve({ tenantId, branchId, documentType, clientHint });
}

async function resolveAndReserveBatch(
  txn: any,
  tenantId: string,
  branchId: string,
  productId: string | null,
  requestedBatchId: string | undefined,
  quantity: number,
  todayLima: string
): Promise<string | null> {
  if (!productId) return null;
  const batch = requestedBatchId
    ? await txn.prepare(
        `SELECT id, expiration_date, stock FROM inventory_batches
          WHERE id = ? AND tenant_id = ? AND branch_id = ? AND product_id = ? AND is_active = 1`
      ).bind(requestedBatchId, tenantId, branchId, productId).first<any>()
    : await txn.prepare(
        `SELECT id, expiration_date, stock FROM inventory_batches
          WHERE tenant_id = ? AND branch_id = ? AND product_id = ? AND is_active = 1
            AND (expiration_date IS NULL OR expiration_date >= date(?)) AND stock >= ?
          ORDER BY expiration_date IS NULL, expiration_date ASC LIMIT 1`
      ).bind(tenantId, branchId, productId, todayLima, quantity).first<any>();
  if (!batch) {
    const hasBatch = await txn.prepare(
      `SELECT 1 FROM inventory_batches WHERE tenant_id = ? AND branch_id = ? AND product_id = ? LIMIT 1`
    ).bind(tenantId, branchId, productId).first();
    if (!hasBatch) return null;
    throw new Error('INSUFFICIENT_BATCH');
  }
  if (batch.expiration_date && batch.expiration_date < todayLima.slice(0, 10)) throw new Error('EXPIRED_BATCH');
  const updated = await txn.prepare(
    `UPDATE inventory_batches SET stock = stock - ?
      WHERE id = ? AND tenant_id = ? AND branch_id = ? AND stock - ? >= 0`
  ).bind(quantity, batch.id, tenantId, branchId, quantity).run();
  if (updated.meta.changes !== 1) throw new Error('INSUFFICIENT_BATCH');
  return batch.id;
}

async function preloadCatalogForSale(
  db: D1Database,
  tenantId: string,
  branchId: string,
  items: OfflineSaleItemPayload[],
  priceListId?: string
) {
  const productIds = [...new Set(items.filter((item) => !item.isUncatalogued && item.productId).map((item) => item.productId as string))];
  const placeholders = productIds.map(() => '?').join(',') || "''";
  const statements = [
    db.prepare(`
      SELECT p.id, p.product_type, p.allow_negative_stock, p.price_cents, p.cost_cents,
             p.igv_affectation_code_default, COALESCE(bs.stock, 0) AS branch_stock,
             COALESCE(bs.pmp_unit_cost_cents, p.cost_cents) AS pmp_cost_cents
        FROM products p LEFT JOIN branch_product_stock bs
          ON bs.product_id = p.id AND bs.tenant_id = p.tenant_id AND bs.branch_id = ?
       WHERE p.tenant_id = ? AND p.id IN (${placeholders}) AND p.is_active = 1 AND p.deleted_at IS NULL`
    ).bind(branchId, tenantId, ...productIds),
    db.prepare(`SELECT price_list_id, product_id, price_cents FROM product_prices
                 WHERE tenant_id = ? AND price_list_id = ? AND product_id IN (${placeholders})`).bind(tenantId, priceListId ?? '', ...productIds),
    db.prepare(`SELECT pt.product_id, t.code, t.rate_percentage, t.is_flat_fee, t.flat_fee_amount_cents
                  FROM product_taxes pt JOIN taxes t ON t.id = pt.tax_id AND t.tenant_id = pt.tenant_id
                 WHERE pt.tenant_id = ? AND pt.product_id IN (${placeholders}) AND t.is_active = 1`).bind(tenantId, ...productIds),
    db.prepare(`SELECT rate_percentage FROM taxes WHERE tenant_id = ? AND code = '1000' AND is_active = 1
                 ORDER BY created_at DESC LIMIT 1`).bind(tenantId)
  ];
  const [products, prices, taxes, defaultTax] = await db.batch(statements);
  return {
    products: new Map(products.results.map((row: any) => [row.id, row])),
    prices: new Map(prices.results.map((row: any) => [`${row.price_list_id}:${row.product_id}`, row])),
    taxes: taxes.results.reduce((map: Map<string, any[]>, row: any) => {
      const current = map.get(row.product_id) ?? [];
      current.push(row); map.set(row.product_id, current); return map;
    }, new Map()),
    defaultIgvRate: defaultTax.results[0]?.rate_percentage ?? 18
  };
}

type ReferencedDocumentPayload = {
  documentType: '07' | '08' | 'NV_RETURN';
  referencedSaleId: string;
  creditNoteMotiveCode: string;
  branchId: string;
  items?: Array<{ saleItemId?: string; productId: string | null; quantity: number; isUncatalogued?: boolean; batchId?: string }>;
};

async function processReferencedDocumentAtomic(
  db: D1Database,
  tenantId: string,
  userId: string,
  payload: ReferencedDocumentPayload
) {
  if (!payload.referencedSaleId || !payload.creditNoteMotiveCode) throw new Error('REFERENCE_AND_MOTIVE_REQUIRED');
  const original = await db.prepare(
    `SELECT id, tenant_id, document_type, sunat_status, total_amount_cents
       FROM sales WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`
  ).bind(payload.referencedSaleId, tenantId).first<{ id: string; tenant_id: string; document_type: string; sunat_status: string; total_amount_cents: number }>();
  if (!original) throw new Error('REFERENCED_SALE_NOT_FOUND');
  if (payload.documentType === '07' && !['09'].includes(payload.creditNoteMotiveCode)) throw new Error('MOTIVE_09_REQUIRED');
  if (payload.documentType === '08' && !['10'].includes(payload.creditNoteMotiveCode)) throw new Error('MOTIVE_10_REQUIRED');
  if (payload.documentType === '08' && original.sunat_status !== 'ACCEPTED') throw new Error('FISCAL_CDR_REQUIRED');
  const noCdrTotalCancellation = payload.documentType === '07' &&
    ['REJECTED', 'QUARANTINED', 'DEADLINE_EXCEEDED'].includes(original.sunat_status);
  if (payload.documentType === '07' && original.sunat_status !== 'ACCEPTED' && !noCdrTotalCancellation) {
    throw new Error('FISCAL_CDR_REQUIRED');
  }
  if (noCdrTotalCancellation && payload.items?.length) throw new Error('E_A_REQUIRES_TOTAL_CANCELLATION');
  const creditTotal = noCdrTotalCancellation || !payload.items?.length
    ? original.total_amount_cents
    : await resolveReferencedCreditTotal(db, tenantId, original.id, payload.items);
  // E-A es únicamente anulación total, confirmada y auditable; no convierte el origen en
  // ACCEPTED. El batch actualiza residual, documento referenciado, stock/CxC, audit, usage y
  // outbox fiscal de forma indivisible. La respuesta solo se emite después del batch exitoso.
  const referencedDocumentId = crypto.randomUUID();
  return runD1AtomicPlan(db, async (txn) => {
    await txn.prepare(
      `INSERT INTO sales (id, tenant_id, branch_id, user_id, document_type, referenced_sale_id,
         credit_note_motive_code, total_amount_cents, sunat_status, void_status, issued_at_lima)
       SELECT ?, tenant_id, branch_id, ?, ?, id, ?, ?, 'PENDING', 'NONE', CURRENT_TIMESTAMP
         FROM sales WHERE id = ? AND tenant_id = ?`
    ).bind(referencedDocumentId, userId, payload.documentType, payload.creditNoteMotiveCode,
      creditTotal, original.id, tenantId).run();
    await txn.prepare(
      `INSERT INTO audit_events (id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id, payload_json, prev_hash, row_hash)
       SELECT ?, tenant_id, branch_id, ?, ?, 'sale', id, ?, ?, ?
         FROM sales WHERE id = ? AND tenant_id = ?`
    ).bind(crypto.randomUUID(), userId, noCdrTotalCancellation ? 'CREDIT_NOTE_NO_CDR' : 'CREDIT_NOTE',
      JSON.stringify({ sourceStatus: original.sunat_status, total: noCdrTotalCancellation }), await previousAuditHash(txn, tenantId),
      await computeAuditHash({ action: noCdrTotalCancellation ? 'CREDIT_NOTE_NO_CDR' : 'CREDIT_NOTE', entity_id: original.id }),
      original.id, tenantId).run();
    for (const item of payload.items ?? []) {
      if (item.isUncatalogued) continue;
      await txn.prepare(
        `UPDATE inventory_batches SET stock = stock + ?
          WHERE id = ? AND tenant_id = ? AND branch_id = ? AND is_active = 1`
      ).bind(item.quantity, item.batchId, tenantId, payload.branchId).run();
      await txn.prepare(
        `INSERT INTO inventory_movements (id, tenant_id, branch_id, product_id, batch_id,
           movement_type, quantity_delta, unit_cost_cents, user_id, reference_id)
         SELECT ?, tenant_id, ?, product_id, ?, 'DEVOLUCION_NC', ?, unit_cost_cents, ?, ?
           FROM sale_items WHERE id = ? AND tenant_id = ?`
      ).bind(crypto.randomUUID(), payload.branchId, item.batchId, item.quantity, userId,
        original.id, item.productId, tenantId).run();
    }
    await txn.prepare(
      `UPDATE accounts_receivable SET balance_due_cents = MAX(0, balance_due_cents - ?),
         status = CASE WHEN balance_due_cents - ? <= 0 THEN 'PAID' ELSE 'PARTIALLY_PAID' END
       WHERE sale_id = ? AND tenant_id = ? AND balance_due_cents > 0`
     ).bind(creditTotal, creditTotal, original.id, tenantId).run();
    const usageInsert = await txn.prepare(
      `INSERT INTO usage_events (id, tenant_id, usage_key, period_ym, document_id)
       VALUES (?, ?, ?, strftime('%Y-%m', 'now'), ?)
       ON CONFLICT (tenant_id, usage_key) DO NOTHING`
    ).bind(crypto.randomUUID(), tenantId, `usage:${referencedDocumentId}`, referencedDocumentId).run();
    if (usageInsert.meta.changes === 1) {
      await txn.prepare(
        `INSERT INTO usage_counters (tenant_id, period_ym, doc_count, updated_at)
         VALUES (?, strftime('%Y-%m', 'now'), 1, CURRENT_TIMESTAMP)
         ON CONFLICT (tenant_id, period_ym) DO UPDATE SET doc_count = doc_count + 1,
           updated_at = CURRENT_TIMESTAMP`
      ).bind(tenantId).run();
    }
    await txn.prepare(
      `INSERT INTO fiscal_outbox (id, tenant_id, sale_id, status, must_submit_by)
       VALUES (?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)`
    ).bind(crypto.randomUUID(), tenantId, referencedDocumentId).run();
     return { status: 'SUCCESS', referencedSaleId: original.id, totalAmountCents: creditTotal, auditRequired: noCdrTotalCancellation };
  });
}

async function resolveReferencedCreditTotal(
  db: D1Database,
  tenantId: string,
  originalSaleId: string,
  items: Array<{ saleItemId?: string; quantity: number }>
): Promise<number> {
  let total = 0;
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new Error('INVALID_RETURN_QUANTITY');
    if (!item.saleItemId) throw new Error('RETURN_ITEM_REFERENCE_REQUIRED');
    const row = await db.prepare(
      `SELECT total_amount_cents, quantity FROM sale_items
        WHERE id = ? AND sale_id = ? AND tenant_id = ? AND is_uncatalogued IN (0, 1)`
    ).bind(item.saleItemId, originalSaleId, tenantId).first<{ total_amount_cents: number; quantity: number }>();
    if (!row || item.quantity > row.quantity) throw new Error('RETURN_QUANTITY_EXCEEDS_ORIGINAL');
    total += Math.round(row.total_amount_cents * item.quantity / row.quantity);
  }
  return total;
}

async function verifyAuthorization(
  db: D1Database,
  tenantId: string,
  rawToken: string
): Promise<{ authorizationId: string; approvedBy: string } | null> {
  const tokenHash = await argon2idHash(rawToken);
  const row = await db.prepare(
    `SELECT id, token_hash, expires_at, used_at, approved_by_user_id
       FROM authorization_tokens
      WHERE tenant_id = ? AND token_hash = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP`
  ).bind(tenantId, tokenHash).first<{ id: string; token_hash: string; expires_at: string; used_at: string | null; approved_by_user_id: string }>();
  if (!row || !(await argon2idVerify(rawToken, row.token_hash))) return null;
  // El UPDATE used_at + audit se agregan al mismo plan db.batch() del cobro;
  // nunca se consume un token en una escritura separada de la venta.
  return { authorizationId: row.id, approvedBy: row.approved_by_user_id };
}

async function computeAuditHash(event: Record<string, unknown>): Promise<string> {
  const canonical = JSON.stringify(event, Object.keys(event).sort());
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function previousAuditHash(txn: any, tenantId: string): Promise<string | null> {
  const row = await txn.prepare(
    `SELECT row_hash FROM audit_events WHERE tenant_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`
  ).bind(tenantId).first<{ row_hash: string }>();
  return row?.row_hash ?? null;
}

export async function processOfflineSaleAtomic(  
  db: D1Database,  
  tenantId: string,  
  userId: string,  
  payload: OfflineSalePayload  
) {  
  // 0. Zero-Trust fiscal y financiero (validación ejecutable, no solo comentario):
  //    - identidad local obligatoria; JWT/tenant no sustituyen la fila users activa.
  //    - document_type ∈ enabled_document_types ∩ matriz §5.1; régimen×modo se valida en D1.
  //    - 01 ⇒ RUC tipo 6 válido; 03 >= 70000 ⇒ documento real + clientName; NRUS nunca 01.
  //    - cantidades y todos los *_cents son finitos, enteros y no negativos; quantity > 0.
  //    - isUncatalogued ⇒ productId === null y manualPriceCents válido; producto catalogado ⇒ productId != null.
  //    - payload.series/number son hints: el servidor/DO reserva el folio por branch en el batch.
  //    - 07/08/NV_RETURN salen por el handler de documento referenciado, nunca por el flujo de venta normal.
  assertOfflineSaleShape(payload);
  await assertTenantUserAndBranch(db, tenantId, userId, payload.branchId);
  // 1\. Idempotencia: respaldada por idx_sales_offline_id (PERF-02/SYN-01) — el SELECT pre-tx es
  //    optimización; la garantía real es el UNIQUE + ON CONFLICT / captura SQLITE_CONSTRAINT →
  //    {status:'ALREADY_SYNCED'} dentro de la tx.
  const existingSale \= await db.prepare(  
    \`SELECT id, total\_amount_cents, sunat\_status, created\_at FROM sales   
     WHERE tenant\_id \= ? AND offline\_client\_sale\_id \= ? AND deleted\_at IS NULL\`  
  ).bind(tenantId, payload.offlineSaleId).first\<{  
    id: string;  
    total\_amount_cents: number;  
    sunat\_status: string;  
    created\_at: string;  
  }\>();

  if (existingSale) {  
    const itemsTaxDetail \= await db.prepare(  
      \`SELECT product\_id, igv\_amount_cents, icbper\_amount_cents, total\_amount_cents FROM sale\_items WHERE sale\_id \= ?\`  
    ).bind(existingSale.id).all();

    return {  
      status: 'ALREADY\_SYNCED',  
      saleId: existingSale.id,  
      authoritativeTotalAmount: existingSale.total\_amount_cents,  
      authoritativeStatus: existingSale.sunat\_status,  
      authoritativeIssuedAt: existingSale.created\_at,  
      itemsTaxDetail: itemsTaxDetail.results,  
      reconciliationRequired: true  
    };  
  }

  if (['07', '08', 'NV_RETURN'].includes(payload.documentType)) {
    return processReferencedDocumentAtomic(db, tenantId, userId, payload);
  }

  // 2\. Plan atómico D1 (ACID Guarantee): el adapter compila el plan a db.batch([...]).  
  return await runD1AtomicPlan(db, async (txn) \=\> {  
    if (overrideAuthorization) {
      await txn.prepare(
        `UPDATE authorization_tokens SET used_at = CURRENT_TIMESTAMP
          WHERE id = ? AND tenant_id = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP`
      ).bind(overrideAuthorization.authorizationId, tenantId).run();
      await txn.prepare(
        `INSERT INTO audit_events (id, tenant_id, actor_user_id, action, entity_type, entity_id, payload_json, prev_hash, row_hash)
         VALUES (?, ?, ?, 'AUTHORIZATION_CONSUMED', 'authorization_token', ?, ?, ?, ?)`
      ).bind(crypto.randomUUID(), tenantId, userId, overrideAuthorization.authorizationId,
        JSON.stringify({ approved_by: overrideAuthorization.approvedBy }), await previousAuditHash(txn, tenantId),
        await computeAuditHash({ action: 'AUTHORIZATION_CONSUMED', entity_id: overrideAuthorization.authorizationId })).run();
    }
    // Validar Sesión de Caja  
    const session \= await txn.prepare(  
      \`SELECT id FROM cash\_register\_sessions   
       WHERE id \= ? AND tenant\_id \= ? AND branch\_id \= ? AND status \= 'OPEN'\`  
    ).bind(payload.cashRegisterSessionId, tenantId, payload.branchId).first();

    if (\!session) {  
      throw new Error('Invalid or closed cash register session');  
    }

    // Timestamps UTC-5
    // SYN-04/SEC-06: ventana de skew ÚNICA ±6h (Principio 7). Fuera de ventana → 422 explícito,
    // NUNCA re-fecha a now (movería summary_date/must_submit_by a un día fiscal falso). La única
    // re-fecha permitida es con audit_events TIMESTAMP_OVERRIDE + autorización supervisor.
    const clientTime \= payload.issuedAt ? new Date(payload.issuedAt).getTime() : Date.now();  
    const now \= Date.now();  
    const ISSUED_AT_SKEW_MS \= 6 \* 3600 \* 1000;  
    if (!Number.isFinite(clientTime)) throw new Error('INVALID_ISSUED_AT');
    if (now \- clientTime \> ISSUED_AT_SKEW_MS || clientTime \> now \+ ISSUED_AT_SKEW_MS) {  
      throw new Error('ISSUED_AT_SKEW_VIOLATION');  
    }  
    const validatedTimeMs \= clientTime;  
    const peruTimestamp \= new Date(validatedTimeMs \- 5 \* 3600 \* 1000).toISOString().replace('T', ' ').substring(0, 19);

    // Tipo de Cambio Servidor  
    const currency \= payload.currency || 'PEN';  
    let serverExchangeRate \= 1.0;  
    if (currency \!== 'PEN') {  
      const rateRow \= await txn.prepare(  
        \`SELECT rate FROM exchange\_rates   
         WHERE tenant\_id \= ? AND source\_currency \= ? AND target\_currency \= 'PEN'   
         AND effective\_date \<= date(?) ORDER BY effective\_date DESC LIMIT 1\`  
      ).bind(tenantId, currency, peruTimestamp.substring(0, 10)).first\<{ rate: number }\>();

      if (\!rateRow) {  
        throw new Error(\`Exchange rate missing for ${currency}\`);  
      }  
      serverExchangeRate \= rateRow.rate;  
    }
    const toPenCents \= (sourceCents: number) \=\> Math.round(sourceCents \* serverExchangeRate);

    const saleId \= crypto.randomUUID();  
    // Convención dinero (§5): todo monto en INTEGER cents. El cliente envía centavos.
    // IGV = subtotal_cents × tasa / 100; el resultado se redondea a centavo en el servidor
    // (Math.round), nunca toFixed/floats. El cobro NUNCA redondea por su cuenta.
    let calculatedTotalTaxable \= 0;
    let calculatedTotalExempt \= 0;
    let calculatedTotalDiscount \= 0;
    let calculatedTotalIgv \= 0;  
    let calculatedTotalIcbper \= 0;  
    let calculatedTotalCogs \= 0;  
    let calculatedTotalAmount \= 0;

    // CRM Customer Upsert — LWW por clientProfileUpdatedAt (Last-Write-Wins).
    // SYN-08: el LWW compara SIEMPRE en reloj de SERVIDOR — clientProfileUpdatedAt se
    // ajusta antes de comparar: serverAdjusted = clamp(deviceTs, serverNow ± 6h). Un
    // reloj de dispositivo adelantado dentro del skew jamás sobrescribe datos nuevos.
    // PERF-07: el upsert usa RETURNING id (D1/SQLite ≥3.35) para evitar el re-SELECT.
    // SEC-07/LPDP: una fila con pii_erased=1 o deleted_at NO NULL está anonimizada/borrada
    // → NO se re-materializa PII; el upsert se bloquea con LPDP_ERASE_BLOCK + alerta Admin.
    let finalCustomerId \= payload.customerId || null;  
    if (payload.clientDocumentNumber && payload.clientDocumentNumber \!== '00000000') {  
      const generatedCustId \= crypto.randomUUID();  
      const deviceTs \= new Date(payload.clientProfileUpdatedAt || new Date().toISOString()).getTime();  
      if (!Number.isFinite(deviceTs)) throw new Error('INVALID_PROFILE_TIMESTAMP');
      const serverNowMs \= Date.now();  
      const adjusted \= Math.min(Math.max(deviceTs, serverNowMs \- ISSUED_AT_SKEW_MS), serverNowMs + ISSUED_AT_SKEW_MS);  
      const profileTs \= new Date(adjusted).toISOString();  
      const erasedCheck \= await txn.prepare(  
        \`SELECT pii\_erased, deleted\_at FROM customers WHERE tenant\_id \= ? AND document\_type\_code \= ? AND document\_number \= ?\`  
      ).bind(tenantId, payload.clientDocumentType, payload.clientDocumentNumber).first\<{ pii\_erased: number; deleted\_at: string | null }\>();
      if (erasedCheck && (erasedCheck.pii\_erased === 1 || erasedCheck.deleted\_at \!== null)) {  
        await txn.prepare(\`  
          INSERT INTO audit\_events (id, tenant\_id, branch\_id, actor\_user\_id, action, entity\_type, entity\_id, payload\_json, created\_at)  
          VALUES (?, ?, ?, ?, 'LPDP\_ERASE\_BLOCK', 'customer', ?, ?, ?)  
        \`).bind(crypto.randomUUID(), tenantId, payload.branchId, userId, erasedCheck.deleted\_at ? '' : payload.clientDocumentNumber, JSON.stringify({ documentNumber: payload.clientDocumentNumber }), peruTimestamp).run();  
        finalCustomerId \= null;  // venta SIN perfil: se guarda solo el snapshot fiscal del comprobante
      } else {  
        const upsertResult \= await txn.prepare(\`  
          INSERT INTO customers (id, tenant\_id, document\_type\_code, document\_number, name, email, phone, address, profile\_updated\_at, is\_active)  
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1\)  
          ON CONFLICT(tenant\_id, document\_type\_code, document\_number) WHERE deleted\_at IS NULL  
          DO UPDATE SET  
            name \= excluded.name,  
            email \= excluded.email,  
            phone \= excluded.phone,  
            address \= excluded.address,  
            profile\_updated\_at \= excluded.profile\_updated\_at,  
            is\_active \= 1  
          WHERE customers.profile\_updated\_at \<\= excluded.profile\_updated\_at  
          RETURNING id  
        \`).bind(generatedCustId, tenantId, payload.clientDocumentType, payload.clientDocumentNumber, payload.clientName, payload.clientEmail ?? null, payload.clientPhone ?? null, payload.clientAddress ?? null, profileTs).first\<{ id: string }\>();
        if (upsertResult) {
          finalCustomerId \= upsertResult.id;
        } else {
          const existingCustomer \= await txn.prepare(
            `SELECT id FROM customers WHERE tenant_id = ? AND document_type_code = ? AND document_number = ? AND deleted_at IS NULL`
          ).bind(tenantId, payload.clientDocumentType, payload.clientDocumentNumber).first<{ id: string }>();
          if (!existingCustomer) throw new Error('CUSTOMER_UPSERT_INCONSISTENT');
          finalCustomerId \= existingCustomer.id;
        }
      }  
    }
    // Nota: sales.client\_name / client\_document\_* son SNAPSHOT histórico del comprobante
    // (no se reescriben retroactivamente). El perfil VIVO vive en customers y es el único
    // que se actualiza con LWW arriba.

    // Pre-validar Stock y Calcular Impuestos
    // PERF-01 (regla dura): el hot path NO hace lecturas por ítem dentro del plan db.batch().
    // 1 SELECT batch: products JOIN product_prices LEFT JOIN product_taxes WHERE p.id IN (placeholders)  
    // para TODOS los ítems del payload (≤ 7 round-trips D1 totales por venta: idempotencia,
    // 1 batch de productos+precios+impuestos, upsert CRM, multi-row sale_items, stock,
    // INSERT sales, upsert cupo — SIN lecturas por ítem dentro del plan db.batch()).
    // SEC-02: el servidor re-valida CADA item:
    //   - discountAmount ≤ subtotal y ≤ max_*_without_auth (tenant_discount_policies) → else 422
  //     DISCOUNT_EXCEEDS_LIMIT (o AUTH_TOKEN_REQUIRED si no trae authorizationToken válido);
    //   - manualPriceCents dentro de max_amount_without_auth_cents salvo authz (venta rápida R34);
    //   - Σ payments == calculatedTotalAmount → else 422 PAYMENT_TOTAL_MISMATCH (tras el bucle de pagos).
  // tenantPolicies (tenant_discount_policies del tenant, cache 5-10s in-isolate) se carga FUERA
  // de la tx; authorizationToken se verifica server-side (argon2id, TTL 90s, single-use, regla 2).
  const overrideAuthorization = payload.authorizationToken
    ? await verifyAuthorization(db, tenantId, payload.authorizationToken)
    : null;
  const catalog = await preloadCatalogForSale(db, tenantId, payload.branchId, payload.items, payload.priceListId);
  for (const item of payload.items) {  
      // Venta rápida sin catálogo (regla 34, edge de integración 2A): no hay
      // producto en listas → el motor acepta manualPriceCents del cliente como
      // fuente de verdad (dentro del umbral sin authz, regla 2/17), aplica IGV
      // default del tenant, NO descuenta stock y NO registra inventory_movements.
      if (item.isUncatalogued) {  
        if (typeof item.manualPriceCents !== 'number' || item.manualPriceCents < 0) {  
          throw new Error('Uncatalogued line requires a valid manualPriceCents');  
        }  
        const manualPricePenCents \= toPenCents(item.manualPriceCents);
        const discountPenCents \= toPenCents(item.discountAmountCents ?? 0);
        if (manualPricePenCents \> tenantPolicies.max\_amount\_without\_auth\_cents && \!overrideAuthorization) {  
          throw new Error('AUTH\_TOKEN\_REQUIRED');  
        }  
        const itemSubtotal \= (item.quantity \* manualPricePenCents) \- discountPenCents;  
        if (itemSubtotal < 0) {  
          throw new Error('DISCOUNT_EXCEEDS_SUBTOTAL');  
        }  
        const igvRate = catalog.defaultIgvRate;
        const itemIgv = Math.round((itemSubtotal * igvRate) / 100);  
        const itemTotalAmount = itemSubtotal + itemIgv;  
        calculatedTotalTaxable += itemSubtotal;
        calculatedTotalDiscount += discountPenCents;
        calculatedTotalIgv += itemIgv;  
        calculatedTotalAmount += itemTotalAmount;  
        await txn.prepare(`  
          INSERT INTO sale_items (id, tenant_id, sale_id, product_id, product_name, product_type, quantity, unit_price_cents, unit_cost_cents, discount_amount_cents, subtotal_cents, igv_amount_cents, icbper_amount_cents, total_amount_cents, batch_id, seller_id, is_uncatalogued)  
          VALUES (?, ?, ?, NULL, 'Artículo sin catalogar', 'generic', ?, ?, 0, ?, ?, ?, 0, ?, ?, 1)  
        `).bind(  
          crypto.randomUUID(), tenantId, saleId, item.quantity, manualPricePenCents,  
          discountPenCents, itemSubtotal, itemIgv, itemTotalAmount, payload.sellerId ?? null  
        ).run();  
        await txn.prepare(`  
          INSERT INTO audit_events (id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id, payload_json, prev_hash, row_hash, created_at)  
          VALUES (?, ?, ?, ?, 'GENERIC_LINE', 'sale_item', ?, ?, ?, ?, ?)  
        `).bind(crypto.randomUUID(), tenantId, payload.branchId, userId, saleId,
          JSON.stringify({ manualPriceCents: item.manualPriceCents, quantity: item.quantity }), await previousAuditHash(txn, tenantId),
          await computeAuditHash({ action: 'GENERIC_LINE', entity_id: saleId }), peruTimestamp).run();  
        continue;  
      }  

      const product = catalog.products.get(item.productId as string);

      if (\!product) throw new Error(\`Product not found: ${item.productId}\`);

      // SYN-06 (política de oversell offline): una venta ACEPTADA en caja jamás se pierde.
      // Si el sync descubre stock insuficiente, se COMMITEA con stock negativo TRANSITORIO
      // (flag OFFLINE_OVERSELL + audit_events) + alerta Modo Dueño; el conteo físico (regla 10)
      // es el punto de reconciliación. Solo se rechaza (422) si el producto no existe o el
      // tenant prohíbe negativo (allow_negative_stock). Nunca se abandona la venta entregada.
      if (product.product\_type \=== 'physical' && \!product.allow\_negative\_stock && product.branch_stock \< item.quantity) {  
        throw new InsufficientStockError(product.id, item.quantity, product.branch_stock);  
      }
      // SYN-05 (FEFO/lotes): para ítems con batchId el servidor RE-valida el lote en la tx:
      //   SELECT expiry_date, stock FROM inventory_batches WHERE id=? AND is_active=1
      //   → expiry < hoy ⇒ 422 EXPIRED_BATCH; UPDATE inventory_batches SET stock=stock-?
      //     WHERE id=? AND stock-?>=0 (0 filas ⇒ InsufficientBatchError);
      //   si el cliente NO propone lote, el servidor asigna FEFO (expiry más próxima, stock>0).
      //   Esto ancla el descuento a inventory_batches (no solo a products.stock agregado).

      let validatedUnitPrice \= toPenCents(product.price_cents);  
      if (payload.priceListId) {  
        const override = catalog.prices.get(`${payload.priceListId}:${item.productId}`);
        if (override) validatedUnitPrice \= toPenCents(override.price_cents);  
      }

      const taxesList = { results: catalog.taxes.get(item.productId as string) ?? [] };

      let itemIgv \= 0;
      let itemIgvAffectationCode \= product.igv\_affectation\_code\_default;
      let itemIcbper \= 0;  
       const discountCents \= toPenCents(item.discountAmountCents ?? 0);
       const itemSubtotal \= (item.quantity \* validatedUnitPrice) \- discountCents;
      // SEC-02: descuento que excede el subtotal o el umbral del tenant → 422 (o AUTH_TOKEN_REQUIRED).
      if (itemSubtotal < 0) {  
        throw new Error('DISCOUNT\_EXCEEDS\_SUBTOTAL');  
      }  
       if (discountCents \> tenantPolicies.max\_amount\_without\_auth\_cents && \!overrideAuthorization) {  
        throw new Error('AUTH\_TOKEN\_REQUIRED');  
      }

      for (const tax of taxesList.results) {  
        if (tax.code \=== '1000') itemIgv \= Math.round((itemSubtotal \* tax.rate\_percentage) / 100);  
        else if (tax.code \=== '7152' || tax.is\_flat\_fee) itemIcbper \= tax.flat\_fee\_amount_cents \* item.quantity;  
      }

      const itemTotalAmount \= itemSubtotal \+ itemIgv \+ itemIcbper;  
      const effectiveBatchId \= await resolveAndReserveBatch(txn, tenantId, payload.branchId, item.productId, item.batchId, item.quantity, peruTimestamp);
      const itemCogs \= product.pmp\_cost\_cents \* item.quantity;

      if (['20', '30', '31'].includes(itemIgvAffectationCode)) calculatedTotalExempt \+= itemSubtotal;
      else calculatedTotalTaxable \+= itemSubtotal;
      calculatedTotalDiscount \+= discountCents;
      calculatedTotalIgv \+= itemIgv;  
      calculatedTotalIcbper \+= itemIcbper;  
      calculatedTotalCogs \+= itemCogs;  
      calculatedTotalAmount \+= itemTotalAmount;

      await txn.prepare(\`  
        INSERT INTO sale\_items (id, tenant\_id, sale\_id, product\_id, product\_name, product\_type, quantity, unit\_price_cents, unit\_cost_cents, discount\_amount_cents, subtotal_cents, igv\_affectation\_code, igv\_amount_cents, icbper\_amount_cents, total\_amount_cents, batch\_id)  
        VALUES (?, ?, ?, ?, 'Producto POS', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)  
      \`).bind(  
        crypto.randomUUID(), tenantId, saleId, item.productId, product.product\_type,  
         item.quantity, validatedUnitPrice, product.pmp\_cost\_cents, discountCents,  
        itemSubtotal, itemIgvAffectationCode, itemIgv, itemIcbper, itemTotalAmount, effectiveBatchId  
      ).run();

      if (product.product\_type \=== 'service') continue;

      if (product.product\_type \=== 'physical' && product.allow\_negative\_stock && product.branch_stock < item.quantity) {
        await txn.prepare(
          `INSERT INTO audit_events (id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id, payload_json, prev_hash, row_hash)
           VALUES (?, ?, ?, ?, 'OFFLINE_OVERSELL', 'sale_item', ?, ?, ?, ?)`
        ).bind(crypto.randomUUID(), tenantId, payload.branchId, userId, saleId,
          JSON.stringify({ productId: item.productId, requested: item.quantity, available: product.branch_stock }), await previousAuditHash(txn, tenantId),
          await computeAuditHash({ action: 'OFFLINE_OVERSELL', entity_id: saleId })).run();
        // La alerta al Modo Dueño se publica post-commit; no bloquea la venta aceptada en caja.
      }

      const updateRes \= await txn.prepare(\`  
        UPDATE branch\_product\_stock
           SET stock \= stock \- ?, version \= version \+ 1, updated_at \= CURRENT_TIMESTAMP
         WHERE tenant\_id \= ? AND branch\_id \= ? AND product\_id \= ?
           AND (stock \- ? \>= 0 OR ? \= 1\)  
      \`).bind(item.quantity, tenantId, payload.branchId, item.productId, item.quantity, product.allow\_negative\_stock ? 1 : 0).run();

      if (updateRes.meta.changes \=== 0\) {  
        throw new InsufficientStockError(product.id, item.quantity, product.branch_stock);  
      }

      await txn.prepare(\`  
        INSERT INTO inventory\_movements (id, tenant\_id, branch\_id, product\_id, batch\_id, movement\_type, quantity\_delta, unit\_cost_cents, stock\_after, user\_id, reference\_id, created\_at)  
        VALUES (?, ?, ?, ?, ?, 'VENTA', ?, ?, (SELECT stock FROM branch\_product\_stock WHERE tenant\_id \= ? AND branch\_id \= ? AND product\_id \= ?), ?, ?, ?)  
      \`).bind(  
        crypto.randomUUID(), tenantId, payload.branchId, item.productId,  
        effectiveBatchId, \-item.quantity, product.pmp\_cost\_cents, tenantId, payload.branchId, item.productId, userId, saleId, peruTimestamp  
      ).run();  
    }

    for (const [paymentIndex, payment] of payload.payments.entries()) {
      const paymentMethod = await txn.prepare(
        `SELECT id, code FROM payment_methods WHERE id = ? AND tenant_id = ? AND is_active = 1`
      ).bind(payment.paymentMethodId, tenantId).first<{ id: string; code: string }>();
      if (!paymentMethod) throw new Error('PAYMENT_METHOD_NOT_FOUND');
      if (payment.isCredit && paymentMethod.code !== 'credit') throw new Error('CREDIT_METHOD_MISMATCH');
      const paymentAmountCents = toPenCents(payment.amount_cents);
      if (payment.isCredit) {
        if (!finalCustomerId) throw new Error('CREDIT_CUSTOMER_REQUIRED');
        const credit = await txn.prepare(
          `SELECT c.credit_limit_cents,
                  COALESCE((SELECT SUM(ar.balance_due_cents) FROM accounts_receivable ar
                    WHERE ar.customer_id = c.id AND ar.tenant_id = c.tenant_id AND ar.balance_due_cents > 0), 0) AS balance_due
             FROM customers c WHERE c.id = ? AND c.tenant_id = ? AND c.pii_erased = 0`
        ).bind(finalCustomerId, tenantId).first<{ credit_limit_cents: number; balance_due: number }>();
        if (!credit || credit.balance_due + paymentAmountCents > credit.credit_limit_cents) {
          throw new Error('CREDIT_LIMIT_EXCEEDED');
        }
      }
      const salePaymentId \= crypto.randomUUID();  
      await txn.prepare(\`  
        INSERT INTO sale\_payments (id, tenant\_id, sale\_id, payment\_method\_id, amount_cents, reference\_number)  
        VALUES (?, ?, ?, ?, ?, ?)  
      \`).bind(  
        salePaymentId, tenantId, saleId, payment.paymentMethodId, paymentAmountCents, payment.referenceNumber ?? null
      ).run();  
      // Captura offline (regla 2 §5.4, edge 2B): pago electrónico aceptado sin red
      // → MANUAL_ELECTRONIC_CAPTURE para que Modo Dueño sepa que NO fue conciliado por API.
      // DAT-11: se REUSA el id de sale_payments (nunca un UUID nuevo → FK huérfana).
      if (payment.captureStatus === 'MANUAL') {  
        await txn.prepare(\`  
          INSERT INTO payment\_captures (id, tenant\_id, sale\_id, sale\_payment\_id, acquirer, acquirer\_ref, status, amount_cents, idempotency\_key, created\_at)  
          VALUES (?, ?, ?, ?, ?, ?, 'MANUAL\_ELECTRONIC\_CAPTURE', ?, ?, ?)  
        \`).bind(  
          crypto.randomUUID(), tenantId, saleId, salePaymentId, 'manual', payment.referenceNumber ?? null, paymentAmountCents, `${payload.offlineSaleId}:${paymentIndex}:${payment.paymentMethodId}`, peruTimestamp
        ).run();  
      }  
      // DAT-05: pago a crédito → CxC en la MISMA tx (regla 21). El cliente marca `isCredit` solo
      // en NV y CPE con método 'crédito' (§4.2); el servidor re-valida contra payment_methods
      // en producción (regla 2). due_date = política de crédito del tenant (default +30d).
      if (payment.isCredit) {  
        await txn.prepare(\`  
          INSERT INTO accounts\_receivable (id, tenant\_id, customer\_id, sale\_id, original\_amount_cents, balance\_due_cents, due\_date, status, created\_at)  
          VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)  
        \`).bind(  
          crypto.randomUUID(), tenantId, finalCustomerId, saleId, paymentAmountCents, paymentAmountCents, addDays(peruTimestamp, tenantCreditPolicyDays), peruTimestamp
        ).run();  
      }  
    }

    // SEC-02: reconciliación de pagos — Σ amount_cents DEBE igualar calculatedTotalAmount
    // (un pago que no suma el total no crea CxC silenciosa: o hay crédito declarado o es 422).
    const sumPayments \= payload.payments.reduce((acc, p) \=\> acc + toPenCents(p.amount_cents), 0);  
    if (sumPayments \!== calculatedTotalAmount) {  
      throw new Error('PAYMENT\_TOTAL\_MISMATCH');  
    }

    // FIS-02/DAT-02: estado SUNAT y deadline por tipo de documento.
    // NV / NV_RETURN → sin fiscalidad (NOT_APPLICABLE, must_submit_by = null);
    // CPE '01' → PENDING + must_submit_by = issued_date_lima + 3d (fin día Lima);
    // CPE '03' → PENDING + must_submit_by = issued_date_lima + 7d (fin día Lima); se encola a RC.
    // SEC-05/SYN-02: el correlativo lo EMITE el servidor (branch_document_series / DO de serie)
    // en esta tx; si el folio propuesto colisiona → 409 SERIES_MISMATCH, nunca se persiste verbatim.
    const isCpe \= payload.documentType !== 'NV' && payload.documentType !== 'NV_RETURN';  
    const sunatStatus \= isCpe ? 'PENDING' : 'NOT_APPLICABLE';  
    const mustSubmitBy \= isCpe ? computeMustSubmitBy(peruTimestamp, payload.documentType) : null;  
    const authoritativeFolio \= await reserveServerFolio(tenantId, payload.branchId, payload.documentType, payload.series);

    await txn.prepare(\`  
      INSERT INTO sales (id, tenant\_id, branch\_id, cash\_register\_session\_id, user\_id, customer\_id, offline\_client\_sale\_id, client\_document\_type, client\_document\_number, client\_name, document\_type, series, number, referenced\_sale\_id, credit\_note\_motive\_code, currency, exchange\_rate, total\_taxable_cents, total\_exempt_cents, total\_igv_cents, total\_icbper_cents, total\_discount_cents, total\_cogs_cents, total\_amount_cents, sunat\_status, issued\_at\_lima, must\_submit\_by, void\_status, created\_at)  
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NONE', ?)  
    \`).bind(  
      saleId, tenantId, payload.branchId, payload.cashRegisterSessionId, userId,  
      finalCustomerId, payload.offlineSaleId, payload.clientDocumentType,  
      payload.clientDocumentNumber, payload.clientName, payload.documentType,  
      authoritativeFolio.series, authoritativeFolio.number, null, null, currency, serverExchangeRate,  
      calculatedTotalTaxable, calculatedTotalExempt, calculatedTotalIgv, calculatedTotalIcbper, calculatedTotalDiscount,
      calculatedTotalCogs, calculatedTotalAmount, sunatStatus, peruTimestamp,  
      mustSubmitBy, peruTimestamp  
    ).run();

    if (isCpe) {
      await txn.prepare(
        `INSERT INTO fiscal_outbox (id, tenant_id, sale_id, status, next_attempt_at)
         VALUES (?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)`
      ).bind(crypto.randomUUID(), tenantId, saleId).run();
    }

    // PERF-10/PERF-08: cupo por documento emitido (§4.1) en la MISMA tx, idempotente por venta
    // (reusa la semántica de sale_idempotency_key — la re-entrega no doble-cuenta).
    // PERF-08: TODOS los tipos cuentan cupo, incluidos NV/NV_RETURN (tabla §4.1); la
    // idempotencia física viene del UNIQUE idx_sales_offline_id (PERF-02/SYN-01), no del SELECT.
    const usageInsert \= await txn.prepare(
      `INSERT INTO usage_events (id, tenant_id, usage_key, period_ym, document_id)
       VALUES (?, ?, ?, ?, ?) ON CONFLICT (tenant_id, usage_key) DO NOTHING`
    ).bind(crypto.randomUUID(), tenantId, `usage:${saleId}`, peruTimestamp.slice(0, 7), saleId).run();
    if (usageInsert.meta.changes === 1) {
      await txn.prepare(\`
        INSERT INTO usage\_counters (tenant\_id, period\_ym, doc\_count, updated\_at)
        VALUES (?, ?, 1, ?)
        ON CONFLICT (tenant\_id, period\_ym) DO UPDATE SET doc\_count \= doc\_count + 1
      \`).bind(tenantId, peruTimestamp.slice(0, 7), peruTimestamp).run();
    }

    return { status: 'SUCCESS', saleId, totalAmountCents: calculatedTotalAmount };  
  });  
}

## **7\. Chunked Sync Dispatcher (Service Worker Client-Side)**

// src/client/sync/chunkedSyncDispatcher.ts  
const CHUNK\_SIZE \= 30;

// Sin dedup semántico client-side de perfiles CRM: la consolidación de perfiles es del servidor
// (upsert idempotente ON CONFLICT ... DO UPDATE, LWW por clientProfileUpdatedAt —
// ver §6 processOfflineSaleAtomic). ÚNICA excepción single-writer (SYN-11 enmendada, v9):
// antes de fraccionar, un pre-proceso consolida los snapshots del MISMO cliente nuevo
// (local_client_id) generados en el mismo turno — el último perfil gana y se envía una sola
// escritura de cliente; el servidor sigue siendo la autoridad final con LWW por profile_updated_at.
// El cliente envía cada venta tal cual, en orden FIFO de la cola offline; cada venta lleva el snapshot del perfil.
//
// §7.1 — Contrato del endpoint de batch (SYN-07):
//   POST /v1/sync/sales  body { sales: OfflineSalePayload[] }
//   response { results: [{ offlineSaleId, status: 'SUCCESS'|'ALREADY_SYNCED'|'FAILED', code }] }
//   El servidor procesa el chunk con ack POR-VENTA: un 422 en una venta NO tumba el resto
//   (partial failure). El dispatcher:
//     - borra de IndexedDB solo ventas con status SUCCESS | ALREADY_SYNCED;
//     - re-encola SOLO las FAILED;
//     - backoff exponencial + jitter entre chunks y checkpoint del último ack para reanudar.
export async function dispatchPendingSalesChunked(  
  pendingSales: OfflineSalePayload\[\],  
  syncEndpoint: string,
  bearerToken: string,
  indexDb: { del(key: string): Promise<void>; mark(key: string, status: 'RETRY'): Promise<void> }
) {  
  const chunks \= chunkArray(pendingSales, CHUNK\_SIZE);  
  const report \= { total: pendingSales.length, succeeded: 0, failed: 0 };
  const BACKOFF\_BASE\_MS \= 500;
  const MAX\_ATTEMPTS \= 5;

  for (let i \= 0; i < chunks.length; i++) {  
    const chunk \= chunks[i];  
    let attempt \= 0;  
    while (true) {  
      try {  
        const res \= await fetch(syncEndpoint, {  
          method: 'POST',  
           headers: {
             'content-type': 'application/json',
             Authorization: `Bearer ${bearerToken}`
           },  
          body: JSON.stringify({ sales: chunk })  
        });  
        if (res.ok) {  
          const { results } \= await res.json();  
          for (const r of results) {  
            if (r.status \=== 'SUCCESS' || r.status \=== 'ALREADY\_SYNCED') {  
              report.succeeded++;  
              await indexDb.del(\`offline/${r.offlineSaleId}\`);  
            } else {  
              report.failed++;  
              await indexDb.mark(\`offline/${r.offlineSaleId}\`, 'RETRY');  
            }  
          }  
          break;  
        } else {  
          // 5xx/429: chunk entero a reintento con backoff; no se descarta nada.
           if (attempt \>= MAX\_ATTEMPTS) {
             report.failed \+= chunk.length;
             for (const sale of chunk) await indexDb.mark(`offline/${sale.offlineSaleId}`, 'RETRY');
             break;
           }
          await sleep(BACKOFF\_BASE\_MS \* 2 \*\* attempt \+ Math.random() \* 100);  
          attempt++;  
          continue;  
        }  
      } catch (err) {  
        // Red física: backoff y reanudación desde el último checkpoint (resume).
         if (attempt \>= MAX\_ATTEMPTS) {  
          report.failed \+= chunk.length;  
          for (const sale of chunk) await indexDb.mark(`offline/${sale.offlineSaleId}`, 'RETRY');
          break;  
        }  
        await sleep(BACKOFF\_BASE\_MS \* 2 \*\* attempt \+ Math.random() \* 100);  
        attempt++;  
      }  
    }  
  }

  return report;  
}

function chunkArray\<T\>(arr: T\[\], size: number): T\[\]\[\] {  
  return Array.from({ length: Math.ceil(arr.length / size) }, (\_, i) \=\> arr.slice(i \* size, (i \+ 1\) \* size));  
}

### **7.5 Motor de Descarga Computacional — Client-Side Offloading (v8.2)**

Principio 11. Objetivo: Edge CPU ≈ 0 para render; POS usable en 3G/sierra; bundle mínimo.

**Regla zero-dependency:** cero paquetes npm de **runtime** para PDF/QR/impresión. Reed-Solomon del QR **no** se reimplementa ad hoc: se **vendoriza** (~3 KB) con copia fijada en el repo + hash en CI, **o** (preferido en térmica) comando ESC/POS nativo `GS ( k` para que la impresora dibuje el QR. Canvas/`OffscreenCanvas` = pantalla y representación A4.

#### A. Hilos

| Hilo | Responsabilidad |
|---|---|
| **UI (SvelteKit)** | Layout de cobro; `window.print()` + `@media print` (HTML/CSS, sin pdfmake); recibe `ImageBitmap` del Worker; Vitrina vía `BroadcastChannel` (mismo origen) |
| **Web Worker** | `OffscreenCanvas` → QR raster; compilador ESC/POS → `Uint8Array`; chunking + des-duplicación de escrituras de la COLA (mismo job no se re-escribe) — **nunca** dedup semántico de CRM/ventas, con la única excepción single-writer: consolidar snapshots del **mismo** cliente nuevo (`local_client_id`) dentro del mismo turno para una sola escritura (SYN-11 enmendada; el servidor mantiene la autoridad con LWW por `profile_updated_at` §6); cola de print outbox (persistida en IndexedDB) |

Imprimir **nunca** está dentro del `db.batch()` de la venta: la venta hace commit; el ticket entra a la **print outbox** con reintento.

**Print outbox persistida (obligatorio, IndexedDB):** la memoria del Web Worker es volátil — si la impresora se atasca y el cajero recarga la pestaña (F5), el Worker se destruye y un ticket solo en memoria se pierde. La outbox vive en **IndexedDB** (misma familia de store del offline queue), no en memoria:

- Clave `print_jobs/{saleId}`; guarda el **payload del ticket** (para recompilar) + bytes ESC/POS ya compilados + adaptador fallback pendiente.
- Estados `PENDING → PRINTED / FAILED`; se consume (borra) **solo tras ACK del adaptador** en `PrinterTransport`.
- Sobrevive a F5/Worker reload; el botón "Reimprimir" (ver B) lee de IndexedDB, no de memoria; si los bytes se perdieron, se **recompilan** desde el payload.
- Entra al **guardián de cuota** (≥80% alerta; bloqueo seguro al 100%) — nunca corrompe la cola por `QuotaExceededError`.

#### B. `PrinterTransport` — escalera de failback

Orden determinista: **WebUSB** → **WSS LAN** (host configurado y validado por pairing; solo `wss:`) → **Web Bluetooth** → **`window.print()` / SystemPrint** → PDF/QR por `MessagingSender` (WhatsApp).

- Pre-flight de permisos al **abrir caja**, no en la primera venta.
- Si WebUSB/WSS falla tras commit: UI muestra “Reimprimir” y avanza automáticamente al siguiente adaptador.

#### C. Contrato Worker (referencia)

```typescript
// src/client/workers/offloadWorker.ts
self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;
  if (type === 'COMPILE_ESC_POS') {
    const bytes = buildNativeEscPos(payload); // GS ( k para QR si térmica
    self.postMessage({ type: 'ESC_POS_READY', bytes }, [bytes.buffer]);
  }
  if (type === 'RASTER_QR') {
    const bitmap = await rasterQrOffscreen(payload.sunatQrPayload);
    self.postMessage({ type: 'QR_READY', bitmap }, [bitmap]);
  }
  if (type === 'PROCESS_OFFLINE_CHUNK') {
    const chunk = optimizePayload(payload.sales);
    self.postMessage({ type: 'CHUNK_READY', chunk });
  }
};
```

#### D. Presupuesto de bundle (CI gate)

| Métrica | Techo (inicial) |
|---|---|
| Bundle inicial POS (gzip) | Declarar en CI; PR falla si lo supera |
| Nueva dep npm runtime | Requiere ADR + justificación; default rechazado |

## **8\. Notas de Crédito / Débito, Baja de Boleta, Devolución NV & DLQ**

### Reglas de negocio

- **NC `07`:** solo si el comprobante origen tiene `sunat_status = ACCEPTED` (CDR). Motivo Catálogo 09. Permite **NC parcial** (ítems/cantidades ⊂ originales); el guard anti-doble es por monto residual: `sum(NC.total) ≤ original.total`. **Excepción de anulación sin CDR (edge E-A):** si el origen está `REJECTED`/`QUARANTINED`/`DEADLINE_EXCEEDED` (nunca fue aceptado), la NC de **anulación total** se permite **sin** exigir CDR, con motivo Catálogo 09 y `audit_events` `CREDIT_NOTE_NO_CDR` (estado origen + alerta Dueño); su XML viaja como corrección del original no aceptado. El 409 `FISCAL_CDR_REQUIRED` aplica solo a orígenes `PENDING`/`PROCESSING` (resultado SUNAT aún no resuelto) o `ACCEPTED` mal usado.
- **ND `08`:** motivos Catálogo 10; misma precondición CDR aceptada sobre el origen. La ND **no** aplica la excepción E-A (jamás se emite sin CDR: incrementa deuda). **Cupo (FIS-08/09):** la ND es un CPE → `doc_count + 1` en la misma tx (regla 3 §4.1) con `usage:ND:{id}`; **no** reembolsa el cupo del origen ni consume CxC. Si la ND corrige ICBPER de boletas con bolsas plásticas (código `7152`, `charges_icbper`), el delta positivo de `total_icbper_cents` viaja con motivo Catálogo 10.
- **Baja de boleta:** `void_status = VOID_PENDING_RC` → se informa en Resumen Diario del **mismo día de emisión**; no es NC. **Solo fiscal (edge E-C):** la baja **no** revierte stock ni caja — la venta subsiste (el cliente se lleva el producto y el dinero ya se contabilizó); solo invalida el comprobante. Si la RC del día ya se envió/aceptó, la baja ya no es posible: la anulación posterior se hace **vía NC** (nunca se re-voida). **Cupo (FIS-10):** la baja **no** consume cupo (la venta ya lo consumió al emitirse) — alineado con GTM §4.1 (no hay "segundo cobro").
- **Contrato UBL mínimo (FIS-12):** el XML que sale a SUNAT/OSE garantiza, por schema UBL 2.1 pre-firma (FASE 8 Sprint 26), los elementos obligatorios: `cbc:UBLVersionID`, `cbc:CustomizationID` (factura `1.0` / boleta `1.1`), `cac:Signature/cac:SignatoryParty`, `cbc:ID` serie-número, `cac:AccountingSupplierParty` (RUC emisor), `cac:AccountingCustomerParty`, `cac:TaxTotal`, `cac:LegalMonetaryTotal`. Validación **antes** de firmar; un XML que no la pase va a DLQ `QUARANTINED` sin tocar el breaker (taxonomía §8.1).
- **Devolución NV:** documento `NV_RETURN` (o anulación append-only) — revierte stock/caja, `NOT_APPLICABLE`, sin SUNAT.
- **CxC / crédito:** permitido en NV y CPE; el tipo de pago “crédito” genera `accounts_receivable`. **Compensación de CxC en NC/devolución (edge E-D):** toda NC/NV_RETURN (regla 13) sobre una venta con saldo pendiente reduce `accounts_receivable.balance_due_cents` en la **misma tx** por el monto acreditado — total (cierra el saldo a cero) o parcial (prorratea por ítems/cantidades acreditadas). Si ya hubo abonos cobrados, el vuelto se entrega por el método del último abono o en efectivo, o se convierte en crédito de tienda (regla 20) cuando la política lo permite; **jamás** se ajusta CxC en silencio (`audit_events` con el asiento de compensación).
- **Upgrade de formalización mid-day:** permitido con sesión abierta; docs ya emitidos conservan tipo; nuevas ventas usan el nuevo default.
- **Gracia past_due:** caja y CPE siguen; costos OSE/PSE durante gracia los absorbe Atlas (política comercial).

// src/handlers/creditNoteHandler.ts — precondiciones (extracto)
// 1. originalSale.sunat_status === 'ACCEPTED' (else 409 FISCAL_CDR_REQUIRED).
//    EXCEPCIÓN E-A (anulación sin CDR): si el origen es REJECTED/QUARANTINED/DEADLINE_EXCEEDED
//    (jamás tuvo CDR), PERMITIR NC de anulación TOTAL sin exigir ACCEPTED — el 409 aplica solo a
//    PENDING/PROCESSING (resultado SUNAT sin resolver). audit CREDIT_NOTE_NO_CDR + alerta Dueño.
// 2. residual = original.total_amount_cents - sum(prior NC totals) >= requested credit total
// 3. motiveCode ∈ Catálogo 09
// 4. Restaurar stock solo de ítems/cantidades acreditadas; si el ítem es is_uncatalogued
//    (venta rápida R34/regla 13, edge E-B): NO restaurar stock ni refresh_avg_cost — la línea nunca descontó.
// 5. Si la venta tiene CxC (balance_due_cents > 0): reducir accounts_receivable en la MISMA tx (edge E-D).
// 6. Encolar: si origen es factura → envío unitario NC; si boleta → incluir en RC del día
// 7. Cupo (Arquitectura §4.1): la NC es un CPE → doc_count + 1 en la MISMA tx,
//    con idempotency usage:NC:{id}; el cupo consumido por la venta original NO se reembolsa.

app.post('/v1/sales/:id/credit-note', async (c) \=\> {  
  const originalSaleId \= c.req.param('id');  
  const tenant \= c.get('tenant');  
  const db \= c.get('db') as D1Database;  
  const user \= c.get('user');  
  const body \= await c.req.json\<{ motiveCode: string; items?: Array\<{ saleItemId: string; quantity: number }\> }\>();

  const originalSale \= await db.prepare(  
    \`SELECT \* FROM sales WHERE id \= ? AND tenant\_id \= ? AND deleted\_at IS NULL\`  
  ).bind(originalSaleId, tenant.id).first\<any\>();

  if (\!originalSale) return c.json({ error: 'Original sale not found' }, 404);  
  if (originalSale.document\_type \=== 'NV') {  
    return c.json({ error: 'Use NV_RETURN for internal sale returns', code: 'USE_NV_RETURN' }, 422);  
  }  
  // E-A (anulación sin CDR): solo se bloquea cuando el resultado SUNAT aún no está resuelto.  
  // Un CPE REJECTED/QUARANTINED/DEADLINE_EXCEEDED jamás tuvo CDR: su NC de anulación es válida sin él.  
  if (['PENDING', 'PROCESSING'].includes(originalSale.sunat\_status)) {  
    return c.json({ error: 'Credit note requires settled SUNAT status', code: 'FISCAL_CDR_REQUIRED' }, 409);  
  }  
  const noCdr \= originalSale.sunat\_status \!== 'ACCEPTED'; // true → NC de anulación TOTAL (E-A)

  // Residual parcial: sumar NC previas (document_type 07) y validar monto  
  const priorCredits \= await db.prepare(  
    \`SELECT COALESCE(SUM(total\_amount_cents),0) AS credited FROM sales  
     WHERE referenced\_sale\_id \= ? AND document\_type \= '07' AND tenant\_id \= ? AND deleted\_at IS NULL\`  
  ).bind(originalSaleId, tenant.id).first\<{ credited: number }\>();

  const result = await processReferencedDocumentAtomic(db, tenant.id, user.userId, {
    documentType: '07',
    referencedSaleId: originalSaleId,
    creditNoteMotiveCode: body.motiveCode,
    branchId: originalSale.branch_id,
    items: body.items?.map((item) => ({ ...item, productId: null }))
  });
  return c.json(result);
});

export default app;

### **8.1 Resiliencia del canal fiscal — FiscalTransport & Circuit Breaker (v8.2)**

**ADR-FISCAL-002 (canal):** no reabre reglas de ADR-FISCAL-001 (plazos, RC, 700/RUC, NC+CDR). Solo define **cómo** viaja el XML. **Frontera de contrato (R-01):** `FiscalTransport` consume **únicamente** los DTO normalizados `CPEInvoiceDTO` / `CPESummaryDTO` (comprobante fiscal ya resuelto por el motor, incl. hash/QR/leyendas) — **prohibido** que importe entidades retail de FASE 6B–6G (`inventory_*`, `sales_returns`, `orders_*`); el transporte es un puerto desacoplado y avanzable sin esperar la capa comercial de profundidad. Lo mismo aplica a `PrinterTransport` (§7.5): serializa DTO de impresión, nunca entidades de inventario/retornos.

| Adaptador `FiscalTransport` | Uso |
|---|---|
| `ATLAS_PSE_DIRECT` | **Default** — PSE Atlas envía directo a SUNAT (mínimo costo OSE) |
| `ose_*` | Enterprise / preferencia del tenant |
| `pse_third_party` | Plugin; requiere **suite de contrato** antes de enable |

#### Circuit Breaker (estado global correcto)

- Contador + estado + temporizador viven en un **Durable Object** por `(transport, endpoint)` — endpoints: `submit`, `cdr_query`, `rc_submit`. **No** un breaker global único.
- Estados: `closed → open → half-open`; probe vía `alarm()` del DO.
- Umbral ejemplo: 10 errores **5xx / timeout / red** en ventana → `open` ~2h; half-open prueba 1 request.

**Lectura del estado — caché de 2 niveles (anti thundering herd):**

1. **In-memory isolate (TTL 5-10s):** cada Worker cachea el flag `open` en su aislado; si sabe que el breaker está abierto, **rechaza/encola localmente sin tocar KV ni el DO**. Nunca sirve `closed` con stale ≥ TTL (sesgo fail-closed acotado).
2. **KV (eventual ~60s):** solo **cache de lectura** del flag `open`; **nunca** como contador.
3. **DO (autoritativo):** **nunca se consulta en el hot path de lectura**; solo recibe escrituras.

**Incrementos — sampling, no 1:1 por fallo:** en la primera ola de fallos (colapso SUNAT con miles de isolates), los Workers **no** incrementan el DO por cada request fallido: se agregan en el aislado y se envían coalescidos (1 incremento por ventana de ~5s, o factor de decimación). El DO serializa el conteo sin ser re-bombardeado; el jitter/backoff de la taxonomía evita reintentos en ráfaga.

#### Taxonomía de errores (obligatoria)

| Clase | Ejemplo | Acción |
|---|---|---|
| **Infra (abre breaker)** | HTTP 5xx, timeout, DNS, reset | Incrementa DO; backoff + jitter |
| **Negocio 4xx** | XML inválido, RUC malo, rechazo CDR de contenido | **No** abre breaker; documento → DLQ / `QUARANTINED` |
| **Deadline** | `must_submit_by` vencido | `DEADLINE_EXCEEDED`; alerta Dueño; no reintentar como si fuera 5xx |

#### Backpressure (anti inversión de deadline)

Cloudflare Queues = **disparador**, no fuente de verdad de prioridad.

1. XML firmado → **R2**; D1 guarda puntero + `must_submit_by` + `retry_count`.
2. Cron/scheduler: `SELECT … WHERE sunat_status IN ('PENDING','PROCESSING') ORDER BY must_submit_by ASC LIMIT N`.
3. Mensaje de cola = `{ saleId, r2Key }` (puntero), no el XML embebido.
4. Si `retry_count ≥ N` (venenoso): `QUARANTINED` + alerta; no bloquea la cabecera.
5. Si vence retención/plazo: estado `DEADLINE_EXCEEDED` en D1 (`sunat_dlq` / columna); panel Modo Dueño muestra **represados** y **cuarentena**.**Reversión (edge E-A):** un CPE en `REJECTED`/`QUARANTINED`/`DEADLINE_EXCEEDED` (jamás aceptado) puede anularse con NC sin CDR (§8) — el panel ofrece "Anular" con motivo Catálogo 09; no queda atrapado en la cola fiscal.

```sql
-- Extensión sugerida sales / sunat_outbox
-- r2_xml_key TEXT, quarantine_reason TEXT,
-- sunat_status incluye: QUARANTINED | DEADLINE_EXCEEDED | DLQ_REQUIRES_INTERVENTION
```

## **9\. Capa de Reportes — Daily Rollups en D1 + Analítica en AE (v8.1)**

**Regla de arquitectura:** la fuente de verdad de reportes es **`daily_financial_rollups` en D1** (exacta, no muestreada), escrita por un cron idempotente. Analytics Engine sigue siendo **solo dashboards** y **nunca factura** (consistente con §4.1: AE muestreado). Los reportes del cliente leen D1; los dashboards internos/globales leen AE.

```sql
-- Rollup diario por (tenant, branch, día Lima) — fuente de verdad de reportes.
CREATE TABLE daily_financial_rollups (
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    report_date DATE NOT NULL,          -- día de emisión Lima
    gross_sales_cents INTEGER NOT NULL DEFAULT 0,      -- Σ total_amount_cents (sin NC)
    net_sales_cents INTEGER NOT NULL DEFAULT 0,        -- ventas − NC/ND del día
    cogs_cents INTEGER NOT NULL DEFAULT 0,             -- Σ unit_cost_cents × qty (PMP)
    igv_cents INTEGER NOT NULL DEFAULT 0,
    icbper_cents INTEGER NOT NULL DEFAULT 0,
    discounts_cents INTEGER NOT NULL DEFAULT 0,
    doc_count INTEGER NOT NULL DEFAULT 0,
    cash_expected_cents INTEGER NOT NULL DEFAULT 0,    -- arqueo: opening + efectivo + ingresos − retiros − egresos
    cash_counted_cents INTEGER,
    cash_diff_cents INTEGER,
    payments_by_method TEXT NOT NULL DEFAULT '{}',     -- JSON {"EFECTIVO": 1200, "YAPE": 800}
    overage_docs INTEGER NOT NULL DEFAULT 0,           -- docs sobre cupo (§4.1)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, branch_id, report_date)
);

CREATE TABLE daily_product_rollups (
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    report_date DATE NOT NULL,
    product_id TEXT NOT NULL,
    qty REAL NOT NULL DEFAULT 0,
    gross_cents INTEGER NOT NULL DEFAULT 0,
    cogs_cents INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, branch_id, report_date, product_id)
);
```

**Cron (idempotente, paralelo por shard con `Promise.all`):** por cada shard D1 y cada `(tenant, branch, fecha Lima)` cerrado → `DELETE`+`INSERT` del rollup del día (o `UPSERT`). **Jamás** se leen reportes desde el hot path de venta; el rollup se calcula sobre `sales`/`sale_items`/`sale_payments`/`cash_register_cash_movements`/`cash_count_lines` ya ACID.

```typescript
// src/cron/dailyRollups.ts
// Cron: 3:00 AM hora Lima (UTC-5) — buildDailySummaryCron corre antes que el
// Morning Briefing (regla 33, 3:30 AM) y que la RC de boletas (fin de día Lima).
// `closedLimaWindow` devuelve límites ISO UTC equivalentes al día Lima cerrado y
// `reportDateLima` en YYYY-MM-DD; el SQL nunca interpreta el huso horario.
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const shards: string[] = JSON.parse(await env.TENANT_KV.get('active_shards') ?? '["D1_SHARD_01"]');
    await Promise.all(shards.map(async (shardKey) => {
      const db = env[shardKey] as D1Database;
      if (!db) return;
      const { startOfLimaDay, endOfLimaDay, reportDateLima } = closedLimaWindow(event.scheduledTime);
      const rows = await db.prepare(`
        WITH sales_day AS (
          SELECT s.tenant_id, s.branch_id,
                 SUM(CASE WHEN s.document_type IN ('07','08') THEN 0 ELSE s.total_amount_cents END) AS gross,
                 SUM(CASE WHEN s.document_type IN ('07','08') THEN -s.total_amount_cents ELSE s.total_amount_cents END) AS net,
                 SUM(s.total_igv_cents) AS igv,
                 SUM(s.total_icbper_cents) AS icbper,
                 SUM(s.total_discount_cents) AS discounts,
                 COUNT(*) AS doc_count
          FROM sales s
          WHERE s.issued_at_lima >= ? AND s.issued_at_lima < ? AND s.deleted_at IS NULL
          GROUP BY s.tenant_id, s.branch_id
        ),
        items_day AS (
          SELECT s.tenant_id, s.branch_id,
                  SUM(CASE WHEN s.document_type IN ('07','08') THEN -si.total_amount_cents ELSE si.total_amount_cents END) AS item_gross,
                  SUM(CASE WHEN s.document_type IN ('07','08') THEN -1 ELSE 1 END * si.unit_cost_cents * si.quantity) AS cogs
           FROM sales s
           JOIN sale_items si ON si.sale_id = s.id AND si.tenant_id = s.tenant_id
          WHERE s.issued_at_lima >= ? AND s.issued_at_lima < ? AND s.deleted_at IS NULL
          GROUP BY s.tenant_id, s.branch_id
        ),
        payment_totals AS (
          SELECT s.tenant_id, s.branch_id, sp.payment_method_id,
                 SUM(sp.amount_cents) AS amount_cents
          FROM sales s
          JOIN sale_payments sp ON sp.sale_id = s.id AND sp.tenant_id = s.tenant_id
          WHERE s.issued_at_lima >= ? AND s.issued_at_lima < ?
            AND s.deleted_at IS NULL
          GROUP BY s.tenant_id, s.branch_id, sp.payment_method_id
        ),
        payments_day AS (
          SELECT tenant_id, branch_id,
                 json_group_object(payment_method_id, amount_cents) AS payments_by_method
          FROM payment_totals
          GROUP BY tenant_id, branch_id
        )
        SELECT s.tenant_id, s.branch_id, s.gross, s.net, s.igv, s.icbper,
               s.discounts, s.doc_count, i.item_gross, i.cogs, p.payments_by_method
        FROM sales_day s
        LEFT JOIN items_day i USING (tenant_id, branch_id)
        LEFT JOIN payments_day p USING (tenant_id, branch_id)
      `).bind(
        startOfLimaDay, endOfLimaDay,
        startOfLimaDay, endOfLimaDay,
        startOfLimaDay, endOfLimaDay
      ).all();
      // PERF-09: cada fuente 1:N se pre-agrega antes del join final; así no se multiplican
      // gross/IGV por cantidad de líneas o pagos. El worker asocia reportDateLima calculado
      // con America/Lima y nunca usa date() UTC para decidir el día fiscal.
       for (const row of rows.results) {
         await db.prepare(`
           INSERT INTO daily_financial_rollups
             (tenant_id, branch_id, report_date, gross_sales_cents, net_sales_cents,
              igv_cents, icbper_cents, discounts_cents, doc_count, cogs_cents,
              payments_by_method, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT (tenant_id, branch_id, report_date) DO UPDATE SET
             gross_sales_cents = excluded.gross_sales_cents,
             net_sales_cents = excluded.net_sales_cents,
             igv_cents = excluded.igv_cents,
             icbper_cents = excluded.icbper_cents,
             discounts_cents = excluded.discounts_cents,
             doc_count = excluded.doc_count,
             cogs_cents = excluded.cogs_cents,
             payments_by_method = excluded.payments_by_method,
             created_at = CURRENT_TIMESTAMP
         `).bind(row.tenant_id, row.branch_id, reportDateLima, row.gross, row.net,
           row.igv, row.icbper, row.discounts, row.doc_count, row.cogs ?? 0,
           row.payments_by_method ?? '{}').run();
       }
        const productRows = await db.prepare(`
          SELECT s.tenant_id, s.branch_id, si.product_id,
                 SUM(CASE WHEN s.document_type IN ('07','08') THEN -si.quantity ELSE si.quantity END) AS qty,
                 SUM(CASE WHEN s.document_type IN ('07','08') THEN -si.total_amount_cents ELSE si.total_amount_cents END) AS gross,
                 SUM(CASE WHEN s.document_type IN ('07','08') THEN -1 ELSE 1 END * si.unit_cost_cents * si.quantity) AS cogs
            FROM sales s JOIN sale_items si ON si.sale_id = s.id AND si.tenant_id = s.tenant_id
           WHERE s.issued_at_lima >= ? AND s.issued_at_lima < ? AND s.deleted_at IS NULL
             AND si.product_id IS NOT NULL
           GROUP BY s.tenant_id, s.branch_id, si.product_id
        `).bind(startOfLimaDay, endOfLimaDay).all();
        await db.batch(productRows.results.map((row: any) => db.prepare(`
          INSERT INTO daily_product_rollups (tenant_id, branch_id, report_date, product_id, qty, gross_cents, cogs_cents)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (tenant_id, branch_id, report_date, product_id) DO UPDATE SET
            qty = excluded.qty, gross_cents = excluded.gross_cents, cogs_cents = excluded.cogs_cents
        `).bind(row.tenant_id, row.branch_id, reportDateLima, row.product_id, row.qty, row.gross, row.cogs)));
        // AE.writeDataPoint solo se usa para dashboards globales.
    }));
  }
};
```

**Catálogo de reportes retail (lectura de D1, gating por plan + rol):**

**PERF-12 — lectura de insights:** el path de insights debe abrir `db.withSession('first-unconstrained')`
para usar réplica cuando exista; si no existe réplica, usa prioridad baja/ventana fuera de hora punta.
No se llama `db.prepare()` directamente esperando réplica: sin Sessions, D1 ejecuta en primary.

| Reporte | Fuente | Plan (GTM §4.1) |
|---|---|---|
| Ventas por hora / ticket promedio / ventas por cajero | `sales` | Arranque |
| Ventas por método de pago | `daily_financial_rollups.payments_by_method` | Arranque |
| Arqueo Z por cajero (esperado vs contado vs diferencia) | `cash_register_sessions` + `cash_count_lines` | Arranque |
| Desglose de diferencias por operador/turno (Z total = Σ tramos) | `cash_register_shifts` (SHIFT_TRANSFER) | Arranque |
| IGV / ICBPER recaudado, docs del día | `daily_financial_rollups` | Arranque |
| Top productos / margen bruto por producto | `daily_product_rollups` (PMP) | Crece |
| Inventario valorizado (costo) y rotación | `products` + PMP + `inventory_movements` | Crece |
| Merma por sucursal y motivo | `stock_losses` | Crece |
| Comparativo entre sucursales (ranking Dueño) | `daily_financial_rollups` | Crece |
| Ventas por vendedor y comisiones pendientes | `sale_items.seller_id` + `commission_payouts` | Crece |
| Cuotas por cobrar / atrasos | `sale_installments` | Crece |
| Devoluciones y créditos de tienda emitidos | `sales_returns` + `store_credit_transactions` | Crece |
| Forecasting de ventas y quiebres previstos | `forecast_outputs` (modelo §5.3 regla 31) | Cadena |
| Insight del negocio / briefing diario (agente de insights) | `insight_log` + rollups D1 (§5.3 regla 33) | Cadena/Enterprise |
| Aging CxC / CxP | `accounts_receivable` / `accounts_payable` | Cadena |

**Gating:** reportes "avanzados" (Crece/Cadena) se cortan por el mismo `plan` middleware (§3) — **nunca** se niega el arqueo ni el cierre Z (operación de caja, promesa "el POS no se cae"). Export CSV/Excel de cualquier reporte leído de D1.

**Modo Dueño offline (lectura pura, edge D):** la app del Dueño cachea en IndexedDB el **último estado conocido** de `daily_financial_rollups` y del ranking por sucursal (solo lectura, cero escrituras; jamás crea ni muta documentos). Sin conexión, el resumen del día se muestra desde la caché con un **banner de marca de tiempo** ("Datos de hace X horas") — nunca se presenta data cachead como si fuera en vivo; el título cambia a "sin conexión". Al reconectar, refresca y quita el banner; las alertas push (regla 30) avisan cuando el rollup nuevo está disponible (edge D cubierto en Sprint 8/45).

**Re-materialización por sync offline tardío (edge D, la fuente de verdad manda):** el cron del rollup es idempotente (`DELETE`+`INSERT`/`UPSERT`) por `(tenant, branch, report_date)` **cerrado** — pero una venta emitida en un día cerrado que sincroniza al día siguiente (ej. tablet offline toda la tarde, sync a las 8 AM) llegaría **después** de ese cómputo y dejaría el rollup stale. Regla: al reconciliar exitosamente en `processOfflineSaleAtomic` una venta con `issued_at` perteneciente a un `report_date` anterior, el sistema **re-materializa** el rollup afectado reusando el mismo cómputo idempotente (los snapshots PMP se conservan, regla 9 forward-only) **y** **invalida** `insights:{tenant_id}:{fecha}` en KV para que el briefing se regenere con las cifras integradas (regla 33). Sin esto, todos los reportes §9 (comparativo Dueño, margen, arqueo esperado) quedarían mal, no solo el briefing.

## **10\. Impresión Adaptativa WSS Dinámica & Modo Vitrina (Customer Display)**

// src/hardware/printRouter.ts  
// Adaptabilidad de ticketera: el ancho es config del DISPOSITIVO (pos_terminals), resuelto
// por el servidor al abrir la sesión de caja. 58mm => 32 chars (maxNameLen 14); 80mm => 48 (26).
// lineWidth en TicketData es SOLO fallback: el servidor impone 32/48 según paper_width_mm.
export interface TicketData {  
  enterprise: string;  
  ruc: string;  
  total_cents: number;  
  lineWidth?: number; // fallback 32/48; el servidor lo resuelve desde pos_terminals.paper_width_mm
  items: Array\<{ name: string; qty: number; total_cents: number }\>;  
}

// Resolución server-side (fetch al abrir sesión de caja): nunca confía en el cliente.
function resolveLineWidth(terminal: { paper_width_mm: number; line_width: number }): number {
  if (terminal.paper_width_mm === 80) return 48;
  if (terminal.paper_width_mm === 58) return 32;
  return terminal.line_width === 48 ? 48 : 32; // coherencia con paper_width_mm desconocida
}

export class LanWssPrinterStrategy {  
  constructor(private wssPrinterUrl: string) {}

  async print(data: TicketData): Promise\<boolean\> {  
    const url \= new URL(this.wssPrinterUrl);
    if (url.protocol !== 'wss:') throw new Error('PRINTER_WSS_REQUIRED');
    return new Promise((resolve, reject) \=\> {  
      const socket \= new WebSocket(url);  
      const timeout \= setTimeout(() \=\> { socket.close(); reject(new Error('PRINTER_ACK_TIMEOUT')); }, 5000);
      socket.onopen \= () \=\> {  
        const bytes \= buildEscPosPayload(data);  
        socket.send(bytes);  
      };  
      socket.onmessage \= (event) \=\> {
        if (event.data === 'ACK') { clearTimeout(timeout); socket.close(); resolve(true); }
      };
      socket.onerror \= (err) \=\> { clearTimeout(timeout); reject(err); };  
    });  
  }  
}

function buildEscPosPayload(data: TicketData): Uint8Array {  
  const encoder \= new TextEncoder();  
  const cmd: number\[\] \= \[\];  
  // Resuelto por resolveLineWidth(terminal) al abrir sesión; fallback conservador 58mm (32).
  const lineWidth \= data.lineWidth \|\| 32;  
  const separator \= '-'.repeat(lineWidth) \+ '\\n';

  cmd.push(0x1B, 0x40); // Reset  
  cmd.push(0x1B, 0x61, 0x01); // Center  
  cmd.push(...encoder.encode(\`${sanitizePrinterText(data.enterprise)}\\nRUC: ${sanitizePrinterText(data.ruc)}\\n${separator}\`));  
  cmd.push(0x1B, 0x61, 0x00);

  const maxNameLen \= lineWidth \> 32 ? 26 : 14;  
  for (const item of data.items) {  
    const nameTrunc \= sanitizePrinterText(item.name).substring(0, maxNameLen);  
     cmd.push(...encoder.encode(\`${item.qty} x ${nameTrunc} S/ ${formatCents(item.total_cents)}\\n\`));  
  }

  cmd.push(0x1B, 0x45, 0x01);  
  cmd.push(...encoder.encode(\`\\nTOTAL: S/ ${formatCents(data.total_cents)}\\n\\n\`));  
  cmd.push(0x1B, 0x45, 0x00);  
  cmd.push(0x1D, 0x56, 0x42, 0x00);  
  return new Uint8Array(cmd);  
}

function formatCents(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) throw new Error('INVALID_TICKET_CENTS');
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

function sanitizePrinterText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120);
}

## **11\. Matriz Comparativa de Mercado & Hoja de Ruta de Prompts**

### **Matriz Comparativa**

| Dimensión | Bsale / Alegra / Siigo | SAP Business One / Odoo | Atlas v8.0 → v9 |
| :---- | :---- | :---- | :---- |
| **Latencia Percibida** | **![][image1]** | **![][image11]** | **![][image12]** Global Edge |
| **Garantía Transaccional** | Best-effort | Transaccional Tradicional | Transaccional D1 ACID |
| **Costo Operational / 1k Tenants** | Licencia por tienda (Alto) | Licencia \+ Servidores | ![][image13] |
| **ERP Nativo (CxP/CxC/OC)** | Add-on costoso | Integrado complejo | Integrado Nativo en DDL |
| **Sincronización Offline** | Básica | No aplica | Chunked Sync \+ Recon. |
| **Migración desde competidor** | N/A (son el origen) | Proyectos SI | **FASE 7 Sprint 21** — Bsale/Alegra/CSV (`CatalogImporter`) |
| **Pagos locales en caja (Yape/Plin/MP/tarjeta PE)** | Fuerte en categoría | Varía / add-on | **FASE 7 Sprint 22** — `PaymentAcquirer` (Stripe = solo billing SaaS) |
| **Puente al contador (Contasis/Concar)** | Frecuente | Nativo ERP | **FASE 7 Sprint 23** — `AccountingExporter` |
| **API pública + webhooks venta/CPE** | Maduro en planes altos | Maduro | **FASE 7 Sprint 23** — capability `integrations.api` |
| **WhatsApp de comprobante** | Común | Add-on | **FASE 7 Sprint 24** — `MessagingSender` |
| **Fidelización** | Común en planes altos | Add-on | **FASE 7 Sprint 24** — `loyalty.points` (light; no oversell) |
| **GRE / percepciones** | Según producto | Fuerte ERP | Post-MVP (ADR-FISCAL-001); no MVP v8 |

### **Prompts para Agentes de IA**

1. **Fase 1 (DDL v8.0 & Migraciones D1):** *"Genera el archivo DDL SQL v8.0 para Cloudflare D1 incluyendo tenants, branches, cash\_registers (con line\_width y paper\_width\_mm), cash\_register\_sessions, users, customers, taxes, product\_taxes, products, inventory\_movements, suppliers, purchase\_orders, accounts\_payable, accounts\_receivable y cash\_register\_expenses con índices optimizados y soft deletes."*  
2. **Fase 2 (Router Middleware & ACID Engine):** *"Implementa tenantAndAuthMiddleware, verifyStripeSignature con WebCrypto y processOfflineSaleAtomic en TypeScript para Cloudflare Workers usando db.batch() atómico y guards SQL con rollback de la secuencia, además de validación Zero-Trust de impuestos y precios."*
3. **Fase 3 (Firma XML WebCrypto & Queue Worker):** *"Desarrolla el Worker de Cloudflare Queues que consuma mensajes de ventas, genere el XML UBL 2.1 con impuestos IGV e ICBPER, y lo firme con WebCrypto API usando el certificado .pfx del tenant."*  
4. **Fase 4 (Modo Vitrina & WSS Hardware):** *"Escribe el componente SvelteKit para el Modo Vitrina (Customer Display) conectado mediante WebSockets a la sesión activa del cajero, junto con el conector LanWssPrinterStrategy adaptativo para anchos de 58mm y 80mm."*

## **12\. Análisis de Costo Operativo y Performance Estimado (v8.0 → v8.2)**

| Métrica | Estimación en Cloudflare Edge Stack (v8.0) |
| :---- | :---- |
| **Tiempo de Respuesta API (P95)** | **![][image14]** |
| **Tiempo de Invalidation por Suspensión** | **![][image9]** (Durable Objects) |
| **Garantía de Atomicidad SQL** | **![][image15]** ROLLBACK en caso de fallo de stock |
| **Escrituras Concurrentes por Shard** | **![][image16]** por Shard D1 |
| **Costo Estimado para 1,000 Comercios** | **![][image17]** |
| **Costo Estimado para 1,000,000 comprobantes/día** | **![][image18]** |

**Nota v8.2 (margen):** offloading cliente (§7.5) + `ATLAS_PSE_DIRECT` (sin fee OSE por defecto) + `usage_counters` UPSERT dentro de la misma tx de venta ⇒ costo marginal Edge por comprobante ≈ **1 write D1 adicional** (+ R2 del XML async). Analytics Engine **no** entra al path de facturación de sobregiro.

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIIAAAAWCAYAAAAM9ESoAAADwklEQVR4Xu1ZW0hUURQdRbIXvcjMx3hHxygtKoLe9DKidxZRRBRFUNB/UUYSPSDKiqK/6iMoKKw+DESoMEjo5YdRYWr5U1SQHxJRohC2lrO37jkpweiH0FmwuGevve69w9n7nntmJhTy8PDw8PDoHZmZmeMjkchusCQnJ2e9mzdIQX4huAPeiW5SgdyqIAgO4LgxPz8/1c17DFKgaO/AavAsWAneSktLG2k92dnZWSjsa+QacXyC4zc0xDrrIZBbIvlz9IJ1rsdjEAKrwXAU7rjVULxO8IrGyI8Bm8AKfcKRPwm2h8Ph2cY3F9oPEw9FXIVzRqnmMUiBQq1l4VG0pUZjI3RiFRgn8VHRlqmHDYT4F/hINVzjATWNCcRFWDmOWc1jkAIFnGljaYz7NiYxTDY26jWih1DsneJ7bD1opmHUsSqkqZabmxvk5eXlaGxzCnjmuK8ng2R8vmIwwjGuv9k1ePQTXN5R1I+2UFLgDusT/aE2QtCzalT14qNehOJOljEb7TjuswLj58IP4Cw0ziS57luwA75LIdOAuMYM6PVgWRDb13yFp8ncziNRyFNbigm9iONPedK6IcXrfvcr5FWgjcCNZtxKopDzV3PM/YLEdeA98/ppAxvAWj7tol0Q7x45NxXjL2CZXhvNtBfxe409+oHCwsIhsrSXglcxPg05RfNSjL8aAVoVczLuKlpfjYBN5QYbg63aBEQk9o2kU+6tvk3ivcYYq8F0iU8ZTwZYr7HHAEImm0XZYuK2XnzdrwYUcr/4Kh1bkugFKkh805oQ11JHw0wz2hrxlhuNzcFNKnXyE+49T/MuxM/P+U/iOmfc8/8b8KnEfmC01XSS0QjXbRwyq4TodrO4VXzV1qObRf5opZr4blgf4qfUbSOgMCvFe8fxFoDPJEe22LxHAsAkNqCILxxNJ7irADg2M45GoxMcH3+I+s1xVlZWtpzzynpwTpj3sJr44hqBn4F6HyvCXcZojCkYX9Z8enr6CMb0qOaRIDCJreAbR+Pkkwcl5t6BRVqkHnnS2wPzLSGILbFxewkUeDkKWGI1uXZcI8DzUu5hG6HrN46gpyHniydTPRhHqWnskSBQqLGYyO9gOTdqLCyJ8VTr43d96DXQb/NdinELjrush4C+gHmwmF7EjSbHJZ2F7SZ8h/kKcvVeeIJ7ARw/41iB4/kgtiI1I95mP4NHgsBkFgWxp/4IuN3NW/AJROEOwZfh5hRBrBn4B9Y+rhxuvh9I0fviG8Ri/jCFYZLj8fDw8PDw8PDw8PAYKPwB9KNVUQAizhIAAAAASUVORK5CYII=>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAWCAYAAACyjt6wAAACn0lEQVR4Xu2UO2iUQRDHE4nv9+M8vdd3LzlynRwqpBJEiWUaEUO0EKwsxAc22giKrYV2iqDVgSi+Co0vEBERlDSCgoKIGpVIhCAmBP3NfbN7w3KmEK7yBobd+f//szO7337b1dWx/8XK5fKSMM5msxssptYTRVFfLpcbgk+FZNuMor/wB/hd9XGa2GE10lA+nx/BX8M9QjOGD1hN24xCv63TxCbLVyqVxdIY3E1Od67mHMen8D6rbYtR5JwUpIk9nE6tBX9MGofb4rBqtToH7Af+2GrbYoVCYVuIWTMnOy/AhwW3GCeccPNMJjMffr3lk8nkQvC0xawJx0FUa7XabA9SuB9wH4tdYrzYlMemDU61wG+4Bsl7bzaSZ7zN8IzxI75fGiM+w3wUn8Tv2UbJXw5/Xa/SFfydLfQ1in+OvbIYfjmVSi0wvBT+6ROauG9QP/mgap/IKaism3hai5+Wk4Hbqrq6WauOP2c6S2KaX+c4IU/4II7DZIknrEbxq8K5mAbWqHZ7oBPsBdNuiXUzgo0azWd8WDif+DdTsSxwRGOZT7bQ3RLOxel0eqWNnWn+4RaYvzbMe/G3ijc5ee8IdvnMWPxGRSc1biSFu4uCn4QTXGZjZ5p/MMDkHk5bjM+6gn6OKhevo4/uUysk/qaLDmr8SuO1ge6lX6grLmBjZ5p7KMDkDfVa+riWSCQWaSj3tlFbhOd5ZjY6oWKy4HfwpMaNd5AT2uw0ctnBJvD7DiuVSqtnaDA8QcG8VtZi/Z1W4w3yi/xljGfxT8wPhBr+6lVwD/E6uz3FOCZPk+OJP7ii4qxxB363xRTvDzHNl81egB+J4qsz7osXi8WlAAPy/fEhT7Qw+KLoZnps/8XoISejPC/00su0J5B0rGMdC+0PApPws+Vua6wAAAAASUVORK5CYII=>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACkAAAAWCAYAAABdTLWOAAACpUlEQVR4Xu2Wy2tTURDGo/WB7wqGSF43icFgNiJBsCI+ERVUdKELsQvBjUtBF5UWRBeCoODKha5VXAgKvmjVhSK6EAWhtNb+A90UKbUgBP1NMidMhrTxsSnYDz7umW++e87cOffkJhabw/+IZDK5JpfLnYI92Wz2kM8HVCqVheS3wZN41/p8QKlUWhFF0Tk8R4rF4mKf/ysw4SAcgFfhE3gnkUgss550Op1C/wyH4Bs4Bg9Yj4DCdqJ/g9cYf+H6oVAorPe+PwJdXMpkF63GxD/p1s0Qk+9E+8r1YegM8WX4HW4yvi2q9UrMgy1h/BQOB890YL1jXmuA5EEpKp/Pbw+axLBKB1Zp3CcaRewInng8vhxtivufmfv64aTdYvJ75d4QTwc8g15rAgVutLEW+cDFstB8YxP9bSiAYrrV98p69GHkATut7tG2SAvMXXA0lUqljSaLT1mf6i9DkVx71ffY2Rao3uX0JrQtUt+dPp72BtdJtjlr87rIhNVUf2GKlEMnHXvkbB2i0+k9Tm9C2yLL5fIi3S55927BS8gdIa9FjptbauCe56bI6+prvCYBaFWK3+91i7ZFeuhiwqMmbtXJxnZTxBkZt+hkbbszmcw6CRjviuoHzHOihdZfm4GTGA+nOEAmVd62ccx0V/V3qktXj6tvwHqYf6Xofg2PaKZOkhxmgfdOC0Xe1XhUYnkg5xuBVRnLQdN7PjpPXnSrtUK7IsfhJ6fJYrJ1ZzWu/U7KJzF49KflR2ROc6TbJp/PoDHHvn8ukoVXR/XP2H3GV+THOap/GjdYn3QR7TX5e1H9JI/JYbMeAfpWOMI7eFjmhEOMN3ufx4xFCjDsjurdugBP+LyFHAA85/kAJHzOYB4d7MF3+nf/YLQtcjZAuu61OcxhNuIX9ynfL4zwFGgAAAAASUVORK5CYII=>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAM4AAAAZCAYAAAB5JBFTAAAJgklEQVR4Xu1aCYwVRRD9iAfeGkWQY3p2wSBLNCpeeKKi4hFv0RgvvCIBA+IVjOJ9I3jgAYKogIpi0Ch4IAoKChqjQhAVSYwRWNEISMDoxqzvTVd/6tfO37/71yWsmZdUevp1TU13TVd3T/2fy2XIkCFDhgwtHh07dtwtiqIbnXMbIBW2PUM64LMjIAsqKipOqKqq2tq2t3RgXPtiPsy1fIZc8vLPhXPWoHwH5XrIyjiOh1i9AOrToZYP6NSp0z64fwD0roKt/W17fWjbtu0OnISdO3c+rVu3bjva9gDYPge2r0N5HKpb2PbmBhcajPEN9GEpZDH6MQf1hRh7R6uL9u6QG6DTDzrtbbtgS+gcBhkKvYtsYyk0wN9l2Yf+SMggy2fIJc5h0PTBS98L17926NBhO5TfMECUWitMaMcJjbZatF2o2vLAC9wF7XNRngedayA/MRisXhokgFehvBcyAdcrIWcbtS3Qdh9kMPXxnI+g85XRaXbgmYsgr3Bs6MPzwl0B+TK3MZBbo/4M5HPIC5Dfnd/R795oyQPcd5CJ4t+7IPdYnTSIv2dof6M+zeqVY79nz55bQa+6a9eubW1bBrzk4EQETldc/yrcw5APgxJeyBzUv4CMd8UDh/d9SYcHAi+qA7jHtFIaJGhqMQHOCBzqD0HWV1ZWRop7nFyo5/zk5FFik+46eOYGTKideI2+P8cSY+1C/6HeR/h7UZ+JMbVhXRYmLga1eUO5xFYFZKTh6GO9cKUh8Tfkk0CIv9dopXLto9+nQ+d1y7doYEA9MPgDciUmDCbdzpbTgJ1K2JnI6xA4cFhflDUop1h9Qpx+cQo/0U4K4WshZ1leQ3Q+1xz7LvwXrEf+KMJ6wSTgKoq2UZprbqAP/0C68zoEjiwu6yC9+L0jfaW8pu47RriTFbcc9+4a6gTqC6hX32rvxN96sRF+hFP+boL9VSHo/xfAgGaK8ymru3Tp0tnqBGDgb1jOoBXtwJFPQfcQXP9uFSxEPy1wlrAthU/sW15DxjLb0FxRk3Gygv6NkfpdWsn5ybhYc80NGdNPnLQhcCzQ9gD0lvGbTXGH8l6UR7POd8e6TSy4je/4As1rOPE3nn+85lEfHvzdRPtjdR229mD/Ib2dJJAkqdRD62G87SAHa05DFsSz+Wx9mhC0hr1TITcxqGkbUmV0Gg92GDKIH+A5f96vcv7s/GA4OgTIAEtOKHEghefv9fWtQgR1UwKHk7yGbYYP9mdZXkN03k7h2afEJp75Lq8xrmFGp5fotNZ8cyLyuwv7TNmgg6M+4L7BvCckPnDfUWF8GuDekrHebtsEeX/D5hG6gZPOib+bYD+ZP7quxsv77kD5LMpHUC6H/ChH1dec3wmnQp7MmXeCvvUBv5qBjXKeXJ/DNs5f1D+EvA+5TNo5vqu0jbLADltOzs4zINVsh7TH9UDIKsgVVt8COpdD1rKTIivR2cOtXoAMpiAzIwmF5H7NE8Lnz+FpEJ16AwflXF4XC5yGJiH+C3BxwTNnhTFT4JMJ+vvOgm3o+8IwHgLXJ+m64sPEfsC2EdrfRQIn8Xe59sHvjaKV5jixYXuUPDefkJHvKr6n+UwgBV708hk53NsT9RqUL7OOZ7RBfTZkHXauTijvhqzAfN6W7XjeNs4nqZoeOKW+WehQDOTI+l5gMcg3DnevD2TQBd8SAWzDoC81NI98PPenvSTaKrnjwEHvpPB1dhzIzUYn7DgFL1oD/e3dCCmWMk4F+vUcnj9U+lqDd7C71eEJwfnFaRaPMoFvwo6Q9zfft26QwGnKjkPbyy1JOH/EqnUmc4f6fBvA1ItUckHuI3dc8LXzizb5lyDXyzX9OBXt+2l7TYY88EXnt8XrbLuG3RnSEMsuFpIDjHjnd6tFVpfg4HBP/xT+Z7al8HRWssoUg9h8L4XPH/9QTuI15BatwxcGrlpzFmi/taGCfpxo77eAzpgK+S2LgcPSyYtH2/kFyr6N3yOjcyaZ4/xvPHWCHtzb5CEDNa/hxN+xfC8FoD4s+Lsc+85/M35seQL8WXLfZMPPsxNd9N409b9dus/7t2vXbnv6VfSCPINbt1RmywZXgxV0DOQ2XE+GPB6nrJKx3wq/s7xG5LNztVyZVDqag6TdYqsOB3RZCs/UaGrgsI+W1xCdguOcbNXkE5sYz6O8js3xAn0/AfzXmmtusB/cAXkdAify35vs39VaVz6GR+TU5KUuSzny1TlmRvINhbKf5jWc+BtyiuF55En8XY598OMwhgGWJ8CfLs9MMrGK/6hI4Ew39X9yJTLB6FMlfQjdFdLH26xOoxH71azggyv2UboW5bDw0SmTbmJ4qcXArAb0ZvGIJ4HzG3nYmkLe6hPigLTAGcu2FD4tmVAA6uCZ32suZIScBD9sXCT1cVoP/IXOr0ybDHjeH04yUsHH3IGkf8cGPe7enKShHoCxHhquof8t6rFqJpdkzCyv4cTfULlE85wP2t+NsR/7xZZp6F00H4C2M2WMkwxfbMfJf7fi+k9y/J7RegFouxPSK9Rhr33kf9D9ReuVBRgZbzkCDzhcVhH+jjAa8iMHwxSi1bXAGfkgliFweAZHuRb2rrS6hDjk8hT+WLal8Ov0ige7T4Mby61Z6TCTUhM+DIVLfvOI5RxOG7TlTNoa9obz2ZprbsQqzR8CB9z96Mey3MajBU8HPLtzBe8dhDuknphcUSOTUnb+SJNfuCRjNRV6NyqdxN+ubnp+pvF3SfuKvyAu8vsdEckP1a5u4HzSgMDh33e4iA7XepFPPz8Ned3542weqI+NzYK62YABgg5WQxbToahPsKltcC+LI+qI1sv5NOn82P8FhKnX5Sm/ITBIZtugjv1vBN+j7UHnv+GWRinZPehcDRkiL/FT2rM6zQ05AvG3kF+cP1Isi9W3EQMj+CdNtC3C+ezSK/JjLv9yVLBoOZ8AWQK7YzSf8/7m5Mr7G/KE0Slpn5AxVRdLLOn+UxgAKMdZXp0UtCSJJpR7Or+Y8P4Fsc8yJoseymmQV53fDcdD/oLOnMj8eLu5gavjKZC1tqGx4EDhkEs5sZmqtO2lEPsfYnsVe4EE2k+GDIz+ix/HmgAJkOk8Gtu2xiLy/+IYBJt9bVspNMTfpeyDvzbaRP/AYHBxF9Wck39iyA+tvSVbWDRTutlAzuMFKcUMpRFeeEsHJutnmKwHWj5DhgxFwJ3bbeLMZIYMLR4Imh/qO+ZlyJAhBa7E72wZMmTIkCFDhgwZMmTIkGHzwL8YhJR1gXjvzwAAAABJRU5ErkJggg==>

[image5]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC8AAAAZCAYAAAChBHccAAADEklEQVR4Xu2VPWhUQRSFN/iDigqKwZjd5O3G1ZVVLAxaSLQIsQniD1qIEZSIoqKCWFkpSWcqa0GINv4koogoCFqpiCCkEFEMAQsJRPwhxMIU8TtvZ2T27r5NG2EPXGbm3HNm7syb914qVcccQBRFncRIa2vrbYbzbX7OgqKfEB+y2ewn2sfEazaxwuqKxeLCXC63k/xFtE02XwvyykccTvLm8/nl5Lvd/HuJRVZThsbGxqWIBiWk4Ae0R4lLTPAs1DHeQowS11taWvbQ/kB3IdQkwXudbyDJCz9BDZdVOP0hYsxqyoDwdCaTWaw+4vsqntPdTP83ExW9TmOiLxj3EjMUtMNz1dDW1rY+yRvqGPewXpfhbupwQ64MEhA517+n4mnfE+MUtjbQzdjHyGJf4L+narwj5L8meVPOp0OymxE4xAK+h5b/B0xniVHtmnZYxVsNXJbctOXdJmfwdtic4HwzSV7vcwdWUTw3Ig0/lUo6HF0Zt4BiionuWE1U+hL9rMK/db5emxOcT/kkb+zTPZfOavTREB/egAogeOUW8TEA3eDzTLK7RgHSn7E5wfmUT/LGPtqr0llNUPwmm6sAwiEMJ2iniYn29vYFjp/t5I/bnOB8yid5Yx9P+4p0VuOL53ass7kY6XQ6g2ij+lGp+CNR6XOmRbeLd1+fyXJnrH8nHYvvsznB+TRPVa/3RaX3rqL45ubmVeK1CZuLQfIuMez6vvj4xPTYxWuDbvKyFwfuo/ikz6X3JXm9j35PteLZPHT0JxVc4TKQvEEccP0hvfkUvUuT0d/gZA0aM9nqwCr9L2KyUCgsC/kA8n1O8nof1yJfrXg2txX+ueX/gULP+74vXhuCfxPqNHnkrpEbr3HcrYDrxveUtjPg+pK8fuy4FynzdKjlEPOdDLkKyEiMu/gWLuTBRE3wL2kH3W9+nIkPGs0p+DHaY4aPvfLRv1bNK0Slp9RP7CceESNWUxU8upVuE/02F0K/exY+x8u0xOZmg3xEVw1vA/kO3Qau2TbG86wgEfqe6pQsX0cdddRRx3+Jv4/0CQOG8vvGAAAAAElFTkSuQmCC>

[image6]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAE0AAAAZCAYAAAB0FqNRAAADfUlEQVR4Xu1XSWgUURCdxA1FDwFzmZmen0wCgQE9GEFFcYtgHEGNGIK4RQ+iiCJeRKLijgpGguYQPbhERC9eFNfgmgREJQfBoGJOkoNHgwcNIb7K/B+ryz+d7tiIYD8o+ter1/Vf1/R0z8RiESJE+B+QSqVqS0tLp0veIJlMTispKdkO3VZZC4KKioop6FPtOM4KWsu6AflRSu3BsQppoawTwvIUFAUYlMKmz2BwELFOCgio30etHQbrsN6J9a14PD5J6kYCzl+Lc78gjqPPJRx7EauFbAy406jv0oN7gegSmtA8DaOsrMwhg5KXgOY5NnuDeKfyD60QfEdlZeU4QyD/BqNnuWgk0MXRHjiuNBzyM4i+RCKRZNx56m/yWG6InTgWMC4UTy6gwTKYuyL5fID+Dl0QNl1vqbWi1yrBNeoBuHgvkB7xinPYr4jz9DXTeSPX0T6cC8uTCzg5G+LQusEv4Rx6H9IX18x5L2j9E0HTHUP8ICXo26LzI1yEfDHiLctD8eQCTsyi6WXJ54PKPzS6qH7w8zgJg/u0wUec94LW37PwP6hGa+zzgNbUn2tof62hF0JonlzAicsD3mm39YauZxo9WIn3MNjOeS9ovefQqB+t8w2N/ITiKZ1Op3DCQh5ouBcn35U8BfgZsof6dadtFKUC8AMeBn1/qlpvG9p3qtHa406bSz5iuZfBn3uCqAZxQMRVxGsLT9Fg6TE0NGy8yVL7DH6B4BpIj7jOeS/o/g8t/ADV9Pqa7rufa/CzaD64XpOH5ckFFfzraYZWb6l1IbKcw6d8QuubOO8FfUEdnMOP04maNy+CJt33JNchryYfJg/Lkwtq9EPbbKldkF9b4kif+v3FkRd6OO85R48WzXdTjn4bdH6R64iHtxaTh+XJBTXKoSG2WGr0uj8quMeIr8XFxZMZdwzRCtNprjVArQ3RX15ePsFw0FbpCz1IOfVD3od4OnxibOhOOwxukcn9egoE5XNo0Nwk05ao4TqV+xQ7oa9D7Ma6OZPJjBeac4gexCfOc6A2B+d/QJzCoG4g/ygf6ATUt9E+qNUiXkLXJjV+PAWC8jm0IID5IvSsx3GNrBnoO6VH8hLoMwsxG8uxsmaAPlnEDuyXkTUDP558w3GcmUrcvn8DuICldAdJPoIHVO7ZaPvTH8EGeqjj1/pUyUeIECFChAj/FH4CuL1gNyITaroAAAAASUVORK5CYII=>

[image7]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFcAAAAZCAYAAABEmrJwAAAEDUlEQVR4Xu1XW4hNYRQeTUIuCWNqzszZZy51NEVpyD2XInfjPoMpyoMicnmQDEUzGOSFRORhEGnwSKmZxkQeFEpJvFGi5IUamsb3zfn/3WrN/5/ZZ8aUh/3Vau//W99e39rr7H3Of/LyYsSIEWPwkEqlapLJZKXmLUpLS6cEQbAbsZPnOk9UVVUNRY250BwoLi5O6HwuMH5eL8J6Ibb6/NLp9GjklyEO4R6rdX4wMQTNByUlJath3o1YrwVEIpEYj1wbbmYjYh/OP1dUVAyTGnBTER+Qv2Hq/UAckZoooBdqPDZ+PV4Yyl2Xn/XCsZF+Mm8B/jvipOmpGdqVWpMTUKQUsU7zGtB0IF4irgX+4ebj5t7waAmsU2jylNCw1i/QZ4SmhjVxXCp1faDHC9HOcxL0Qp1O6YentIJ+4VUZXY32wroWuhWSw/pHeXn5RMnlBDSyAUUuaT4bOAhe5+CbmXPw1C+Wa76CSvOWgykoKBgleR+sl366sL4se8D5Z09PoRcGO8mj6Ua0aT4y+PoG/26477I0eZbnZWVlSY/muam7SudcsF6IhYpvsvWtl8cv9MKxzqdBdGH4Y3UuEsyTe1Hz2WAa08PNB//H1yT0D3mORudj/dOhaTU3c1DnXLBeqDdT8SdsD8aLNV1+oReOR+01Dk03voOn61wk4KY3Bf14cgP1nVtYWDjSNiN5ghx8Hpnz5YH7ZlvN9ZF+2KxXtuEaL+pcfqEXapy21zg0HO48nesF/tqj0AIZuLge0aJ5Bn4MJusaBA35oSh6CPiuLE0+4Hmq7yf3gM65YL1SWYZrvFjT5Rd6BX0/udN0rhcgXBtkhinjNuKZg6/HAPfqGgQN0fhmB+/78aD+Cs9RsxLr31qDfDt1yG/TOResF/RzFN9gezBe3S4/6QXvXb6+GdgxlOhcJPT3awEN1Tj4V74m4dPIc25tuHbsRbnNi7wds154G5dIHj4XbA/Wy9eT9UpmftSdGqMbrnORMIDh1jr4q74muTGXa/0vCdwnRGdRUdEEyftgvRBbFH9T9hD4dzChF78uPRo+FC80Hxn9Ha6+KcMv8jT5lX93xZrXh1soPMVjDHdfaGahtzt8ZS0nYb2gOaZ4bum+2jXyx3VPxi/0IrB+Ins0HB+i/ZLLCVGHC809M4BeoaTckj3lq8bGcP6FnBTg5gqoQdyCZg2O36Cvkxpws4LMH4uP0OyQOQF6XWct64U4T16KjJ/1Okc/mbdA/j1yDThW49jS7y2YRdTh5gK88uM4EA44299HNF8O7z3cxumcBfJNqLVd8xL0i+rF7+gsftzxzEatvfCcoZM5A4XmoNBhzf8vwM12YCBpzccYIPjBY7ivNR9jgMCrPkLuMGLEiBEjRowYg4y/5OuSo8Md258AAAAASUVORK5CYII=>

[image8]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGoAAAAZCAYAAADZl7v4AAAE/klEQVR4Xu1YWYgdRRR9M0YRzEdEx5F5M109bxD0IYjMh0YT446OqBGXREl0REQlhAQJ2WPUiAviQuKPa5C4/2omm9uIisYtIGiMQUEI4p8k5CchjOd033q5XF9Xv36PmEH6wKXrnjpVp7qqu3qpVEqUKFGiRCeI43jOwMDAuZYvgClRFM1wzj2I4zxb6dHT0zMVmmvhN7u3t/cUW++BPm5FLEJcgbTL1rcC74VYEvIaGho6Q/yCXuhnATT3Dg4OnmfrjjW6YOpgPo5BTGDy5lpBq0D7X9DPRiz2DSivQ3mt1XAyUPeX1G/EcR88bzSybtQ9gVgo+s8R3xpNLrSXjCnk9Qf9vBd0Z2sR8mngx3gxi24f4j2taQu4QgbYqeUtoPkMht8hfnIdLBTaDiKeMdwEJ8jnMnH0aEwWuOfA7Yeuz3PINyD+9vnw8PCJyL+qBK70ZijiVa1W+5l7L7TbWTnqdwK4HxBf+HacX+QHfd42MKjr0dGrls8CtGM8McQdtq4VuPRqnWa47xGHPS8TxwlooK+v73Tx5ULwwrlPcrvoNyOe1lwI0J6T5yW6LC/yiR+ObzDXi04gf57zrLnCkFv9P1koubomUOzWPLhPyfNOkpz9f6w19Xr9JOHZnif/okzKI1qHPq4Cv0tzIUA/L+TFZxK5gBd1iR+OPzOP0udXA+DWIdZrrjBkoV6xfBZcBwuFZ9wlbGt5cDukz5WSs7y5iY580h6TsY1lTN5yrUF+KfjDmgsB2lUhL8zPTJ9neFFHv24eJb9I65CvwXi3aq4weJu6YnfUZhn07bYuD2h3HdtaHn1tlxN8VHQsf2B1wiftcfySZUzAMq1BX7PI8xmi+SxA/1TIC/1f6fMsL4a8NSZlxHStQ74a8YnmgqjVahGvAhMr0Mn7TXheLefbPpzcUdwybF0eYjkxy6u7YwVzOdkxqwN3xLePZXF9Gw+5a49oLgSZxEwvjG2G5FleHCv9ulSbi7XOpXftFs0FAfFNiDUmNmEAO5vwvF2XNunDL9R8W5cHtKmzreXd0a3vHsnZv90quLVQ4++oNyVPtksP5JchftdcCDj3+0Ne/f39Z5EIeJFP/Fz6Kt7YLj3Q/0PweV1zhREX3/r8Qt1p6/LABzPb2g9KJ9sYxjJbcp584xWX0FuLaNZLmye1zqXb6zeaCyFKPwUyvVB/KrmAF3WJH467JB/RujjdXp/VXGG0u1Bod5etawVou5tbsOH2sk//3SInu1trMGE14X+UfL7kL2kdxnU3uA2aC4Ef8XleRMCLfOLHeuZ2twH3GrjbNFcYHSzUqK0jUPeYXQgNDHgtNJdrzqVvS43nBMofIg7xNdlzmNCrxTd5TshVfwDxkdcQ9I/+/YzYFBpTnpdomnpR5/14XtLuYa1D/Ti4kzVXGK0uFHTvchA2IvMh59Iv+F81Z8GBQ/M2veN0W0ieTRrgpqNuD7SPI95h2ZnXXgL8A6hfFKe/bL6GZofVgPstNCbtJWPK9HLp7y/+V0y89N8LAZ9vL3M8iMUo/4l4wWiKgwNzLSxUEaC/vZazwInWEAt59do6DYzvAsSFKE6xdR7wG5EFq9s6Qu6+3DGJ1+JKwEs+hkeyvDzQzyg0t+B4pq1rCxxc1OSnaCfAibxlueMJnOM1k21MkwJxGx/DxxIu/Zs9qcZ03BGZ/1yTAdVq9TTLlShRokSJEiVK/C/xD58v6V8R/x10AAAAAElFTkSuQmCC>

[image9]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAWCAYAAACCAs+RAAAAyUlEQVR4Xu2VIQ7CMBSGNzIkIcGRdN0yM4UqB8ATEBwAAeEQGK6AmkDi0Ti4AwEEHsUp+GrfAcgeeV/yZ+3+in5JuyWJYRjGX+O9n9V13ZPvW09RFEPSILBzzg1k33rYeCjL8ojEjfFG9hpI8zyfI/BEYMk8kwvaTsbm1+RB7nEuF2ggSrzJgnEqS1VwnMaIXOKdICvZq4MLPkHkxHNbVVVf9upA5IDQhwu/R8jLXiUhhC5SL3ImU9lroxM/BuTKj3EkS8MwjJ/wBc3OHw+bTNpiAAAAAElFTkSuQmCC>

[image10]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABUAAAAZCAYAAADe1WXtAAAAmUlEQVR4XmNgGAWjgCSgoKCwSV5eXhNdnCIgJydXDzS0Bl2cIgA0UBGIH6OLUwyAhvagi6EARUVFeWA4OZCKgQbfAdK3gLQjupkgWwOBuJYMfBmI/wPxaqAxzOjmkgWAht0B+tIMXZxsAPR2JjAVCKKLkw1UVFREga78hi5OEQAauB7oUnt0cYoA0FAjLS0tNnTxUTAKhhIAABbYKJQStC/8AAAAAElFTkSuQmCC>

[image11]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHAAAAAWCAYAAAAYTRgMAAADBklEQVR4Xu2XS2hTQRSGW6nv9yNGkzZJk0ptdhJ80JUgSnXXjYiluigIggvxgRvdCIq4c6E7H6CrqCi+FlpfICJSULpRFBRE1KpUKhRpS6nfSc+kx+Faii4CZX74mTn/+ef29pzMvXeqqgICAgIC/hcNDQ3z/Liurm611RQ16XS6OZVKtZNP+MmACoGmDMCH8J6yjyZttR5pWCaT6YZvyD3G0wtbrSegQqARI5Y0aa3NNzY2zpXGkbvF7pyua47AIdhsvQEVAE04Iw2hSTvZXYWI/GFpLLkNTsvn89PQfsIn1htQAdTX12/yNQuzM2d4eqfoVmOHxty8trZ2JvlVNh+Px2ejJ61mITl+KPlCoTCVtVvE73sCPNCYFoq2i4JdZLzg57WBQxH6TddA1n0wjc4w3mF4zvgJ7pFGEJ9i3gMH4X3bSNYvJH9DH9VX4Xs4TLxy7C8GRIJCfUuPfrx0SLHhpUQiMcvkR+Avu0b1cgP1kdqm3qeyi9RWrY2Q5pyQnUVuo/qK5lpF2MV0isQ0dwXxQGjgBEChjnqxX1yJ+61H9WuSczHFXqbezZ5PtBdMqyXWZovWYzxfYKfkjNbF12/OxQEThBZTCnxQY5kPRvhuS87FyWRysY0ddP2BCK38WGbeBN+pXsrxg9ht1/jAczk9dvQZl1xrnb9+UkDOe/yD261G/FaLeExjmY/Y3aH6Hx8xFGmBjR10/T5Pk/fgsNV4bC7ifg5prvQ35XFrPQEe9FD+zGrE37WAbRq/0ni553spuoulATZ20LX7PU3OkGUv93E9FovN0VDem+59esV5AiJAgc5yjFjjaVK4H+hxjUvnQHbYeufRz/x++MBpuVxuqW2Kg17P34Gilb1yLa6/zfO8prHnrRYQAQr1Vb4SGU/Dz8z3+h6+SpeQewSLFPU4Y68cPVye+KNripBr3CW/w2qqt/iarpcfwzny3enRR3MfPDl2BwF/RTabnU+xWuX9A9v9vAX5rPjGO4z/C7iHlIx6fGhiWuNZAgICAgICAgICJgN+A5yCC+qszG7sAAAAAElFTkSuQmCC>

[image12]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADwAAAAVCAYAAAAaX42MAAAAwElEQVR4Xu2UPQ4BQRiGd5daQ7Xzs5vsKF1AOIaSI3AEPYValBp3UKoUoiPhABzDU6i+C0g+35O8mcy80zyZnywzDMPQTAhh3DRNkOvqiDHOqqo6kr1zzsteDWVZ9pBckbVqUe/9AMkduXG6C9lroIXYFMEreTJvyw2qqOv6gfCZTJgWstdGzqm+vrK5LFWD+BDxA1nySXVlrxaEN8i/uepbPrC+7FWSUuogPkf8zjiSvWYKpC/k9Jfv3DAM41d8AAfUHw7c7eZKAAAAAElFTkSuQmCC>

[image13]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKIAAAAWCAYAAABDqUd4AAAEF0lEQVR4Xu2abWiWZRTHN9FKxLDAZm577md7HhjOUmKQYMK0fKE0k6B9Kb8oRS+gH5TCpVEi4mtKhAxFMKJYfYp8wVwNbRCUnwwS92J9kfXBSEOW6JD1O3vOtV07uzfWB4Vbzh8O93X9z/9c1wPnv+t+0bIyh8PhcKSgqqpqapIkJ4l9Nudw3BNgvhPEHeIq0UMcgZ5sdQHkX7BcjJqamuVoNufz+TXEQzY/HviDeDKXy71eXV39hM1FmMz6m9C9xvVxm3RkE+WY5VfMM5+mfkG8TYMPcP3cCgVoV5C7aPkA8o3Ej3KyEp3Eb1aThoaGhins24r+L+Jr4jaxzeow6Gz5vbK+7vM33Gqrc2QMNH8VjSzIWMwnRuRUepTrZcw5T/mVxADxL/qfkzGMiP5pcjfCXE5D5ie4zoh1aUDzFdrfC4VCtczZZ6nsyXVj0BSLxYfRdcmaUd2HzPvD3JFR0MRPw5imfiZGJP5U462PtQKMsWgsI1J/Rswac8yfJbbHnAV1jWq6D2Ie7nuir66ubrrOt+rvWhI0+mzbN1zlyCRo4vtEG2aYFYwot0muT1mtYCwjwq9Vk5w1qUnCV1ZWVhl+COQviYY1lhl+h/IttbW1OV1/gNSkWEf+HPyrMefIGOSZSxv8D3GFpn5jNTHGMmIyfFqdSsmJmZ6zfAD5ftU8Y/hmXbM9nJrE7VgjoO40+Y8s78gYaG6vNjnEYTkVrU4wjhH3SC2G+DYlJ2uutHxA2JfaBYYPRvyJfVfpeOgZNECNuNvyjoyhvr7+ARq8jrgSmWKX1QnGMeLHWpdqRPg1lg+I9hxhRPZ6V3PnpV7Ho4wId1z2t7wjQ5BnQ95262RM448lpZeVQ9r0l61ejdhpedZ5S2tOmlS58NTNNfwQkuETeaHhw+3+S6nX8c1YI2DvM7K/5QOoraWubYJxXP4w7RqOu4x86QVl0DzBiPoZRk6oN61ejAjflcI3SQ3RHvP6VjtQKBQei/kY5C+Ixj5HMt+pa37Cb6rQsbysjPjYDteB9pWYc2QMNPEwsU7GkRHnqTFetHo9EbstL2/FapQLKfylmLMgf0T3a4p55i265uAbMdfLMhdTxjq4i/LSFXOOjIEmvhPGejrKrXkv0VtRUTEt1grUiD2WFySlW9uIb3pJ6Ttic8yxxndwz4c5+y5Ww22Ndcx/IK7LqarzbaJD3xg0+dJH81vDVY7MgmbuopndYj7ias58z5N/91WjjApqf4m1cAvhdhMvsU5r2m0czR/J6I/l8r3xaFJ6Q97AtZfag2XmNlwsFmeS65D19XdfS/REd9wHoMEP0tBTxH6b+7/AIAuILRjqjXCaTRTUPJKUTr7UD+oB6DYS7yX+nx7uP9DUORin0vIOh8PhcDgcDofDcS/xHy9uT5QZKSdoAAAAAElFTkSuQmCC>

[image14]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGcAAAAWCAYAAADdP4KdAAACqElEQVR4Xu2YO2hUQRSGYwRf+MZV3NfdFy5ZwULwgYWINmoj+MBOJQpCOktjZyVBxAcIWtkINgoGQWRBUURFFAn4KIIajCEKVhamENl8hz0nmR13VwsX0Ts//Nw55/wzu5w/M3OzXV0BAQEB/z9yudx2P2fI5/PlKIp6s9ns3nQ6vdSvB3QI2virsObXBJh2jNpX+Fg08CPc4esC/iDK5fICmvyD3XBfm/6TORhzUOrFYnG5xIwPyBz4HW719QEdQCtzyL2BVY6ykuUw6IrqX7ragA6hjTlVrfVZDnO2mR5usrzsLuIeGSeTyXmM1zLstrrsVI7Q9RZ76JbjlZ26i/FM5u7xBbFFK3OaAV2/6icKhcIinqOOWVXMu8PzCfwMv9DwxTwvw0+Mn8JBNEtsPUxZQ+0VfAgH4Dh87X5mrGHN9fM+SqXSbHTDqj8juUqlMouGH9LcWwxbpXLZAUPwNjwhsSRVd8HWjOpmDDhxXxTMmYY27JfmYMJx1T7nHppr+VQqlW62BvpL8kLh5lT3wotPWszxmCEesjj2aNZYH3qn3JO7w69xNK2Q+Rjxwc1jzjnyR9ycftY7J94Nv9l3gCOZTGadO8cFn1GI6nfh7/K6v8Y/BW1KS3P03niWSCTmW44mrba7gxeAZbrGVNMFzDtLrtfNqW7Ey/WgPRVN/y81zhG60NXEFu3MkTcvGveAer+bJ36EORUZ666SNd67Gt05h92c6kadeOr+0fiiahpMjS20Gc3MmYEB1+TugFuMaHfCCXkZEBHHUFLXaDCH+LzfZNW55tRkvsX6i0WNz9lvuVjCTPFJY+a0qytvqGbMzTN3EB719eQ2RPWfftz8LThG7SbPu/A0HOYPYl/jNw34K8CMlfLEoI3sms1+PSAgICAgICAgdpgEK1f7iOCUdDUAAAAASUVORK5CYII=>

[image15]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACoAAAAWCAYAAAC2ew6NAAADIElEQVR4Xu2VSWhTURSG01oHcFZikKR5SRoojShIFMXiVHWhOFQQKbgQRFd15YTVigt3gpuCA4IidFHFoQiuFBFEUSiIFaUUhwqCUgSVCroQid9Jzo2n1/TRnSL94efd+5//3HfenV4kMob/BIlEYn4QBP3CZDJ5KZPJTPc9AuKD8Xh8tq8XQXC9rznkcrkJ6XR6BZ79dXV1c/y4QzabnYbnQCqV2pLP58d7sYnE3sCjUqAUA1/C3Wqprq2tXcwHHCe/xeYWQSAHL5NQ8GMCvixBrA++gKfgB/xrfR96E/yqntfwMUyb+A55B7l57bfDTopq4/lJYnAA9v4eFWCYgfgDPlRTxUKD0ktvyKxqXwoZgg3Gswx+Y8zD0o9Go1Po36P/zHg65B0sf1z7G2RcF1etQd5ntTJkiWQAoR8TiM4sNLo+7Znqv2Y8d+GQXW5Zfjsm7QvSd1uH+FL6t4x/knwYbHbaMIQVSlJK9Wqroz3VD1iHZafm37EeKUj0WCw2WXNkaxTwr9T+GfK3SRttFf13Mgl2jGEIK1QHH6qgP9KcVtn8WsBN66mvr58qupx0lcbR78Z3RU//W7cCtF8xziaTXhE1IxVK8kb0z77uCiV+iOdJzR+231yhssROk+VFuw574EKn077o2iMibEZTpX32sYJ+X3OOBKXDJe2rnkeKKnDlLLe6D7mS7H3Kx+8h7wk8aH2hheoSffH1oHT1yIxu59mq+d3Wo3dqgfs3ZnUL4ifgae1W0+5jzHMaK19tRYQVijYX/oz8eZh6NaeJmWuRNs/b1iMF6pg1VnfAv4R4v1xl0pf7XMc85nuLCCtUILp/GtHew+/yEv0hSH6P9ZAzb6QxdVs8h6udhn+N+Im1WW8ZoynUHgi2wyz1dxlP8R6NmNkjpzlkTDmAHVZjnybFL7eI1YtwBXqUpS5Dl/AB7GTjb+Y5KMttPQJe0BiU/t1bYXdQ+uWWT7aD/PMZZ5GvC/DvhQPaPu/HRwVmMkvyPl4U9WMGVUHpJtjlfrk+iLX7mgUffBZPV2D+Wn8Fcmh8zQeruIBHla+PYQz/Gn4BG2kK9Bsuol8AAAAASUVORK5CYII=>

[image16]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAG4AAAAWCAYAAAAhKqlXAAAA0ElEQVR4Xu3XLQoCQRjG8UURi0mYICz7ASsG4xTxCl7AbjJ5ALPRI4hpL6EYDSJewGjyGD5T32IxvML/By/LzjPtYYbdLAMAAAB+JsbYs2v4D92qqtZlWb41Z7137AY4luf5UMVtVeKzKIpN0zR9uweOqbilCnyovFc6iTaHcypvofJu6fSFEAY2h3MqbqoSL+kU1nU9sTkc0lU5U2GtZm4zOJSuSZV20vNgMzilsq66Ho/6yhzbDI6oqJXmrtlrRjaHUyprp3+2YNcBAACArz4tjx3Dxk8tRwAAAABJRU5ErkJggg==>

[image17]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAL8AAAAWCAYAAACR+U0gAAAENElEQVR4Xu2aXYhVVRTHZ4qQQqHMCb0zc8+ZjxilF2VARcVvopdAAq0myw/oRSGFSVLxa2TwUWTQodSZCIay0hchUnTChxLsIRCEQlIEKxVFYSTFRPS35uzNrFl3roz3Gshl/eDPOee/117McP/n3n32vVVVjuM4jvNUSdP0rSRJbljfcSoWAv8OuomuonvcBOfz+fwcW6dpaGhIrKehz1p6fIzesGOPo6mp6TXmLGX+QjumKbW/4wyDID0gRNsJ/VTOr3CcyfECmmZr6+rqxuN3UvOeHRNaW1tfoNchavai7+RmQltt3Ugwbx21D8O8G+j7lpaWcbqmnP6OUwDhORiOU9AVTqsJ2GcSMlVzWoIpnwocLxcLP2OH0Z/xmk+IN2WerhkJatai/9ACuW5sbMxzfkkCbupK6u84BRDiiWhVOJ8s4Sf0n0ig0AVbLzB+jLE26zN/nsxjfJv28fpramrGas+SZMuuE9qj347wdwwugcrp71QIvNgnQyhEt1gn19uaCEH50noaljEv0uM2aovhF7++vr5Jlji2XigWfrw/QjgXa5/rXfjd2rOE/2Wn9tLsAVz8c6Gm5P5OBSChDGteWSYsQGvQXdRua/Ea0GnrW0LARL+jgVwuN8HWaIqE/3m8+9Inbx6W8baik9qzyDzCvkl7XM+Pf1tVmf2dCiAx744CIVmJfw39IEuDUDcNnSUoy229hbreGLKgv1lLT7d1EcZ/TM2aXx5M43zGZugxvC3oZ+1ZwtwN2ovLHFG5/Z0KgBf+K+sJ+C8TgE40EEJySW4KW1cMwt7CnK9jwJJst2WSrRNGeufHeyXOteHkehPjZ7RnCXOHhV/e4WPPcvs7FQIBWIj6kmzno2C5oyEUy6xnocdqDtVptuaXnZw0yfb7f7W1goQffWh95vwTAjrL+LIs6dOeJYR6o/bSoWXPX6GmnP4nnkAf2PnOs0E1L84dgvEtAdzG+TeoS74csoUCY6esp+Gh9vUkBCqGX3zOj8ZzSwj/R9an/qz0YmyR9rneRb892rPIPGo6tJcOPfD+FmpK7u9UALz4bbW1tXXG60HXUbvs3ogXdnG6CcbnutYi39RCPz1fDeEf3O3heAT9YusFCT+1K6xP/YEQzqXap/YL9L72LDIPdWmPPsuDP7iTU05/pwLgxe+1nkCI5ybZF1GyNOhGl9HFpMi6XUOYWuUYwy9z0L/oU1srhPCvtH46tEzZrH2uf4o3pZDL5V7C2y9HVTMgfeO1QL8O6ZcPuzuj7e84oyaE6hQ6l2Q/F9hnf1aQz7ZXJXgFYuxtVfocXg8930Xrk+xm3K3GJfwT8Prt9wh4a5hzXubR8ww6zvlEXVM1iv6O88QQtsXJU/pVZ5ptv8qDaMHvgx5Hc3PzGLmZmL+Ey2o7Him1v+OMiCxDCN5s6zuO4ziO4ziO4zjO/8kjT7V+MrW+iJwAAAAASUVORK5CYII=>

[image18]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAL8AAAAWCAYAAACR+U0gAAAFAUlEQVR4Xu2abWjWVRjGtzKi6EWrhe3t/Lc9sV6+ZOuNipwmUUQgiln2LvTF2atZGVkZ1Yc+SEiN3kyEUWb2JSgyXQyqUftgDYRENCSr9SKtFhYWsn73zjnb7d2eMcMgHu4LLv7nvs71P88jz3Ue7/N/VlXlcDgcDscRRVEUV4cQ9lnd4ahYEPh58Gf4PTzAJtjZ2Nh4ufWBKcxfC5fjucROCpi7plQqnaS15ubmk3U9EVpaWk7ntRewzmw7p8F8B7474bl2zuGYNAjSQUL0OIE+j/GABJvrbjgjewhwI3Uvvq+5fgqHYRfeqXot6j70P+CWxB74q/aUA2vfk9bdCPfBt1pbW0/Unra2tmPwbWDu+eQ7AFdqj8MxaRCeV9P1bDjAsJqAPSQhE722tvZ49M8J9m3qnm4JKp7NEkilb0sBHqFsloaGhgvyfDng7YB/wllSp822B240vk1wV66bmpquktfRHodjUiDQ0+EdaXwWQRogsHen8O4WnfoWxkNwab6PQLdQHxSf2RQS/k7RuJ6PNCXPTYQQ264tWmONJ9L7GGmBqGdKzft5TPvQumtqak7QmqNCwYe9NYVCOEif3GA9GQRlndU06uvrj2ON3+CiHH7RJdzMnSJj1rgS/S+4S7ch+D9I72E0tGh94s/1ZJHWeVJrRTyAi749eXZIzfpztI/6GfROrTkqEBLK1PNKmzALLgmxx15mvWhNsNfqFilgwi/hEG3OadYzDo7C+0u679ksSvhTaLvg2qLMwdhC1sG7QmvU7fm9UR4d4gaU8B9yGEdbCbdqzVGBCObbUUBIbkf/Ab7LeGbyzYD9BOVm67fA91oOWeK39NIXWZ9GEdsa8e6X/jzrvN5nIbYwi+FS+J2sr+8dD2mt5VqTf0vSh+V/nDxGv1j70B6FH2vNUYHgg19vNQH6VALwVIi9uYRkj2wK6ysHwt7KPa/ngIX4tOUM68sIMdTyLXyr0d/TPTn1fPFpz3hIr3lI+OUbPr8fxtPy2IafeoVsOq05KhQEYHaIbYU8+fhHu6NBKK63mgVrLOZSXcSefy/XIsTn/X3WK2DufuZusHo54B/kfdxldY0U6oe1Voy1Pd8kz8iGg5dqX4htT5fWLMLYo9fJ8CZ7v+P/gWo+nN8JxpvyDcv4DbhGfhyyRgFzPVbT4FB7ZkiByuEXnfE7eaxRxBZrMNfpwCxPdWRuIeMddmM0xt8GJnwWL++B+1ZprRg78G5Lnn6p7YFaDrx4n9OaowLBh7+orq6u3mhr4U9wmYRRtBTKToLxovZa0O5gC92seWoK/8jTHq5vw0+0l/m5aF/IoTtr6Tn7Jhlz/UjCae8L8UA+X2sW6b41WpPzStJHnuRwfUVq9AXax/t6Cd6oNUcFIpQ5PBLCK5jrDbE16IR74Vdhgr49gzC1yTWHX+6B++ED2UPgL0zrzcPXrrge7em0zjrG/eJVa5+DNiybK2vpR7OX5Zo16iG87+dawNqr5F7p/VPdLjV8RPuoP8yb3uE4LKRQ9cDtIf65wAv6eT716hS6chztwVnrPuofQ9yAspFkvY48L5BHqWjd+XeEDLQl3L8T3isHWLiZ8XTtqYqPWOUR6kLxhbjZVxuPw3F4IGxzwhH4q07WmQYflLZFzhR2fiKUSqVjue86gj2XstrOZxTx7CEH3dG/P3I4/jWkDSF4l1nd4XA4HA6Hw+FwOByO/xJ/A4CWm7wMU8NsAAAAAElFTkSuQmCC>
