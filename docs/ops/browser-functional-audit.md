---
doc_id: ops-browser-functional-audit
alias: "—"
owner: "@DawoT"
authority: derivada
---

# Auditoría funcional navegador — `docs/ops/legal_and_sales_guide.md`

> Reporte técnico para el agente corrector. Sin screenshots: cada hallazgo lleva
> evidencia reproducible (ruta, archivo:línea, request/response). Estado por ítem:
> `VIGENTE` (probado funcionando), `EN PREPARACIÓN` (claim congelado, reflejado),
> `FALLA` (evidencia de bug) y `CONFIG` (gap de setup/flag, no bug de producto).

- **Fecha:** 2026-08-15
- **Entorno:** worker `wrangler dev` :8787 (flags de `wrangler.jsonc` + `FEATURE_CATALOG_SELLABLE` añadido), POS `vite preview` :4173 (todos los `PUBLIC_FEATURE_*`), marketing :5180. D1 local con migraciones aplicadas hasta 0055.
- **Tenants de prueba:** `t_5f812e8a700e43a8` (Auditoria Comercio), `t_2d48a0ef885f499b` (Casa Aurora), `t_597a6e05c1564b68` (Offline Test). Todos `INTERNAL_CONTROL`, plan Arranque, trial hasta 2026-09-14.

---

## 1. Resumen ejecutivo

- El POS, la web pública y el onboarding **funcionan en su mayoría** (A/B/C/D/E/F/G probados).
- **5 fallas de producto** merecen corrección inmediata: (1) regresión `FORBIDDEN_ROLE` en el dashboard de Modo Dueño, (2) `/owner/alertas` usa `fetch` sin `x-tenant-id`, (3) ticket imprime TOTAL sin IGV y RUC hardcodeado, (4) onboarding pierde la sesión de caja tras reload, (5) `/admin/backups` falla por race + muestra código crudo.
- **4 gaps de configuración** (`FEATURE_CATALOG_SELLABLE`, `FEATURE_ANALYTICS_FORECASTING`, `FEATURE_PAYMENTS_*` ausentes de `wrangler.jsonc`; migraciones 0054/0055).
- **Claims congelados** ("en preparación") están correctamente reflejados en `/precios`, historial ("Anular boleta está en preparación") y el módulo LPDP (solo admin), pero **no** en `/ayuda` (inconsistencia).
- **Datos demo residuales** visibles en varios formularios y en el dashboard owner.

---

## 2. Cobertura por ítem (estado por página)

### A. Web pública (`apps/marketing-web`)
| Ítem | Estado | Nota |
|---|---|---|
| A1 `/precios` — 4 planes, matriz, "Más elegido" | VIGENTE | Arranque 49/490, Crece 129/1290, Cadena 349+39, Enterprise cotización; congelados marcados "En preparación" |
| A2 `/seguridad` — 99.9%, SEV-1 1h/4h, retención 5 años, sin aceptación antes CDR | VIGENTE | FALLA menor: no detalla SEV-2/SEV-3 (guía Parte IV §2 sí) |
| A3 `/terminos` — 30 días, licencia, S/0.05, NV no SUNAT, reclamaciones | VIGENTE | FALLA menor: "tribunales de Lima" vs "Distrito Judicial de Lima Centro, Perú"; sin cita Ley 29571 |
| A4 `/privacidad` — ARCO, anonimización, 5 años | VIGENTE | FALLA menor: sin cita Ley 29733 / D.S. 003-2013-JUS |
| A5 `/reclamaciones` — acuse + constancia | VIGENTE (tras fix) | 503 `DB_UNAVAILABLE` hasta aplicar migraciones 0054/0055 (ver §3 F-10); acuse REC-20260815-14998D |
| A6 `/ayuda` FAQs | FALLA (claims) | offline, insights y WhatsApp descritas como live SIN "en preparación" (guía Q1/Q7/§6) |
| A7 home FAQ Q8/Q9/Q10 | VIGENTE | gracia 3 días, nunca apagar caja, devolución coherente |
| A8 blog referidos | VIGENTE | claim = implementación exacta (ver §2 B4) |
| A10 footer | FALLA menor | falta `facturacion@kipuspay.com` (guía lo lista como canal oficial) |

