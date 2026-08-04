---
doc_id: arch-01-principles
alias: Arquitectura
authority: normativa
owner: "@DawoT"
section: "1"
---

## **1. Visión General del Sistema y Principios de Diseño**

El objetivo de KipusPay v8.0 es ofrecer rendimiento extremo (Sub-50ms en Edge), costo operacional cercano a $0.00 en etapa inicial y escalabilidad horizontal para soportar +10,000 comercios, +100,000 sucursales y +1,000,000 de comprobantes diarios sin bloqueos de concurrencia ni duplicaciones contables.

### **Los 11 Principios Fundamentales (v8.0 → v8.2)**

1. **Edge-First Native & Dynamic Sharding:** Cero dependencias de Node.js o contenedores tradicionales. Ejecución directa sobre V8 Isolates en Cloudflare Workers con sharding horizontal dinámico de bases de datos Cloudflare D1.  
2. **Domain-Agnostic Core (Capabilities) & Modular Tax Engine:** El motor de cobro/stock/caja **no ramifica por vertical de marketing**. El runtime pregunta **capabilities** del tenant (`inventory.batches`, `orders.kds`, … — ADR-ARCH-002), no `if (vertical === 'pharmacy')`. Los impuestos (IGV, ICBPER, IVA, etc.), tipos de documento e identidades tributarias se desacoplan vía `taxes` / `product_taxes` y se calculan strictly en el servidor. `vertical_type` es solo onboarding/analytics/playbooks (GTM), nunca eje del hot path.  

3. **Zero-Trust Client Execution & Anti-Tampering:** El frontend del POS es un cliente no confiable. Todos los precios, tipos de cambio (Forex), descuentos, impuestos y deducciones de stock se calculan e imponen de forma estricta en el servidor antes de autorizar la persistencia.  
4. **Multi-Branch, Split Payments & Cash Control:** Aislamiento estricto de inventarios por sucursal (branches), pagos fraccionados múltiples (sale_payments) y vinculación obligatoria a sesiones de caja abiertas (cash_register_sessions) para arqueos y reportes Z.  
5. **SaaS Monetization, Soft Caps & Fail-Closed Revocation (v8.2):** Control de vigencia de Trial/planes con HTTP 402 **solo en features premium** (Modo Dueño, multi-caja, reportes, API) — **nunca en cobro ni emisión**. Arranque incluye un cupo mensual de comprobantes; el **excedente se factura** (sobregiro, GTM §4.1 / Arquitectura §4.1) — **jamás se apaga la caja** en hora punta. El upgrade por capacidad (segunda caja, local, Dueño) sigue vigente. Periodo de gracia ante pago fallido (GTM §4.3). Suspensión de tenants en tiempo real vía webhooks Stripe/MercadoPago con firma criptográfica; si el control de revocación no está disponible, las rutas protegidas responden 503 y no autorizan acceso.  
6. **Máquina de Estados Estricta, Formalización Progresiva & Pipeline Fiscal SUNAT:** KipusPay opera en tres modos (`INTERNAL_CONTROL` | `FORMALIZING` | `ELECTRONIC_ISSUER`). **NV** = control interno (`NOT_APPLICABLE`). CPE: Factura `01` se envía **unitaria** (plazo máx. **3 días calendario**); Boleta `03` y NC/ND de boleta van por **Resumen Diario** (plazo máx. **7 días calendario**). Canal de transporte: puerto `FiscalTransport` (ADR-FISCAL-002) — default **PSE KipusPay directo a SUNAT**; OSE/PSE tercero como adaptadores. **No** se usa “contingencia SUNAT” como eufemismo de “aún no hay certificado” (ADR-FISCAL-001). Guards: régimen×modo, RUC en factura, ID si boleta ≥ S/ 700, CDR `ACCEPTED` antes de NC.  
7. **Zona Horaria Oficial (UTC-5) y Skew de `issuedAt`:** Normalización America/Lima; `issuedAt` offline aceptado solo dentro de ventana de skew máxima **±6 horas** vs reloj de servidor; la fecha fiscal (día del Resumen Diario y `must_submit_by`) se deriva de la fecha Lima autoritativa tras reconciliación.  
8. **Atomicidad Transaccional Garantizada (Financial ACID Guarantee):** Ninguna operación que altere inventario, caja o cuentas por cobrar/pagar puede persistir parcialmente. Toda escritura multi-tabla se ejecuta en un `db.batch([...])` D1 atómico (la API no expone `db.transaction(callback)`); las validaciones se preparan antes y los guards SQL hacen fallar el batch si cambia una precondición. **Todo monto se almacena como INTEGER en centavos** (convención `*_cents`, §5.0) — la garantía financiera es falsa con coma flotante.
9. **Ledger Completo del Ciclo Económico (Full Economic Cycle Ledger):** El sistema modela el ciclo financiero completo: cuentas por cobrar (CxC), cuentas por pagar (CxP), órdenes de compra, proveedores y egresos de caja chica como entidades de primera clase en el DDL.  
10. **Resiliencia de Red Adversarial y de Dispositivo:** Payloads masivos se fragmentan proactivamente (*chunking* con snapshot de perfil CRM por venta; la consolidación de clientes es **server-side** vía upsert idempotente LWW — §6, con una única excepción de single-writer en cliente: el Service Worker consolida los snapshots del **mismo** cliente nuevo (`local_client_id`) dentro del mismo turno para emitir una sola escritura — SYN-11 enmendada; el servidor sigue siendo la autoridad final con LWW por `profile_updated_at`), las respuestas de idempotencia devuelven el estado reconciliable completo y ninguna rutina asume una respuesta HTTP exitosa como única fuente de verdad. Incluye límites de IndexedDB (`QuotaExceededError`), presión de memoria en dispositivos de gama baja y alerta al cajero antes de corromper la cola offline.
11. **Zero-Dependency Client & Computational Offloading (v8.2):** El Edge **no renderiza** tickets, QR ni PDF. Cero dependencias npm de runtime en el POS para generación visual/hardware (pdfmake, qrcode.js, etc.). QR, ticket e ESC/POS se resuelven con Web Platform APIs + Worker + (si hace falta) código **vendorizado** fijado en el repo. Presupuesto de bundle enforceable en CI (Arquitectura §7.5).

