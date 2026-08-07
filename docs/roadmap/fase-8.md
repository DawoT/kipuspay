---
doc_id: roadmap-fase-8
alias: Roadmap
authority: normativa
owner: "@DawoT"
fase: "8"
sprints: "25–27"
---

### FASE 8 — Blindaje v8.2 (resiliencia, costo marginal, cliente zero-dependency)

> Protege márgenes Edge, canal fiscal bajo caídas SUNAT y UX en 3G. **Puede adelantarse** el Sprint 26 si hay volumen real antes de cerrar FASE 7. Referencias: Arquitectura Principios 5/11, §4.1, §7.5, §8.1. Capabilities vía ADR-ARCH-002.

#### Sprint 25 — Cliente zero-dependency (offloading)
**Capabilities:** `client.offloading`, `hardware.print_fallback`  
**Referencia:** Arquitectura §7.5 · **Agentes:** Staff Frontend (owner), Staff Hardware, Staff QA/Chaos, Staff Principal (bundle budget)

**Entregables:**
- Web Worker: ESC/POS nativo, `OffscreenCanvas` QR (o `GS ( k` en térmica), chunking/dedupe IndexedDB.
- `PrinterTransport` con escalera WebUSB → WSS → Bluetooth → `window.print()`; print **outbox** post-commit persistida en **IndexedDB** (no memoria); pre-flight al abrir caja.
- CI gate: presupuesto de bundle gzip; **cero** nueva dep npm runtime sin ADR.
- Vitrina: `BroadcastChannel` (mismo origen).

**Criterios de aceptación:** UI no bloquea >100ms en compile ESC/POS; failback imprime si USB falla; venta ACID OK aunque print falle; **F5 con ticket en outbox → el ticket sigue imprimible tras recarga**; outbox dentro del guardián de cuota; PR con dep pdfmake/qrcode.js rechazado; **API `outbox.pendingCount()` disponible y consumida por el gate de cierre Z (edge 2D, Sprint 17): reporta PENDING/FAILED exactos en 500 ciclos de caos de impresora**.

**Quality Gate:** Staff Frontend + Hardware + Principal (bundle). **Estado:** Cerrado (QG `docs/ops/s25-print-outbox-qg.md`).

---

#### Sprint 26 — Canal fiscal resiliente (prerrequisito de volumen)
**Capabilities:** `fiscal.transport_plugins`, `fiscal.circuit_breaker`  
**Referencia:** Arquitectura §8.1, ADR-FISCAL-002 · **Agentes:** Staff Fiscal (owner), Staff SRE, Staff Backend ACID, Staff Mobile (alertas Dueño)

**Entregables:**
- Puerto `FiscalTransport` default `KIPUSPAY_PSE_DIRECT`; adaptadores OSE/PSE tercero con suite de contrato.
- Circuit breaker en **Durable Object** por `(transport, endpoint)`; KV solo cache de lectura.
- Lectura del breaker con **caché de 2 niveles**: in-memory isolate (TTL 5-10s) → KV (eventual 60s); DO **nunca** en hot path de lectura.
- Incrementos por fallo **coalescidos** (sampling/decimación) + jitter; no 1 request fallido = 1 incremento.
- Taxonomía 4xx negocio → quarantine (no abre breaker); 5xx/timeout → breaker.
- Scheduler por `must_submit_by`; XML en R2; cola = puntero; panel Dueño represados/cuarentena.
  - **Reversión de no aceptado (edge E-A):** panel Dueño ofrece "Anular" (NC sin CDR, §8) para CPE `REJECTED`/`QUARANTINED`/`DEADLINE_EXCEEDED`; el doc no queda atrapado en la cola fiscal. **Auto-sugerencia (R-03):** al entrar en `DEADLINE_EXCEEDED`, el panel sugiere la NC de anulación (E-A), pero exige confirmación explícita, motivo Catálogo 09 y auditoría persistente `CREDIT_NOTE_NO_CDR`; nunca se ejecuta silenciosamente.

**Criterios de aceptación:** 10× 5xx abren breaker en todos los isolates; 10× 4xx **no** lo abren; colapso SUNAT simultáneo (miles de isolates): DO recibe **≤10 lecturas/s por DO en ventana móvil de 60s**, nunca 1 por request; factura cercana a deadline no queda detrás de 40k boletas; mensaje venenoso no bloquea cabecera; **CPE no aceptado se anula con NC sin CDR (E-A): 0 docs atrapados en represados/cuarentena en 100 ciclos, con confirmación y `CREDIT_NOTE_NO_CDR` persistente en todos los casos**.

**Quality Gate:** Staff Fiscal + SRE + Principal. **Marcado como prerrequisito de volumen real.**

---

#### Sprint 27 — Costo y dinero (sobregiro + loyalty locks)
**Capabilities:** `billing.usage_overage`, `loyalty.reservations`  
**Referencia:** Arquitectura §4.1, §5.4 loyalty_reservations · **Agentes:** Staff Backend ACID (owner), Staff Security, Staff Data, Staff Growth (copy cupo)

**Entregables:**
- `usage_counters` UPSERT en la misma tx de venta; cron batch Stripe metered con `idempotency_key`; `billing_overages`.
- **Cupo por documento emitido (§4.1):** NC/ND `07/08` y `NV` cuentan `doc_count + 1` (idempotency `usage:{docId}`); baja de boleta y RC no suman ni restan; cupo se consume al emitir, no al anular.
- **Prohibido** facturar desde Analytics Engine.
- `loyalty_reservations` RESERVED→REDEEMED/EXPIRED atadas a `sale_idempotency_key`; barrendero; loyalty offline = off.
- GTM/FAQ alineados al cupo Arranque 1,000 + S/ 0.05 (si no cerrado en paralelo).

**Criterios de aceptación:** 0 llamadas Stripe en hot path de cobro; doble cron no doble-cobra; reintento offline reusa reserva; caja nunca 402 por cupo.

**Quality Gate:** Staff Security + Backend ACID + Growth (copy).

---