### B. Onboarding (`/empezar` → POS)
| Ítem | Estado | Nota |
|---|---|---|
| B1 4 pasos → bootstrap real | VIGENTE | Badge EMP-99491, PIN "los ves una sola vez", trial +30d verificado |
| B2 referidos | VIGENTE (unit) | código real `KP564B685M5A` en `/owner/yo`; copy = "Un mes gratis para quien refiere y un mes para quien llega por tu enlace" |
| B3 "Ir a cobrar" claim → POS | VIGENTE | token+tenant en URL, claim, sesión "Caja Abierta" |
| B3 reload tras claim | FALLA | ver §3 F-4 (sesión de caja perdida tras refresh) |

### C. Caja & Cobros (`/caja`, `/caja/cobro`)
| Ítem | Estado | Nota |
|---|---|---|
| C1 venta rápida + IGV 18% | VIGENTE | S/18.90 → total S/22.30 |
| C2 cobro → sync → NV en historial | VIGENTE | NV01-001 S/22.30 (200 OK) |
| C3 ticket / reimpresión | FALLA | TOTAL imprime base sin IGV (S/18.90) y RUC hardcodeado (ver §3 F-1/F-2) |
| C5 catálogo sellable | VIGENTE (tras flag) | 401 sin sesión / lista con sesión; flag ausente de `wrangler.jsonc` (F-8) |
| C6 escáner rápido | VIGENTE | barcode quick-add creó producto real (Agua Mineral 1L, 350) |
| C7 offline-first | VIGENTE | venta S/7.50 offline → cobro S/8.85 → sync → NV01-001 |
| C8 Yape/Plin ámbar offline | VIGENTE | alert exacta "Verifica visualmente la app del cliente..." + captureStatus=MANUAL (ver F-7: IDs demo `sale-demo`/`sp-demo`) |

### D. Control de caja
| Ítem | Estado | Nota |
|---|---|---|
| Cierre Z ciego | VIGENTE | denominaciones 200..0.10; "calcula lo esperado solo al confirmar" |
| Movimientos de caja + PIN supervisor | VIGENTE | 8 tipos; "sobre el umbral requiere PIN del supervisor" |
| Reimpresión con sello COPIA | VIGENTE | "copia lleva sello obligatorio COPIA y queda en auditoría" |
| Handoff turno (PIN 1-uso) | VIGENTE | "La sesión sigue abierta... PIN de un solo uso" |

### E. Modo Dueño (`/owner`)
| Ítem | Estado | Nota |
|---|---|---|
| Hoy (dashboard) | FALLA | 5 widgets con 403: F-1 (FORBIDDEN_ROLE) y F-3 (Cadena); datos demo `demo-quarantine`/`b-demo` (F-6) |
| Alertas | FALLA | F-2 (fetch sin x-tenant-id) → "Sin alertas abiertas" falso |
| Finanzas AR/AP | VIGENTE | "El diario contable sigue en solo lectura" |
| Yo (plan, referidos) | VIGENTE | plan Arranque · INTERNAL_CONTROL; código referido |
| Previsiones | VIGENTE (parcial) | disclaimer "No es garantía de venta"; `FEATURE_ANALYTICS_FORECASTING` off → "Capacidad desactivada (flag off)" |
| Asistente | VIGENTE | "El servidor calcula los números; no es una IA que opina" |
| Configuración | VIGENTE | selector plan solo Arranque/Crece/Cadena (sin Enterprise self-serve, correcto); "Cancelar cuenta" presente |