### **1.1 Principios de ingeniería de código (KipusPay v8.1) — DRY, SOLID, hexagonal**

Contrato staff para que el corpus no escale como monolito improvisado. **No reabre** ADR-FISCAL-001 ni el pipeline §5.2. Detalle enforceable: Proceso (principio rector + Quality Gate transversal).

#### Auditoría de partida (veredicto)

| Patrón | Estado pre-v8.1 | Remediación |
|---|---|---|
| Zero-Trust / ACID / multi-tenant / ADRs fiscales | Fuerte | Mantener |
| DRY de dominio | No especificado | Una regla = un módulo dueño; Proceso/GTM **citan** Arquitectura, no re-especifican |
| Agnosticismo de vertical | Parcial (tax sí; ops ramificaba por enum) | Capability model (ADR-ARCH-002) |
| SOLID / boundaries | Débil (`processOfflineSaleAtomic` God Function; solo Strategy de impresión) | Pipeline + ports |
| Crecimiento de código | Sin mapa de packages | Monorepo objetivo abajo |

#### DRY de dominio

1. **Single source of truth:** reglas de cobro, stock, fiscal y caja viven en Arquitectura (+ packages `domain-*` al codear). Proceso describe sprints/gates; GTM describe claims comerciales — ambos **referencian**, no duplican matrices normativas.
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
| `FiscalTransport` | Envío/consulta CPE (ADR-FISCAL-002) | `KIPUSPAY_PSE_DIRECT` (default), `ose_*`, `pse_third_party` |
| `PrinterTransport` | Entrega de ticket ESC/POS o sistema | WebUSB → WSS LAN → Web Bluetooth → `window.print()` / SystemPrint |

Stripe/MercadoPago en middleware de **suscripción KipusPay** ≠ `PaymentAcquirer` de punto de venta.

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

| Capability | Sprint (Roadmap) | Empaquetado GTM típico |
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

