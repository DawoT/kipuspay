---
doc_id: roadmap-fase-6g
alias: Roadmap
authority: normativa
owner: "@DawoT"
fase: "6G"
sprints: "50–53"
---

### FASE 6G — Flujo del Cliente (KipusPay v8.1, sprints 50–53)

> Cierra la transición del "aha moment" del onboarding hacia la operación diaria: subir el catálogo sin teclear 1,500 productos, cambiar turnos sin cerrar caja, atribuir ventas al vendedor en <1s, y que el cliente descubra y configure las capabilities de su rubro. Detalle de entidades: Arquitectura §5.3 reglas 34–37. **Capabilities, no forks** (ADR-ARCH-002); cada claim GTM se descongela solo tras su Quality Gate.

#### Sprint 50 — Alta rápida de catálogo (Escáner Rápido + Venta Rápida)
**Capabilities:** `catalog.quick_add`, `sales.quick_line`  
**Referencia:** Arquitectura §5.3 regla 34; `products.barcode`; CatalogImporter (Sprint 21) · **Agentes:** Staff Mobile/Producto (owner, Modo Dueño), Staff Frontend (caja), Staff Backend ACID, Staff Design

**Entregables:**
- **Escáner Rápido** en Modo Dueño/Admin: cámara del celular (`BarcodeDetector`/`getUserMedia`) lee `products.barcode`; si existe → edita stock/precio; si no → crea producto con nombre + precio en ~3s. Sin depender de CSV ni de importador.
- **Venta rápida sin catálogo:** línea genérica en caja (`sale_items.is_uncatalogued`), precio dentro del umbral sin authz; no descuenta stock; queda marcada como "pendiente de catalogar" en Admin.
- Lector de barcode reutilizable (fotocheck/vendedor y escáner de catálogo comparten la misma infra).

**Criterios de aceptación:** crear un producto nuevo con cámara en <3s (Staff QA mide con gama baja); escaneo de código existente no duplica producto (upsert por `barcode`); venta rápida genérica cobra sin descuento de stock y sin corromper `sale_items`; línea sin sku jamás bloquea el cobro; `audit_events` `QUICK_ADD`/`GENERIC_LINE`; **namespace anti-colisión (edge 1A): badge `EMP-12345` se resuelve como vendedor y producto `12345` como artículo — 0 falsos positivos en 500 escaneos mixtos; `EMP-` rechazado como barcode de producto**; **sync offline de venta rápida (edge 2A): una venta rápida hecha offline sincroniza aceptando `manualPriceCents` (dentro del umbral), sin `Product not found`, con IGV default de tenant y audit `GENERIC_LINE`**.

**Quality Gate:** Staff Design (flujo en pasillos) + Staff QA; Staff Growth descongela claim "sube tu catálogo con la cámara" solo tras este gate.

---

#### Sprint 51 — Handoff de turno + Equipo (invitaciones y PIN/badge)
**Capabilities:** `ops.shift_handoff`, `ops.team_invite`  
**Referencia:** Arquitectura §5.3 reglas 35–36; `cash_register_sessions` (§5.2) · **Agentes:** Staff Backend ACID (owner), Staff Frontend (caja), Staff Mobile (Owner), Staff Security (PIN), Staff Design

**Entregables:**
- **Handoff de turno sin cierre Z:** PIN temporal de un solo uso (hash + TTL, verificado server-side) transfiere la sesión que **sigue OPEN**; log `cash_register_shifts` por operador; atribución real por `sales.user_id` + `sale_items` por venta.
- **Conteo ligero intermedio opcional:** `interim_required` en política del tenant → el saliente confirma efectivo (diferencia → `SHIFT_TRANSFER` con `cash_diff_cents`) sin emitir cierre Z.
- **Equipo:** invitación de cajero/vendedor (email/link) + emisión de **PIN de caja** y **badge barcode** (`users.pin_hash`, `users.badge_barcode`).
- **Atribución de vendedor <1s en carrito:** escaneo de badge o PIN del vendedor setea `sale_items.seller_id` a nivel carrito (override por ítem), sin menú desplegable largo.