### F. Admin
| Ítem | Estado | Nota |
|---|---|---|
| Catálogo (variantes, UOM, serie) | VIGENTE | creación real OK |
| Inventario (conteo ciego, merma R2, GRE) | VIGENTE | merma con evidencia R2; GRE traslado cat.18 |
| Promociones | VIGENTE | formulario + `max_stack_json` |
| Crédito tienda | VIGENTE | "El vale se emite en Caja" |
| Recepción OC parcial | VIGENTE | series por línea; CxP por cantidad recibida |
| Factura proveedor 3-way | VIGENTE | "OC × Recepción × Factura; CxP al confirmar match" |
| Devolución proveedor | VIGENTE | crear/cerrar/cancelar |
| Diario contable | VIGENTE | solo lectura; asientos nacen con venta/cobro/apartado/arqueo |
| Integraciones | VIGENTE | Contasis/Concar, API keys (revocación server-side), webhooks HTTPS (sale.created/cpe.accepted/cpe.rejected), import CSV |
| Equipo | VIGENTE | PIN de caja + badge EMP-… + roles (Cajero/Supervisor/Admin) |
| Clientes (LPDP) | VIGENTE | consentimientos, copia de datos, anonimización |
| Membresías | VIGENTE (código) | mora no bloquea caja; claim marketing sigue "en preparación" |
| Series / GRE | VIGENTE | escáner + terminal POS |
| Backups | FALLA | F-5 (race + raw `BACKUP_AUTH_REQUIRED`) |

### G. Caja avanzada
| Ítem | Estado | Nota |
|---|---|---|
| Apartado | VIGENTE | "el comprobante nace solo al convertir a venta" |
| Cotización | VIGENTE | "congela precio del servidor; no reserva stock" |
| Cuotas | VIGENTE | "Solo Supervisor+ cobra cuotas; interés no reduce el AR" |
| Vale / gift card | VIGENTE | "venta registra comprobante con cupo; saldo impone el servidor" |
| Devolución | VIGENTE | "NC (07) o NV_RETURN según formalización; motivo obligatorio"; crédito tienda opcional |
| KDS / Salón | VIGENTE (código) | comandas en tiempo real (WS), mesas, dividir cuenta; claim marketing "en preparación" |
| Anular boleta | EN PREPARACIÓN | historial: "Anular boleta está en preparación." |

---

## 3. Hallazgos (para el agente corrector)

### F-1 [CRÍTICO] Regresión `FORBIDDEN_ROLE` en endpoints de Modo Dueño
- **Síntoma:** `/owner` (Hoy) y widgets relacionados fallan 403; la página muestra métricas vacías.
- **Causa:** los routes de `apps/worker-api/src/index.ts` invocan el handler SIN propagar el rol:
  - `index.ts:1005` `runListExpiredQuotesHttp(c.env, jwt?.tenantId ?? '')`
  - `index.ts:1327` `runOwnerThreeWayReportHttp(...)`, `:1368` returns, `:1403` store-credit, `:1434` installments, `:1498` commissions
  - Los handlers exigen `role` (`role = ''` default) y devuelven 403 si no es owner/admin, p. ej. `quote-routes.ts:230` → `FORBIDDEN_ROLE`, `purchasing-three-way-routes.ts:225-229`.
- **Respuesta real:** `GET /api/owner/quotes/expired` con JWT `role=owner` → `{"error":"Forbidden","code":"FORBIDDEN_ROLE"}`.
- **Por qué no lo cazan los tests:** `inventory-ops-routes.test.ts:768` llama `runOwnerStockAlertsHttp(mockDbEnv(), 't1', {})` sin role; la firma con default `''` no se valida en el gate.
- **Fix sugerido:** pasar `(c.get('user') as { role?: string })?.role ?? ''` en esas 6 llamadas (como ya hace `index.ts:2603` en `/api/insights/briefing`).

### F-2 [ALTO] `/owner/alertas` usa `fetch` sin `x-tenant-id`
- **Síntoma:** alertas muestra "Sin alertas abiertas. Todo al día" falso; 3 errores 403 en consola (`stock-alerts`, `layaways/overdue`, `payments/uncaptured`).
- **Causa:** `apps/pos-web/src/routes/owner/alertas/+page.svelte:23-27` llama `fetch(base + "/api/owner/stock-alerts?...", { headers: { authorization } })` — sin `x-tenant-id` → el middleware responde `TENANT_HINT_MISMATCH` (403). Con header correcto, `stock-alerts` y `layaways/overdue` devuelven 200.
- **Fix sugerido:** usar `apiFetch` (inyecta `x-tenant-id`) como hace `/owner/+page.svelte:168`.