| Capability | Sprint (Roadmap) | Empaquetado GTM típico |
|---|---|---|
| `integrations.catalog_import` | 21 | Migración / objeción #1 |
| `payments.qr_wallets` | 22 | Cobro PE (Yape/Plin/MP) |
| `payments.card_acquirer` | 22 | Retail / Culqi-Niubiz |
| `integrations.accounting_export` | 23 | Crece+ / contador |
| `integrations.api` | 23 | Cadena (API + webhooks) |
| `messaging.whatsapp_receipt` | 24 | Post-venta / activación |
| `loyalty.points` | 24 | Cadena (fidelización light) |

**Capabilities canónicas (FASE 6B, reglas 13–17, sprints 28–32):**

| Capability | Sprint (Roadmap) | Empaquetado GTM típico |
|---|---|---|
| `sales.returns` | 28–32 | Devoluciones con política N días |
| `purchasing.three_way` | 28–32 | Control de proveedor / OC |
| `pricing.promotions` | 28–32 | Promos y tramos |
| `catalog.variants`, `catalog.uom` | 28–32 | Multi-variante / unidades |
| `sales.layaway` | 28–32 | Apartados |
| `ledger.chart_of_accounts` | 28–32 | Diario contable (retail) |

**Capabilities canónicas (FASE 6C, reglas 18–22, sprints 33–37):**

| Capability | Sprint (Roadmap) | Empaquetado GTM típico |
|---|---|---|
| `sales.quotes` | 33–37 | Cotizaciones/presupuestos |
| `purchasing.returns` | 33–37 | Devolución a proveedor |
| `ledger.store_credit` | 33–37 | Crédito de tienda / gift cards |
| `sales.installments` | 33–37 | Cuotas / pago en partes |
| `sales.commissions` | 33–37 | Comisiones de vendedor |

**Capabilities canónicas (FASE 6D, reglas 23–27, sprints 38–42):**

| Capability | Sprint (Roadmap) | Empaquetado GTM típico |
|---|---|---|
| `inventory.locations` | 38–42 | Ubicaciones de inventario |
| `inventory.serials` | 38–42 | Números de serie |
| `inventory.scale` | 38–42 | Venta por peso / balanza |
| `catalog.price_labels` | 38–42 | Etiquetas de precio |
| `data.backup` | 38–42 | Export / restore del negocio |

**Capabilities canónicas (FASE 6E, reglas 28–30, sprints 43–45):**

| Capability | Sprint (Roadmap) | Empaquetado GTM típico |
|---|---|---|
| `orders.customer_orders` | 43–45 | Preventa / pedido a cliente |
| `sales.recurring` | 43–45 | Recurrentes / membresías |
| `mobile.push`, `client.mobile_pos` | 43–45 | Push + caja móvil |

**Capabilities canónicas (FASE 6F, reglas 31–33, sprints 46–49):**

| Capability | Sprint (Roadmap) | Empaquetado GTM típico |
|---|---|---|
| `analytics.forecasting` | 46 | Predictiva (Cadena, freeze 46) |
| `compliance.lpdp`, `platform.dr` | 47–48 | LPDP / DR-BCP (Cadena) |
| `analytics.agentic_insights` | 49 | Insight / briefing (Cadena/Enterprise, freeze 49) |

**Capabilities canónicas (FASE 6G, reglas 34–37, sprints 50–53):**

| Capability | Sprint (Roadmap) | Empaquetado GTM típico |
|---|---|---|
| `catalog.quick_add`, `sales.quick_line` | 50 | Escáner con cámara + venta rápida (gate 50) |
| `ops.shift_handoff` | 51 | Handoff de turno sin cerrar caja (gate 51) |
| `ops.team_invite` | 51 | Equipo: invitación + PIN/badge |
| `onboarding.tour` | 52 | Product Tour + checklist "segundo día" |
| `hardware.diagnostics` | 53 | Troubleshooter de impresora/balanza |

> FASE 8 (sprints 25–27) no introduce capabilities de producto: añade infraestructura transversal (`print outbox` §7.5, `cupo` §4.1, `FiscalTransport/breaker` §8.1) — no forman parte del empaquetado GTM.

Playbooks de onboarding (farmacia vs resto) **activan bundles de capabilities**; no crean forks de código.

