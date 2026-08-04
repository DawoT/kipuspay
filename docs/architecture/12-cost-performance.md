---
doc_id: arch-12-cost-performance
alias: Arquitectura
authority: normativa
owner: "@DawoT"
section: "12"
---

## **12. Análisis de Costo Operativo y Performance Estimado (v8.0 → v8.2)**

| Métrica | Estimación en Cloudflare Edge Stack (v8.0) |
| :---- | :---- |
| **Tiempo de Respuesta API (P95)** | **desde 12ms** (SLO vinculante: P95 < 50 ms — Proceso §9.1) |
| **Tiempo de Invalidation por Suspensión** | **< 10 s** (Durable Objects; acotado por el TTL 5–10 s del caché de isolate, §3) |
| **Garantía de Atomicidad SQL** | **100%** ROLLBACK en caso de fallo de stock |
| **Escrituras Concurrentes por Shard** | **PENDIENTE-VALOR** por Shard D1 |
| **Costo Estimado para 1,000 Comercios** | **≈ $10.00 – $20.00/mes** |
| **Costo Estimado para 1,000,000 comprobantes/día** | **≈ $25.00+/mes** |

**Nota v8.2 (margen):** offloading cliente (§7.5) + `KIPUSPAY_PSE_DIRECT` (sin fee OSE por defecto) + `usage_counters` UPSERT dentro de la misma tx de venta ⇒ costo marginal Edge por comprobante ≈ **1 write D1 adicional** (+ R2 del XML async). Analytics Engine **no** entra al path de facturación de sobregiro.

**Procedencia de estas cifras (v8.2):** la tabla venía del documento original con los
valores incrustados como imágenes LaTeX que la exportación truncó tras el primer
operando. Se transcribió exactamente lo legible: los valores completos tal cual
(`100%`, `≈ $10.00 – $20.00/mes`) y, cuando solo sobrevivió la cota inferior, se
declara como cota (`300ms+`, `desde 12ms`, `≈ $25.00+/mes`) en vez de inventar el
límite superior. El único valor cuyo operando se perdió por completo —escrituras
concurrentes por shard— queda como `PENDIENTE-VALOR`; ninguna cifra se estimó. Esta tabla es
**estimación de costo/performance, no presupuesto**: el número vinculante para
implementar y para el gate de release es el SLO de Proceso §9.1 (hot path
P95 < 50 ms; SSE premium P95 < 2 s). Staff SRE debe re-medir y declarar los
`PENDIENTE-VALOR` antes de cerrar el gate del Sprint 0.