### F-3 [MEDIO] `/api/insights/briefing` exige plan Cadena
- `runBriefingHttp` → `assertCadenaPlusPlan` → `PLAN_REQUIRES_CADENA` para tenant Arranque. Widget del dashboard owner falla con console.error. Por diseño, pero el dashboard debería ocultar el widget (plan-gate) en vez de mostrar error.

### F-4 [CRÍTICO] Onboarding: sesión de caja se pierde tras reload
- `apps/pos-web/src/lib/auth/onboarding-claim.ts`: `lastClaim` es variable de módulo en memoria. Tras refresh, `readLastOnboardingClaim()` → null → `onboardingSession` null → `onCharge` bloquea con "No hay una sesión de caja abierta. Inicia sesión o abre la caja." (véase `+page.svelte` guard de `onCharge`).
- El claim SÍ devuelve `cashRegisterSessionId` real (sesión abierta en bootstrap; `onboarding-routes.ts:368`). Falta persistirla (p. ej. en localStorage/sessionStorage) y restaurarla en el shell.

### F-5 [ALTO] `/admin/backups` falla por race y muestra código crudo
- **Síntoma:** alerta `BACKUP_AUTH_REQUIRED` en la página, sin copy ni retry; no se puede crear exportación.
- **Causa:** el `onMount` de `apps/pos-web/src/routes/admin/backups/+page.svelte:164-177` lee `readAdminAuthenticatedSession()` ANTES de que `+layout.svelte` (onMount async: `loadAuthenticatedAppShellSession`, `+layout.svelte:300`) cargue la sesión. `client()` en `data-backup-client.ts:92` lanza `backupError('BACKUP_AUTH_REQUIRED')` cuando `authenticatedFetch` es null.
- **Nota:** `/api/auth/session` responde 200 con `role:owner`; el flujo no es de producto sino de timing + UX (error crudo).
- **Fix sugerido:** esperar `sessionLoaded` (estado ya existe vía `readAdminAuthenticatedSessionState`) antes de `refresh()`; mapear códigos de error a copy amigable.

### F-6 [MEDIO] Datos demo residuales visibles en UI
- `/owner` dashboard: `demo-quarantine` QUARANTINED S/150.00 (widget "Fiscal · represados/cuarentena"); campo "Sucursal: b-demo" (percepciones/retenciones).
- `/owner/previsiones`: "Sucursal: b-demo".
- `/caja/cobro` `chargeOnline` usa `saleId: 'sale-demo', salePaymentId: 'sp-demo'` (IDs demo en una transacción real).
- Formularios con valores demo por defecto: inventario "Evidencia R2 Key: `r2/merma/demo.jpg`", GRE "Cantidad del ítem `p1`" 1000000, factura 3-way `p1`/`F001-00001`, apartado abono 500, vale "20100000000"/"Cliente vale"/11800, cuotas JSON ejemplo, cotización 2026-08-20, catálogo editor `p1`, oc `u-demo`/`c-demo`/`oc-demo`/`po-demo` (cuando aplique), equipo "branch-1".
- **Recomendación:** los prefills de ejemplo son útiles en dev, pero deben limpiarse antes de cualquier demo a cliente; los IDs demo en `chargeOnline` (`sale-demo`/`sp-demo`) son un riesgo si llegan al backend.
- **Corroborado por el gate V-27** (jerga técnica visible en `apps/pos-web`, pre-existente en el working tree): `microunidades` (membresias:188), `JSON` (integraciones:140, cuotas:39, asistente:27), `céntimos` (cuotas:36), `p-demo` (cobro:138), `userId` (handoff:35), `GTM-11` (locales:51), `s-demo`/`pm-cash` (salon/split:62,66).

