---
doc_id: arch-11-market-matrix
alias: Arquitectura
authority: normativa
owner: "@DawoT"
section: "11"
---

## **11. Matriz Comparativa de Mercado & Hoja de Ruta de Prompts**

### **Matriz Comparativa**

| Dimensión | Bsale / Alegra / Siigo | SAP Business One / Odoo | KipusPay v8.0 → v9 |
| :---- | :---- | :---- | :---- |
| **Latencia Percibida** | **300ms+** | **50ms+** | **Sub-50ms** Global Edge |
| **Garantía Transaccional** | Best-effort | Transaccional Tradicional | Transaccional D1 ACID |
| **Costo Operational / 1k Tenants** | Licencia por tienda (Alto) | Licencia + Servidores | ≈ $10.00 – $20.00/mes |
| **ERP Nativo (CxP/CxC/OC)** | Add-on costoso | Integrado complejo | Integrado Nativo en DDL |
| **Sincronización Offline** | Básica | No aplica | Chunked Sync + Recon. |
| **Migración desde competidor** | N/A (son el origen) | Proyectos SI | **FASE 7 Sprint 21** — Bsale/Alegra/CSV (`CatalogImporter`) |
| **Pagos locales en caja (Yape/Plin/MP/tarjeta PE)** | Fuerte en categoría | Varía / add-on | **FASE 7 Sprint 22** — `PaymentAcquirer` (Stripe = solo billing SaaS) |
| **Puente al contador (Contasis/Concar)** | Frecuente | Nativo ERP | **FASE 7 Sprint 23** — `AccountingExporter` |
| **API pública + webhooks venta/CPE** | Maduro en planes altos | Maduro | **FASE 7 Sprint 23** — capability `integrations.api` |
| **WhatsApp de comprobante** | Común | Add-on | **FASE 7 Sprint 24** — `MessagingSender` |
| **Fidelización** | Común en planes altos | Add-on | **FASE 7 Sprint 24** — `loyalty.points` (light; no oversell) |
| **GRE / percepciones** | Según producto | Fuerte ERP | Post-MVP (ADR-FISCAL-001); no MVP v8 |

### **Prompts para Agentes de IA**

1. **Fase 1 (DDL v8.0 & Migraciones D1):** *"Genera el archivo DDL SQL v8.0 para Cloudflare D1 incluyendo tenants, branches, cash_registers (con line_width y paper_width_mm), cash_register_sessions, users, customers, taxes, product_taxes, products, inventory_movements, suppliers, purchase_orders, accounts_payable, accounts_receivable y cash_register_expenses con índices optimizados y soft deletes."*  
2. **Fase 2 (Router Middleware & ACID Engine):** *"Implementa tenantAndAuthMiddleware, verifyStripeSignature con WebCrypto y processOfflineSaleAtomic en TypeScript para Cloudflare Workers usando db.batch() atómico y guards SQL con rollback de la secuencia, además de validación Zero-Trust de impuestos y precios."*
3. **Fase 3 (Firma XML WebCrypto & Queue Worker):** *"Desarrolla el Worker de Cloudflare Queues que consuma mensajes de ventas, genere el XML UBL 2.1 con impuestos IGV e ICBPER, y lo firme con WebCrypto API usando el certificado .pfx del tenant."*  
4. **Fase 4 (Modo Vitrina & WSS Hardware):** *"Escribe el componente SvelteKit para el Modo Vitrina (Customer Display) conectado mediante WebSockets a la sesión activa del cajero, junto con el conector LanWssPrinterStrategy adaptativo para anchos de 58mm y 80mm."*

