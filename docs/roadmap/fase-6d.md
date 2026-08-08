---
doc_id: roadmap-fase-6d
alias: Roadmap
authority: normativa
owner: "@DawoT"
fase: "6D"
sprints: "38–42"
---

### FASE 6D — Inventario Avanzado (KipusPay v8.1, sprints 38–42)

> Profundiza el inventario: dónde está cada unidad (ubicación), su identidad individual (serie), su masa (peso variable) y su comunicación con el anaquel (etiquetas), además del derecho del negocio a **su propio backup completo**. Detalle de entidades: Arquitectura §5.3 reglas 23 y 25; §5.6 regla 24; §5.8 regla 26; §5.9 regla 27. **Capabilities, no forks** (ADR-ARCH-002).

#### Sprint 38 — Ubicaciones / racks por sucursal
**Estado:** Cerrado
**Capabilities:** `inventory.locations`  
**Referencia:** Arquitectura §5.3 regla 23; ADR-0022; Sprint 18 (conteo) · **Agentes:** Staff Backend Datos (owner), Staff Frontend (Admin), Staff QA

**Entregables:**
- `inventory_locations` + `inventory_location_stock` + lotes multi-rack; stock de venta = suma por ubicaciones activas.
- Conteo físico **por ubicación** (extiende Sprint 18); transferencia intra-sucursal con `audit_events`.
- Picking guiado para OC (listado de ítems por ubicación).

**Criterios de aceptación:** 0 stock perdido entre ubicaciones (suma invariante); conteo por ubicación concilia con total de la sucursal; transferencia intra-sucursal no altera el total.

**Quality Gate:** Staff QA (conteo concurrente por ubicación); Staff PM valida claim ubicaciones/racks tras gate. QG: `docs/ops/s38-inventory-locations-qg.md`.

---

#### Sprint 39 — Números de serie
**Estado:** Cerrado
**Capabilities:** `inventory.serials`  
**Referencia:** Arquitectura §5.6 regla 24 · ADR-0023 · **Agentes:** Staff Backend Datos (owner), Staff Frontend (caja), Staff QA

**Entregables:**
- `serial_numbers` con estados `AVAILABLE → SOLD → RETURNED | IN_TRANSIT`; asignación en recepción.
- Venta exige escaneo/ingreso de serie por `sale_item`; devolución (Sprint 28) revierte la serie.
- Búsqueda por serie para garantía/audit; duplicado = 422.

**Criterios de aceptación:** 0 venta sin serie para productos serializados; 0 doble asignación; devolución libera la serie al estado correcto; reporte de garantía por serie reproducible.

**Quality Gate:** Staff QA (concurrencia de asignación) + Staff Security; Staff PM valida claim electrónica/activos tras gate. QG: `docs/ops/s39-inventory-serials-qg.md`.

---

#### Sprint 40 — Venta por peso variable (balanza)
**Capabilities:** `inventory.scale`  
**Referencia:** Arquitectura §5.7 regla 25 · ADR-0024 · **Agentes:** Staff Frontend (owner), Staff Hardware (balanza USB), Staff Backend ACID
**Estado:** Cerrado — GOV-APROBADO

**Entregables:**
- Captura de peso en caja (balanza USB o manual) para `product_type = WEIGH`; precio por unidad de base; redondeo de monto en servidor.
- Override de peso con authz (`WEIGHT_OVERRIDE`, reusa Sprint 17).
- **Mueve "balanza" del backlog v10 a sprint.**

**Criterios de aceptación:** 0 montos redondeados en cliente; peso > 0 siempre; override sin authz = 403; precio × peso recalculado por servidor (0 manipulación); **heartbeat de balanza (edge 2C): desconexión WebUSB (suspensión/cable) → interfaz roja "Peso Manual" exige tipeo (jamás 0.00 silencioso); peso manual sobre umbral requiere PIN de supervisor y registra `WEIGHT_OVERRIDE`**.

**Quality Gate:** Staff Hardware + Staff QA + Staff Security; Staff PM descongela el claim acotado "venta por peso con balanza compatible o ingreso manual autorizado". QG: `docs/ops/s40-inventory-scale-qg.md`.

---

#### Sprint 41 — Etiquetas de precio / estantería
**Estado:** Software GREEN; claim/hardware NO-GO hasta matriz física y firma A+V
**Capabilities:** `catalog.price_labels`  
**Referencia:** Arquitectura §5.8 regla 26; §7.5 PrinterTransport · ADR-0025 · **Agentes:** Staff Frontend (owner), Staff Hardware, Staff Data

**Entregables:**
- `price_label_templates` (producto, precio vigente según lista, barcode, ancho 58/80mm).
- Impresión vía `PrinterTransport` (WebUSB/WSS) + reimpresión en lote; nunca edita precios, solo imprime.
- `audit_events` `PRICE_LABEL_REPRINT`.

**Criterios de aceptación:** etiqueta refleja el precio del servidor (0 precio manual); impresión por outbox (Sprint 25); fallo de impresora degrada sin romper la caja.

**Quality Gate:** contrato automatizado GREEN; activación y claim bloqueados hasta
certificación física 58/80 WebUSB/WSS y firma Staff Hardware + Staff QA independiente.
QG: `docs/ops/s41-price-labels-qg.md`.

---

#### Sprint 42 — Export / restore total del negocio
**Estado:** Software GREEN local condicionado; claim/producción/cutover NO-GO hasta staging real y firma A+V independiente
**Capabilities:** `data.backup`  
**Referencia:** Arquitectura §5.9 regla 27 · ADR-0026; respalda GTM §5.7.1 ("tus datos son tuyos") sin desbloquear el claim · **Agentes:** Staff SRE (owner), Staff Data, Staff Security, Staff Growth (copy)

**Entregables:**
- KPBK1: export BUSINESS de D1 + objetos R2 referenciados, versionado y cifrado por envoltura KMS + restore **solo dry-run**; no bloquea la caja.
- Registry exhaustivo BUSINESS/DERIVED/EPHEMERAL/SECRET y exclusiones manifestadas; migración 0035. Restore apply, cutover y rollback de datos quedan en Sprint 48.
- Instrumentación base para medir RPO/RTO en Sprint 48; sin objetivo operativo medido en S42. Borrado LPDP pertenece a Sprint 47 y no se promete como inmediato.

**Criterios de aceptación:** contenido decrypted/hash KPBK1 reproducible para el mismo epoch y ciphertext aleatorio entre backups; restore dry-run hace 0 escrituras BUSINESS D1/R2; 0 secreto/clave en claro en D1/R2; registry sin tablas tenant no clasificadas, incluidos hijos legacy; la caja nunca se detiene durante backup/retry/abort.

**Quality Gate:** software GREEN con evidencia automatizada local en `docs/ops/s42-data-backup-qg.md`; la Security Review encontró 1 HIGH + 3 MEDIUM, remediados con tests, sin segunda revisión limpia. Capability default-off. Staging Cloudflare/R2/Workflow/Secrets/KMS real y firma humana A+V independiente siguen pendientes; por tanto Staff Growth mantiene congelado “exporta todo tu historial sincronizado”. Restore apply, cutover, RPO/RTO y claim DR permanecen bloqueados hasta Sprint 48.

---