### F-7 [ALTO] Ticket imprime TOTAL sin IGV
- `apps/pos-web/src/routes/+page.svelte:169`: `totalCents` se deriva de `cartTotalCents(lines)` (base antes de impuestos) → el ticket imprime S/18.90 mientras se cobra S/22.30 (payable con IGV 18%). Verificado con NV01-001 (S/8.85 imprimido vs S/7.50 base en venta offline).
- **Fix sugerido:** imprimir el importe cobrado (payable) — la UI nunca debe ser fuente de verdad de montos (invariante offline-first).

### F-8 [ALTO] Ticket imprime RUC hardcodeado
- `apps/pos-web/src/routes/+page.svelte:346`: `mockTicket.ruc: '20123456789'` incluso cuando el tenant tiene `ruc = NULL`. El ticket debe omitir el RUC (o tomar el del tenant real), nunca un valor de ejemplo.

### F-9 [MEDIO] Gaps de configuración (flags no declarados)
- `FEATURE_CATALOG_SELLABLE`: no está en `wrangler.jsonc` vars (solo en `control-plane.ts` + `sellable-catalog-routes.ts`) → `/api/catalog/sellable` 404 hasta añadirlo en runtime.
- `FEATURE_ANALYTICS_FORECASTING`: ausente → `/owner/previsiones` degrada a "Capacidad desactivada (flag off)" con 2 errores 404 en consola.
- `FEATURE_PAYMENTS_*`: `/api/owner/payments/uncaptured` → `FEATURE_OFF` (403).
- **Fix sugerido:** declarar los flags en `wrangler.jsonc` con su default para que el entorno dev los active igual que CI.

### F-10 [INFRA] Migraciones 0054/0055 faltantes en dev
- `/reclamaciones` respondía 503 `DB_UNAVAILABLE` hasta `wrangler d1 migrations apply DB --local` (0054 `platform_reclamaciones.sql`, 0055 `platform_reclamaciones_status.sql`). Gap de setup, no bug de producto; documentar en el runbook de bootstrap.

### F-11 [BAJO] Claims congelados inconsistentes entre páginas
- `/precios` marca los congelados "En preparación" ✓; `/ayuda` describe offline, insights y WhatsApp como live sin disclaimer. Alinear con guía (Q1/Q7/§6: "en preparación").

### F-12 [BAJO] Copy legal
- `/seguridad`: falta detalle SEV-2/SEV-3.
- `/terminos`: "tribunales de Lima" vs "Distrito Judicial de Lima Centro, Perú"; no cita Ley 29571.
- `/privacidad`: no cita Ley 29733 / D.S. 003-2013-JUS.
- footer: falta `facturacion@kipuspay.com`.

### F-13 [INFO] `/owner` dashboard no refleja ventas del día
- Tras NV01-001 S/8.85 y S/22.30 (mismo día), `day-summary` muestra 0 — rollup `daily_financial_rollups` con `"live": false` ("Actualizado al conectar · no en vivo"). Confirmar si es esperado (rollup diario 08:00) o debe haber un refresh tras sync.

---

## 4. Claims "en preparación" verificados (congelados, correctamente reflejados)
- Comandas/KDS y Salón: implementados en código (`/kds`, `/salon`, `/salon/split`, WS), marketing los declara "en preparación" — coherente (no se venden aún).
- Membresías: módulo funcional en admin, claim congelado.
- Insights/asistente: "El servidor calcula los números; no es una IA que opina" + briefing plan-gated (Cadena+).
- LPDP ARCO: self-serve de cliente congelado; el módulo admin (consentimientos/copia/anonimización) es lo vendible.
- Anular boleta: reflejado "en preparación" en el historial.
- Emisión SUNAT en vivo: no probada (tenant `INTERNAL_CONTROL`); PSE default y "no afirmamos aceptado antes del CDR" presente en copy.

## 5. Prioridad sugerida para el agente corrector
1. F-1, F-2 (dashboard owner roto), F-4 (sesión de caja perdida), F-7/F-8 (ticket incorrecto).
2. F-5 (backups) y F-6 (IDs demo en `chargeOnline`).
3. F-9 (flags), F-10 (runbook), F-3 (widget plan-gate).
4. F-11/F-12/F-13 (copy y claims).