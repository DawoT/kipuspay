---
doc_id: arch-02-global-diagram
alias: Arquitectura
authority: normativa
owner: "@DawoT"
section: "2"
---

## **2. Diagrama de Arquitectura Global (v8.0)**

┌─────────────────────────────────────────────────────────────────────────────────────────────────┐  
│                                   CLIENT / POS (SvelteKit)                                      │  
│ - Offline-First Engine (IndexedDB + Outbound Event Queue + Batch/BOM Allocation)                 │  
│ - Chunked Sync Dispatcher (Lotes de 25-35 tx, perfil CRM snapshot + upsert LWW server, backpressure-aware) │  
│ - Hardware Router (LanWssPrinterStrategy / Dynamic Width 58mm-80mm / Capacitor Bridge)          │  
│ - Modo Vitrina (Customer-Facing Display) — diferenciador visual en punto físico                 │  
│ - DLQ Remediation, Cash Management UI & Feature-Gated Views                                     │  
└────────────────────────────────────────────────┬────────────────────────────────────────────────┘  
                                                 │ HTTPS / WebSockets (Durable Objects)  
                                                 ▼  
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐  
│                               CLOUDFLARE EDGE WORKER (Hono.js)                                  │  
│                                                                                                 │  
│  ┌───────────────────────┐   ┌────────────────────────┐   ┌──────────────────────────────────┐  │  
│  │ Tenant Context Router │───│ Fail-Closed DO Guard   │───│ Plan & Trial Guard (402)         │  │  
│  │ (KV Cache + DO Flag)  │   │ (DO Instant Revoke)    │   │ (Trial Ends + Plan Limits)       │  │  
│  └───────────────────────┘   └────────────────────────┘   └──────────────────────────────────┘  │  
│                                           │                                                     │  
│  ┌────────────────────────────────────────┴──────────────────────────────────────────────────┐  │  
│  │     CORE DOMAIN, ERP ENGINE & AUTH SYNC (Zero-Trust, Tax Engine & UTC-5 Timezone)             │  │  
│  │  - Auth Sync Middleware (IdP -> D1 UserSession) - Server Tax & Forex Engine                   │  │  
│  │  - Zero-Trust Price & Exchange Rate Validator  - Cash Session Check                         │  │  
│  │  - Formalization Mode × Document Type Guard    - Service Inventory Bypass                    │  │  
│  │  - Multi-Payment Split Engine                  - Credit Note Double-Refund Guard             │  │  
│  │  - D1 Explicit Transaction Engine (ACID Guard) - AR/AP Ledger Engine (CxC/CxP)                │  │  
│  │  - Idempotent Sync Reconciliation Responder    - Cash Session Expense Guard                  │  │  
│  └───────────────────────┬──────────────────────────────────────────────────────────────────┘  │  
└───────────────┬──────────┴────────────────┬───────────────────────────┬─────────────────────────┘  
                │                           │                           │  
                ▼                           ▼                           ▼  
┌──────────────────────────┐    ┌──────────────────────────┐    ┌─────────────────────────────────┐  
│ Dynamic D1 Shard Router  │    │ Cloudflare KV + DO       │    │ Cloudflare Queues               │  
│ (Tenant -> Shard Map)    │    │ Tenant Config & Revoke   │    └────────────────┬────────────────┘  
└───────────────┬──────────┘    └──────────────────────────┘                     │ Async Ingestion  
                │                                                                ▼  
   ┌────────────┴────────────┐                                      ┌─────────────────────────────┐  
   ▼                         ▼                                      │ SUNAT Async Resilient Worker│  
┌──────────────┐      ┌──────────────┐                              │ - Branch Series Resolver    │  
│ D1 Shard #1  │  ... │ D1 Shard #N  │                              │ - UBL 2.1 XML Generator     │  
│ (Tenants 1-N)│      │(Tenants M-Z) │                              │ - WebCrypto XMLDSIG Signer  │  
└──────┬───────┘      └──────┬───────┘                              └──────────────┬──────────────┘  
       │                     │                                                     │  
       └──────────┬──────────┘                                       ┌─────────────┴──────────────┐  
                  │ Async Parallel Cron Aggregator                   ▼                            ▼  
                  ▼                                     ┌─────────────────────────┐  ┌────────────────────┐  
     ┌──────────────────────────┐                       │ SUNAT / OSE / R2 Store  │  │ Dead-Letter Queue  │  
     │ Cloudflare Analytics     │                       └─────────────────────────┘  │ (DLQ Re-queue Loop)│  
     │ Engine (Global Metrics)  │                                                    └────────────────────┘  
     └──────────────────────────┘