**Criterios de aceptación:** transferencia en <5s sin cerrar la sesión; PIN expira y es de un solo uso (reuso → 401); 0 ventas huérfanas: toda venta del tramo queda atribuida al operador real; si `interim_required`, la diferencia se audita y no bloquea la transferencia; invitación no duplica usuarios (único por email); atribución de vendedor <1s en prueba con 200 SKUs; `audit_events` `SHIFT_TRANSFER`/`TEAM_INVITE`; **badge `EMP-` único por tenant (edge 1A): 0 colisiones `users.badge_barcode` vs `products.barcode`**; **desglose por operador (edge 1C): tras 2 tramos con `SHIFT_TRANSFER`, el ticket Z del cierre muestra la diferencia por tramo (`cash_register_shifts`) y el Modo Dueño atribuye el faltante al turno correcto**.

**Quality Gate:** Staff Security (PIN/credenciales) + Staff Backend ACID + Staff Design; Staff PM confirma que el arqueo Z real sigue siendo del cierre de sesión (regla 11).

---

#### Sprint 52 — Product Tour + Setup Checklist ("segundo día")
**Capabilities:** `onboarding.tour`  
**Referencia:** Arquitectura §5.3 regla 37a; GTM §6.2 (onboarding) · **Agentes:** Staff Frontend (owner), Staff Design, Staff PM, Staff Content (copy de tooltips)

**Entregables:**
- **Product Tour** post-onboarding activado **por las capabilities del tenant** (ADR-ARCH-002): tooltips contextuales según rubro ("Como eres restaurante, activamos las comandas de cocina — configura aquí tu pantalla de chef"); versión por rol (Dueño vs Cajero).
- **Checklist de setup del "segundo día":** logo, impresora, invitar cajero, activar facturación, subir catálogo — barra de completitud en Admin/Modo Dueño; nudge contextual sin bloquear la caja.
- **FAQ in-product** contextual por capability habilitada.

**Criterios de aceptación:** 0 usuarios sin haber visto el tour de su rubro (se omite si ya vendió); checklist visible y no bloqueante (la caja nunca depende de completarlo); tooltips sin jerga (validado por Staff Content); el tour no re-aparece si el usuario lo cierra (persistencia local); métrica de completitud del checklist instrumentada.

**Quality Gate:** Staff Design (sin fricción) + Staff PM; Staff Growth usa la métrica de completitud para la campaña "segundo día" (email/soporte).

---

#### Sprint 53 — Troubleshooter de hardware
**Capabilities:** `hardware.diagnostics`  
**Referencia:** Arquitectura §5.3 regla 37b; PrinterTransport (Sprint 25) · **Agentes:** Staff Hardware (owner), Staff Frontend (Admin), Staff QA/Chaos, Staff Design

**Entregables:**
- **Asistente visual de diagnóstico** en Admin → Configuración (Impresión/hardware): botones *"Probar impresora USB"* / *"Buscar impresoras en mi red"* / *"Probar balanza"* / *"Probar vitrina"*.
- Oculta la escalera WebUSB → WSS → Bluetooth (Sprint 25) y el diagnóstico de red detrás de estados claros (✓/✗ con causa y "paso siguiente"); log de diagnóstico (`HARDWARE_DIAG`) para soporte remoto.
- Autodetección de ancho de papel 58/80 mm y reimpresión de prueba.

**Criterios de aceptación:** 0 conceptos técnicos (WebUSB/WSS/IP) visibles en el flujo principal; cada fallo muestra causa comprensible + siguiente acción (no solo "error"); diagnóstico resuelve ≥90% de los casos de impresora no configurada sin chat de soporte; prueba de impresión <30s; log `HARDWARE_DIAG` con timestamp para soporte.

**Quality Gate:** Staff Hardware + Staff QA/Chaos (prueba con impresora no configurada y balanza desconectada) + Staff Design; Staff Principal aprueba el cierre según RACI.

---

