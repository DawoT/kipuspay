---
doc_id: ops-go-live-hardware-m4-lab
alias: "—"
authority: derivada
owner: "@KipusHardware+KipusQA"
---

# Informe M4 — Hardware Lab 58/80 2×2 + Android Go 500 · Checklist R/A/V para `go-live-hardware` CLOSED

**Fecha:** 2026-08-29 — **Lab:** OLA M4 (máximo grado, P0/P1 L3/L4, A+V humano obligatorio)  
**Owners:** Kipus Hardware (R) + Kipus QA (V) — Staff Hardware & Integraciones + Staff QA/Chaos  
**Alcance:** `go-live-hardware` (Android físico gama baja + impresoras/perfiles, GTM-26 · S41 Price Labels)  
**Tracker fuente:** `docs/ops/pending-batches.yaml` → `go-live-hardware` · `hw-printers-matrix` WAIT · `hw-android-offline` WAIT  
**QG referencia:** `docs/ops/s41-price-labels-qg.md` (software GREEN, claim/hardware NO-GO) · `docs/ops/browser-functional-audit.md` G2 · `docs/ops/claims-go-live.md` · `docs/architecture/10-printing-display.md` (PrinterTransport cascade) + `docs/architecture/05-8-catalog-price-labels.md`  
**Código inspeccionado:** `apps/pos-web/src/lib/print/printer-transport.ts` + `apps/pos-web/src/lib/printing/price-label-transports.ts` + `apps/pos-web/src/lib/hardware/PrinterPairing.svelte` + `apps/pos-web/src/lib/print/printer-pairing.ts` + `apps/pos-web/src/lib/print/printer-runtime.ts` + `apps/pos-web/src/lib/offline-sync/hw-android-offline.test.ts` (500 emulado) + `packages/print-templates/src/` (58/80)

---

## 0. Veredicto honesto (OLA M4) — NO-GO, lab requiere hardware físico

> **RESULT `go-live-hardware` = NO-GO — NO PUEDE CERRARSE CLOSED SIN DEVICES FÍSICOS.**

Software está **GREEN simulado** (golden bytes deterministas, transports virtuales, outbox IndexedDB, pairing UI cableada), pero **cero** de la evidencia externa exigida por `s41`/`GTM-26` existe en físico. La invariante del rol — *diagnosticar un fallo real sin tocar el dispositivo; pruebas en ≥2 modelos físicos/simulados antes de declarar soporte* — no está cumplida.

**Cierre CLOSED requiere:** 2 impresoras térmicas físicas (1×58 mm + 1×80 mm, dos marcas/modelos distintos documentados) + 2 Android Go reales (1 GB RAM) + fotos/tickets + pairing UI en navegador real + pruebas disconnect/timeout + 500 ventas offline con `doze`/`F5` + firmas A+V humanas. Hasta entonces el claim **"etiquetas de precio en impresoras/perfiles compatibles"** permanece congelado y `pos_terminals.paper_width_mm` no se activa en producción (capability `catalog.price_labels` default-off).

Este informe **no escribe código**. Documenta el checklist R/A/V que convierte el WAIT en CLOSED cuando el lab se ejecute. Ningún `FEATURE_*=1` se commitea; todo flag es runtime `wrangler deploy --var` (Proceso §8.1, `go-live-staging-checklist.md` Fase 3).

---

## 1. Lectura y contrato (por qué este lab no es «fix de código»)

**Leído completo antes de este informe:**

- `pending-batches.yaml` bloque `go-live-hardware`: `AGENDADO_AL_FINAL`, gates `[s41, GTM-26]`, gaps `hw-printers-matrix` (G2 WAIT, matriz 58/80 WebUSB+WSS, Pairing UI C7 pending) y `hw-android-offline` (G2 WAIT, 500 ventas gama baja, depende G1 `fcm-vapid-real`).
- `s41-price-labels-qg.md` matriz física pendiente: 58 mm WebUSB allowlisted (foto/ticket, fingerprint, endpoint, acentos, barcode escaneable, disconnect), 80 mm idem + corte/timeout, Bridge WSS LAN paired/allowlisted (certificado, host, ACK/nonce, reconnect, pérdida de red) — todo **NO-GO**.
- `browser-functional-audit.md` G2 (auditoría s53/41): asistente visual `hardware.diagnostics` con 4 botones normativos, validación de copy sin jerga, autodetección 58/80 y print <30 s — pendiente staging real + QA humana.
- `printer-transport.ts` (285 L): ladder `PrinterTransport` cascade **WebUSB → WSS LAN → Bluetooth → `window.print()`/SystemPrint → WhatsApp hint**, cada estrategia es adapter (`price-label-transports.ts`), nunca `if` en orquestador. `preflight()` honesto (C7): `webusb` solo si `usbDevice`, `wss_lan` solo si `wssUrl` con `wss:` + `socketFactory` + host en `allowlistedHosts` (via `new URL(host)`), `bluetooth` solo si `navigator.bluetooth`, `system_print` siempre, `whatsapp` solo si fallback inyectado. `print()` con `preferredAdapter` y fallback ordenado; `openDrawer()` solo hardware (`webusb/wss_lan/bluetooth`) con `openDrawerBytes()` ESC `p`.
- `price-label-transports.ts` (249 L): adapters puros zero-dep (invariante 10). `createPriceLabelWebUsbTransport`: `open→selectConfiguration→claimInterface→transferOut(timeout 10s)→release→close` siempre en `finally`, `allowedEndpoints`/`allowedProfiles` (vendorId/productId/interface/endpoint), `PRINTER_USB_TIMEOUT`/`PRINTER_USB_PROFILE_NOT_ALLOWED`. `createPriceLabelWssTransport`: valida `wss:` + `allowlistedHosts`, frame binario `[ver=1, nonceLen, itemIdLen×2, nonce 16B, itemId, payload]`, `randomBytes` inyectable (tests) o `crypto.getRandomValues`, ACK correlacionado `type=ACK + itemId + nonce`, `PRINTER_ACK_TIMEOUT` 10 s, `PRINTER_RECONNECT_REQUIRED` + `reconnect()` que cierra y reconecta.
- `PrinterPairing.svelte` (302 L): UI Admin → Configuración con `terminalId` (`kipuspay:pos-terminal-id`), `paperWidthMm` 58/80 (`kipuspay:pos-terminal-config`, `resolveLineWidth` 58→32/80→48), `preflight` lista `available`, `scanWebUsb` con `navigator.usb.requestDevice({filters:[]})` gesto-usuario → `pairWebUsb` (`registerUsbPrinterDevice`), `saveWss` con `validateWssUrl` (mensajes sin jerga "Usa wss:// (seguro)."), `onPaperWidthChange` → `pos_terminals.paper_width_mm` + `persistTerminalToServer` (`POST /api/pos/terminals/pairing`, fail-open best-effort, nunca bloquea caja), `runTestPrint` con `buildSaleTicketSnapshot` + `compileEscPosFromSnapshot` + `testPrintWithCurrentLadder`.
- `hw-android-offline.test.ts` (286 L): 500 ventas offline **emuladas** vía `createMemoryOfflineIdb` + `OfflineQueueStore` + `dispatchPendingSalesChunked` + judges `judgeQuotaExceeded`/`judgeNetworkAdversarial`/`judgeLowEndDevice`. Verifica offline-first (encolar nunca bloquea por red), `CHUNK_SIZE=30`, p95 <100 ms, heap <32 MiB, cuota `ALERT≥80%`/`BLOCKED 100%` con mensaje accionable, `OfflineQueueBlockedError` sin corrupción, fases `NETWORK_DOWN`→`RETRY` intacto y luego online con dedup `ALREADY_SYNCED` (5% simulado), `F5`/reload supervivencia, `doze` emulado conceptualmente. **No es evidencia física.**
- `print-templates` (`build-escpos.ts` 144 L, `build-html.ts` 101 L, `line-width.ts` 12 L, `price-labels.ts` 248 L, `print-outbox.ts` 142 L): ESC/POS zero-dep (`0x1b 0x40`, `0x1d 0x56 0x42` corte, `buildGsKQrCommands` QR `GS ( k )`, `openDrawerBytes` `1b 70 00 19 fa`), HTML fallback `window.print`, `resolveLineWidth` server-side autoritativo (`pos_terminals.paper_width_mm` impone 32/48, `lineWidth` en `TicketData` es solo fallback), `maxItemNameLen` 14/26, `sanitizePrinterText`, `formatTicketCents` INTEGER cents (DAT-12 / invariante 1), `PriceLabelTemplateV1` DSL `PRICE_LABEL_V1` allowlisted (TEXT/PRICE/BARCODE/SPACER), `encodePriceLabelBarcode` EAN8/EAN13 (checksum GS1) / CODE128 (set B, checksum mod 103), golden bytes deterministas.

**Invariantes aplicables del `AGENTS.md`:**

- **1 Dinero:** `*_cents` INTEGER; `formatTicketCents` rechaza no-enteros. OK en templates.
- **2 D1:** atomicidad `db.batch`; sin `db.transaction`/`UPSERT INTO`. Price labels usa batch server-side (s41).
- **3 ADR-ARCH-002:** capabilities por flag, no `switch(vertical)` — `catalog.price_labels` default-off.
- **7 Offline-first:** venta nunca se cae; cola IndexedDB autoritativa, reconciliación server-side, outbox no bloquea cobro (`PrinterPairing.svelte:282` "La impresión nunca bloquea el cobro (outbox IndexedDB)").
- **10 Zero-dependency runtime:** ESC/POS + HTML con Web Platform APIs + código vendorizado en `print-templates`, cero npm para render (V-24, `scripts/verify.sh` bundle ≤300 kB; observado local 111.92 kB gzip / 203.81 kB en s53).
- **Fuera de la tx ACID:** impresión JAMÁS participa en la transacción de cobro; `enqueueAndPrintTicket` best-effort tras `chargeCartOffline OK`; reintento idempotente aparte (`ackDelete` solo tras ACK).
- **Balanza/diag:** `hardware.diagnostics` con heartbeat fail-closed (SYN-13) y diagnóstico remoto `HARDWARE_DIAG` en `audit_events`.

---

## 2. Qué significa CLOSED para `go-live-hardware` (definición de done, Proceso §8.1)

`go-live-hardware` está CLOSED si y solo si **todas** estas condiciones son verdaderas con evidencia anexada y firmas R/A/V independientes (sin `V` = NO-GO):

1. **Matriz impresoras 2×2 física** (G2) firmada A+V: 58 mm + 80 mm, cada ancho en ≥1 modelo físico distinto (total ≥2 devices), WebUSB + WSS LAN ambos probados, pairing UI en navegador real, disconnect/timeout guiado, fotos/tickets/barcodes.
2. **Android Go 2× físico** (G2) firmada A+V: 2 devices Android Go reales 1 GB, 500 ventas offline por device sin pérdida ni duplicado, con `doze` y `F5`/reload, red hostil, cuota, chunked sync y feedback <100 ms p95 observado en device (no emulado).
3. **G1 desbloqueado:** `go-live-fcm` `fcm-vapid-real` no stubs (VAPID real + FCM HTTP v1, ACK `DISPLAYED` p95<10 s ≥99%) — `hw-android-offline` depende de G1 (`pending-batches.yaml: hw-android-offline depends_on go-live-fcm`).
4. **Zero claims falsos:** `scripts/verify.sh` `RESULT SUITE GREEN`, `scripts/quality.sh` GREEN (bundle ≤300 kB), `INDEX.md` sincronizado, ledger entry nueva con `red/green_run_id`, sin commits `FEATURE_*=1`.
5. **A+V humano no delegable:** R ejecuta el lab, A aprueba el veredicto, V independiente reproduce y firma; V ≠ R. OLA M4 exige P0/P1 L3/L4 con humano en loop (no solo CI).

Cualquier gap en NO-GO mantiene `pending-batches.yaml` en WAIT y el claim GTM-26/s41 congelado.

---

## 3. Estado software GREEN vs. gap físico NO-GO (por qué el lab es obligatorio)

| Capa | Software (simulado) — GREEN | Gap físico — NO-GO (requiere lab) |
|---|---|---|
| **58/80 render** | Golden bytes deterministas (`buildEscPosPayload` 32/48 col, `compilePriceLabelTemplate` con `price_cents` INTEGER, barcode EAN/CODE128, corte `1d 56 42 04`, open-drawer `1b 70 00 19 fa`) — 31 tests print, fixtures 115 workerd, chaos price-label-printing 500 ciclos 0 dup/stale/mix/bloqueo caja (s41 QG) | Ticket físico impreso con regla milimetrada, prueba de legibilidad (nombre/precio/barcode escaneable con app genérica), acentos `áéíóúñ` sin mojibake, densidad/contraste del ribbon, corte mecánico 80 mm, comprobación que ancho real coincide con `paper_width_mm` 58/80 y no con fallback `lineWidth` del cliente |
| **Transports** | `createPriceLabelWebUsbTransport` y `WSS` virtuales con `UsbDevicePort`/`SocketPort` inyectados, `withTimeout` 10 s, ACK nonce 16 B, `PRINTER_USB_PROFILE_NOT_ALLOWED`/`PRINTER_HOST_NOT_ALLOWED` fail-closed | WebUSB real: fingerprint `vendorId/productId/interfaceNumber/endpointNumber` del device allowlisted, permiso Chrome/Edge gesto `requestDevice`, `claimInterface` real, medición `transferOut` throughput, WSS real: bridge TLS `wss://192.168.x.x:port` con cert, host allowlisted en `pos_terminals`, latencia LAN, noncehex correlacionado en logs |
| **Ladder** | `createPrinterTransport` orden `webusb→wss_lan→bluetooth→system_print→whatsapp`, `preflight()` honesto (no miente si no hay device/host), `preferredAdapter` y fallback | Cascada observada en browser real: preflight lista refleja pairing persistido en `localStorage` + `pos_terminals`, caída ordenada cuando 1er adapter falla, `whatsappFallback` best-effort no bloquea caja |
| **Pairing UI** | `PrinterPairing.svelte` fields `pairing-terminal-id`/`pairing-paper-width`/`pairing-webusb-scan`/`pairing-wss-input`/`pairing-test-print`, persist `localStorage` + `POST /api/pos/terminals/pairing`, `setPaperWidth` 58/80 | Flujo humano: click «Escanear USB» → chooser Chrome → status "Impresora USB emparejada." → `pairing-list` muestra `webusb`, cambio 58↔80 con `paperStatus` "58mm→32 columnas. Se aplicará al abrir caja.", WSS con `wss://` validado y "Usa wss:// (seguro)." si falla, test print <30 s con feedback visual y sin jerga técnica |
| **Offline 500** | `hw-android-offline.test.ts` 500 encoladas en `OfflineQueueStore` memoria, p95 medido en `performance.now()` <100 ms, heap delta <32 MiB, `evaluateQuota` ALERT/BLOCKED, `NETWORK_DOWN→RETRY` y `ALREADY_SYNCED` dedup, `CHUNK_SIZE 30` → `[30,30,5]`, F5 supervivencia emulada | 500 en 2× Android Go 1 GB reales con Chrome real, IndexedDB persistente en gesto humano, `F5` real + kill Chrome + `adb shell dumpsys deviceidle force-idle` (doze) 30 min, medición p95 en device con throttling CPU 4×, memoria `performance.memory.usedJSHeapSize`, cuota real `navigator.storage.estimate()`, captura de fotos/logs/videos |
| **Diagnóstico** | `hardware.diagnostics` 4 botones (USB/red/balanza/vitrina), `DIAGNOSTIC_CAUSES` y paso siguiente, log `HARDWARE_DIAG` en `audit_events` | Diagnóstico guiado remoto sin acceso físico: operador lee causa + siguiente paso desde auditoría, valida `paper`/`puerto`/`red LAN` sin tocar device; vitrina/kiosko como capabilities no forks |

Conclusión: **simulación ≠ compatibilidad física.** El piloto 58/80 y Android Go no pueden declararse soportados hasta ≥2 modelos físicos/simulados probados (regla dura del rol).

---

## 4. Checklist R/A/V para CLOSED — desagregado en G2

> Cada fila es un **gate independiente**. Un `FAIL` individual mantiene el bloque en `WAIT`. La evidencia es **append-only**: foto/ticket/log/video con timestamp + fingerprint de device + firma R/A/V. Nada de "captura recortada" sin metadatos.

### 4.1 Bloque `hw-printers-matrix` — Matriz física 58/80 mm WebUSB + WSS LAN (2×2)

**Pass del bloque (pending-batches.yaml):** *"Matriz 58/80 mm WebUSB+WSS firmada A+V (G2)"* — owner Staff Hardware + Staff QA, `requires_av: true`.

| # | Item (RACI) | Criterio PASS (CLOSED) | Evidencia requerida (anexo físico) | R | A | V | Estado hoy |
|---|---|---|---|---|---|---|---|
| **G2.1** | Modelo 58 mm #1 — WebUSB allowlisted | Ticket impreso 58 mm (32 col) con `buildEscPosPayload` real desde navegador: `enterprise` + `RUC` (o ausente si tenant NULL, nunca `20123456789` hardcodeado), `documentType` `NV` y `01/03` CPE con IGV/fecha/adquirente/leyenda/QR GS `( k )`, `totalCents` INTEGER, `maxItemNameLen` 14, separador 32×`-`, corte `1d 56 42 04` observable. | Foto ticket junto a regla + screenshot `PrinterPairing` preflight `webusb → …` + log `transferOut status=ok` + fingerprint `vendorId/productId/interfaceNumber=2/endpointNumber=3` + barcode EAN13/CODE128 escaneable (video scan con app genérica) + muestra acentos `ÁÉÍ ñ` nítidos | **R: Hardware** | **A: Principal** | **V: QA ind.** | **NO-GO** (virtual only) |
| **G2.2** | Modelo 80 mm #2 — WebUSB allowlisted | Ticket impreso 80 mm (48 col) idem, `maxItemNameLen` 26, corte limpio sin hilachas, `lineWidth` 48 resuelto server-side desde `pos_terminals.paper_width_mm=80` (no fallback cliente). Probar `paperWidthMm` switch 58→80 en UI y re-print sin reload. | Foto ticket 80 mm + foto corte + screenshot `pairing-paper-width=80` + `paperStatus` "80mm→48 columnas…" + `buildSaleTicketSnapshot` lineWidth proof + fingerprint 80 mm distinto de 58 mm + ticket foto ambos anchos lado a lado | **R: Hardware** | **A: Principal** | **V: QA ind.** | **NO-GO** |
| **G2.3** | Bridge WSS LAN paired/allowlisted | Ticket por `wss_lan`: URL `wss://<lan-host>:<port>` con cert/host allowlisted en `allowlistedHosts`, frame binario con `nonce 16B` correlacionado, ACK `{"type":"ACK","itemId":"NV:NV01:00000001","nonce":"<hex>"}` en ≤10 s, `PRINTER_ACK_TIMEOUT`/`PRINTER_RECONNECT_REQUIRED` probados. | Screenshot `pairing-wss-input` `wss://192.168.1.50:8080` + `pairing-wss-status` "guardada (192.168.1.50)" + `pairing-list` incluye `wss_lan` + captura WebSocket frames (hex nonce) + log ACK correlacionado + foto ticket WSS idéntico a WebUSB | **R: Hardware** | **A: Principal** | **V: QA ind.** | **NO-GO** |
| **G2.4** | Pairing UI E2E (PrinterPairing.svelte) | Flujo completo en Chrome/Edge real sin devtools mocks: ① `scanWebUsb` gesto → chooser → "Impresora USB emparejada." ② `saveWss` con validación `wss:` + host ③ `paperWidthMm` 58/80 persistido en `localStorage kipuspay:pos-terminal-*` + `POST /api/pos/terminals/pairing 200` (ver `printer-pairing.ts:198`) ④ `preflight` lista refleja pairing ⑤ `runTestPrint` → `ok:true adapter=webusb|wss_lan` en <30 s, mensaje "Prueba enviada por … (58mm/32 col)." | Video 60 s del flujo + screenshots `data-testid` `pairing-terminal-id/save`, `pairing-webusb-scan/status`, `pairing-wss-input/save/status/error`, `pairing-paper-width/status`, `pairing-list`, `pairing-test-print/status` + `localStorage` dump + `audit_events HARDWARE_DIAG` row | **R: Hardware+FE** | **A: Principal** | **V: QA ind.** | **WAIT** (C7 pending) |
| **G2.5** | Disconnect WebUSB (cable/unplug) | Durante `transferOut`, desenchufar cable: `PRINTER_USB_TIMEOUT` o `releaseInterface`/`close` en `finally` (sin hang), error mapeado a copy accionable sin jerga ("Revisa cable o puerto USB"), reintento idempotente no duplica bytes, re-plug + `scanWebUsb` recupera sin reload. Documentar que impresión no bloqueó cobro (caja sigue cobrando). | Video unplug mid-print + log `PRINTER_USB_*` + screenshot `pairing-test-error` + prueba de 2º print OK tras reconectar + metrica "caja cobró NV02 durante fallo" (ticket 2º con número correlativo server-side, no `sale-demo`) | **R: Hardware** | **A: Principal** | **V: QA ind.** | **NO-GO** |
| **G2.6** | Timeout & reconnect WSS LAN (ACK/nonce) | ① No-ACK: bridge no responde → `PRINTER_ACK_TIMEOUT` 10 s, socket `close()`, `reconnectRequired=true`. ② ACK con nonce incorrecto → ignorado, espera timeout. ③ `reconnect()` → nuevo socket → 2º send con nuevo nonce OK. ④ Pérdida red LAN (desconectar AP) → `PRINTER_RECONNECT_REQUIRED`, luego reconectar OK. | Captura `activeSocket.send(frame)` hex + `addEventListener message` ignorado (nonce mismatch) + timer 10 s log + video AP off/on + 2º ticket OK + `pending.catch` no unhandled rejection | **R: Hardware** | **A: Principal** | **V: QA ind.** | **NO-GO** |
| **G2.7** | Timeout genérico & validación fail-closed | Probar: `PRINTER_HOST_NOT_ALLOWED` si host no allowlisted, `PRINTER_WSS_REQUIRED` si `ws:` no `wss:`, `PRINTER_USB_PROFILE_NOT_ALLOWED` si profile mismatch, `PRINTER_ITEM_TOO_LARGE` / `PRINTER_ITEM_ID_TOO_LARGE` boundaries, `PRINTER_SECURE_RANDOM_UNAVAILABLE` si `crypto` ausente. Todos degradan a `system_print` sin crash. | Logs de cada error code + screenshot copy sin jerga + fallback `buildTicketHtml` con QR SVG (`qrMatrixToSvg(qrMatrix(payload))`) impreso vía `window.print` iframe (system_print) | **R: Hardware** | **A: Principal** | **V: QA ind.** | **NO-GO** (solo audit code) |
| **G2.8** | Fotos / tickets / trazabilidad | Cada impresora: foto device + etiqueta modelo/serie, foto ticket 58 + 80, foto barcode scan OK, screenshot `pos_terminals` row (`paper_width_mm`, `printer_strategy`, `allowlistedHosts`), `verify.sh` SUITE GREEN snapshot + bundle budget. | Carpeta `docs/ops/hw-evidence/<printer-id>/` con `device.jpg`, `ticket-58.jpg`, `ticket-80.jpg`, `barcode-scan.mp4`, `preflight.png`, `terminal-row.json`, `verify.log` | **R: Hardware** | **A: Principal** | **V: QA ind.** | **PENDIENTE LAB** |
| **G2.9** | Diagnóstico remoto sin acceso físico | Desde otra sucursal/remote, leer `audit_events HARDWARE_DIAG` + `GET /api/hardware/diagnostics` (limit 50), identificar causa `PAPER_JAM`/`PORT_CLOSED`/`WSS_HOST_NOT_ALLOWED` y prescribir paso siguiente correcto (ej. "Revisa papel térmico" no "reinstala driver WebUSB"). Modo Vitrina/kiosko como capabilities (no forks) verificados por `tenant_capabilities.hardware.diagnostics` flag default-off. | Log `HARDWARE_DIAG` con `testedAtIso` + `causeLabel`/`nextStepFor` + screenshot `admin/configuracion#hardware` estados ✓/✗ + grabación soporte remoto 2 min | **R: Hardware** | **A: Principal** | **V: QA ind.** | **PENDIENTE s53** |

**Regla de modelos:** ≥2 modelos físicos/simulados distintos. Mínimo aceptable M4: **Modelo A 58 mm** (ej. XPrinter XP-58 o Epson TM-T20II 58) + **Modelo B 80 mm** (ej. Epson TM-T88V 80 o Bixolon SRP-330). Ideal 2×2: cada ancho probado en dos marcas para declarar "soportado en impresoras/perfiles compatibles" sin ladder S25.

**Zero-dependency check:** durante lab, `pnpm quality` bundle debe seguir ≤300 kB gzip; ningún `printTicket` usa npm PDF/QR (solo `qrMatrix` vendorizado + `qrMatrixToSvg`).

---

### 4.2 Bloque `hw-android-offline` — 2× Android Go 1 GB + 500 ventas offline con `doze`/`F5`

**Pass del bloque:** *"500 ventas offline + firmas Mobile+QA+Security"* — owner Staff Mobile + Staff QA, `requires_av: true`, `depends_on: go-live-fcm` (G1).

| # | Item | Criterio PASS | Evidencia física (2 devices, 500 c/u = 1000 total) | R | A | V | Estado hoy |
|---|---|---|---|---|---|---|---|
| **A2.1** | Devices físicos 1 GB | 2× Android Go reales (ej. Samsung A03 Core + Xiaomi Redmi A1, Android 12 Go, 1 GB RAM, Chrome 118+) documentados con `adb shell getprop`, `chrome://version`, `navigator.deviceMemory`, foto device + settings RAM. | Ficha `hw-evidence/android/<device-id>/device-info.txt` + foto device junto a ticket + `about:version` screenshot + `performance.memory` dump | **R: Mobile+QA** | **A: Principal** | **V: QA ind.+Security** | **NO-GO** (0 devices) |
| **A2.2** | 500 ventas offline secuenciales (offline-first) | En **cada** device, 500 ventas encoladas en `OfflineQueueStore` IndexedDB sin pérdida, feedback tap→encolado <100 ms **p95** medido en device (no-workerd), heap delta <32 MiB (`performance.memory.usedJSHeapSize`), cola sobrevive sin pérdida. Venta nunca bloqueada por red (solo por cuota 100% con mensaje accionable "Libera espacio o reconéctate"). | Video 3 min enqueue 50 muestras + `hw-android-offline.test.ts` log del device (p95 real ej. 67 ms) + `listPending()=500` dump + `chrome devtools Performance` trace + `pos-web` console sin `sale-demo`/`sp-demo` (V-30) | **R: Mobile** | **A: Principal** | **V: QA ind.** | **WAIT** (solo mem emul) |
| **A2.3** | `F5` / reload supervivencia | Durante cola 500, `F5` ×3 + kill Chrome (swipe away) + relaunch → `listPending()` sigue 500 intactos, `status=PENDING`/`RETRY`, 0 corrupción, `offlineSaleId` `hw-0000`..`hw-0499` íntegros. | Video `F5` → reload → `listPending` count + `IndexedDB` storage inspection + `audit_events` no duplicados antes de sync | **R: Mobile** | **A: Principal** | **V: QA ind.** | **NO-GO** |
| **A2.4** | `doze` / suspensión gama baja | `adb shell dumpsys deviceidle force-idle` (o 30 min idle real) con Chrome en background + cola 500 → `deviceidle` doze → wake → cola intacta, `BroadcastChannel` vitrina no corrompe cola, dispatcher `chunked-sync` reanuda sin pérdida. | `adb logcat` doze enter/exit + video device idle → wake → `listPending` intacto + `offline-sync` harness route-mock same-origin (CSP fix s53) + screenshot `navigator.onLine` toggle | **R: Mobile** | **A: Principal** | **V: QA ind.** | **NO-GO** |
| **A2.5** | Cuota IndexedDB (≥80% alerta / 100% bloqueo) | `navigator.storage.estimate()` cerca de cuota → banner alerta ≥80% (`quota-guardian` `QUOTA_ALERT_RATIO` 0.8, `canEnqueue true`) → 100% lanza `OfflineQueueBlockedError` con mensaje accionable, cola intacta 500, 0 corrupción, mensaje cajero no técnico. Luego liberar espacio → nueva venta encola OK (charco liberado). | Screenshot alerta "Libera espacio" + `evaluateQuota({usage:85,quota:100}) level=ALERT` log + `evaluateQuota({usage:100}) BLOCKED` + `createMemoryOfflineIdb failOnSet` → `OfflineQueueBlockedError` capturado + cola `listPending` 500 intacta + liberación y `hw-post-sync` OK | **R: Mobile** | **A: Principal** | **V: Security** | **NO-GO** |
| **A2.6** | Red hostil 500 (NETWORK_DOWN → online dedup) | Fase OFFLINE: `postSales → NETWORK_DOWN` 500 → `dispatchPendingSalesChunked` → `succeeded 0, failed 500`, `listPending 500` todos `RETRY`. Fase ONLINE: `postSales` con 5% `ALREADY_SYNCED` idempotente → `succeeded 500, failed 0`, `listPending 0`, 0 duplicados (cada `offlineSaleId` entregado exactamente 1×, `delivered Map size 500`). | Logs `offlineReport`/`onlineReport` del device + D1 `sales` 500 rows con `offlineSaleId` único + `accounts_receivable` 0 dup + `sale_items` 500 + captura `Network` throttling offline/online en devtools | **R: Mobile** | **A: Principal** | **V: QA ind.** | **WAIT** (emulado PASS, no device) |
| **A2.7** | Chunked sync `CHUNK_SIZE=30` + backoff sin dup | 65 ventas → chunks `[30,30,5]` verificados en device real con `sleepFn` backoff y `ALREADY_SYNCED` dedup, sin re-envío de chunks ya ACKed. `SYN-07` (Service Worker chunked dispatcher) respetado. | Log `chunksSeen=[30,30,5]` del device + `dispatchPendingSalesChunked` trace + D1 `sales` ordenadas por `offlineSaleId` sin huecos | **R: Mobile** | **A: Principal** | **V: QA ind.** | **WAIT** |
| **A2.8** | Fotos / tickets / correlativo server-side | Tras sync, fotos de tickets `NV01- hw-0001`.. impresos (si aplica) con correlativo D1 autoritativo (no `sale-demo`), `totalCents` INTEGER, `price_cents` snapshot server-side (0 precio manual). Tickets NV con leyenda "NOTA DE VENTA — Documento de control interno no válido para fines tributarios" (S11-E8). | `docs/ops/hw-evidence/android/<id>/tickets/` 5 tickets sample + `sales` D1 `SELECT series, number, total_cents` CSV + `audit_events` sale created chain + foto tickets con regla + QR fiscal si CPE (no aplica NV) | **R: Mobile** | **A: Principal** | **V: QA ind.** | **PENDIENTE** |
| **A2.9** | `doze` + `F5` combinados (chaos gama baja) | 500 hostil + `F5` + `doze` intercalados: toda la cola sobrevive, feedback p95 sigue <100 ms, 0 pérdida/duplicación, `judgeLowEndDevice` PASS (`enqueueAttempts 500, survivingPending 500, lost 0, feedbackP95Ms<100`). Reproducible con seed determinista (segundo test del `hw-android-offline.test.ts`). | Report combinado `judgeNetworkAdversarial PASS + judgeQuotaExceeded PASS + judgeLowEndDevice PASS` impreso desde device + video chaos 5 min + `determinista same seed` log | **R: Mobile+Chaos** | **A: Principal** | **V: QA+Security** | **NO-GO** |
| **A2.10** | Dependencia G1 FCM real desbloqueada | Antes de A2.2–A2.9, `go-live-fcm` `fcm-vapid-real` debe estar GREEN en staging real: VAPID pública desplegada, `PUSH_VAPID_PUBLIC_KEY` var, `FEATURE_MOBILE_PUSH=1` runtime, ACK `DISPLAYED` p95<10 s ≥99% en device real (no stub `push-fcm-service-account-v2` .invalid). Sin G1, hw-android 500 no es veredicto M4 válido. | `docs/ops/s45-mobile-push-pos-qg.md` + `pending-batches go-live-fcm` closed + screenshot `Dispositivos(1)` + `push_subscriptions` D1 row + token mint `expires_in 3599` log | **R: Mobile+Security** | **A: Principal** | **V: QA ind.** | **WAIT** (stub) |

**Nota s45/harness:** cada device debe correr contra staging Cloudflare real (`kipuspay-worker-api-staging`, `kipuspay-staging` D1 con `tenant_stg_phase0_001`), no `wrangler dev` local solo. `offline-queue` + `quota-guardian` + `chunked-sync-dispatcher` son los mismos del `hw-android-offline.test.ts`; en device se usan no-mocks.

---

### 4.3 Transversal — Pairing UI + `pos_terminals` autoritativo + no-bloqueo de caja

| # | Item | Criterio PASS | Evidencia |
|---|---|---|---|
| **T1** | `pos_terminals` autoritativo al abrir caja | `GET /api/pos/terminals/:id` devuelve `paper_width_mm` + `line_width` + `printer_strategy` + `allowlistedHosts`; resolver `resolveLineWidth(terminal)` server-side impone 32/48, `TicketData.lineWidth` ignorado si difiere. | `pos_terminals` D1 row JSON + `readPosPrinterSettings` dump + log `resolveLineWidth(80)=48` |
| **T2** | Outbox no bloquea caja (≤2D) | Durante todo el lab (printers down, WSS timeout, quota 100%), caja siguió cobrando NV con `blocksCashClose` correcto: `PriceLabelPrintJobRecord blocksCashClose=false` nunca bloquea Z, `PrintJobRecord` sale ticket PENDING/FAILED sí bloquea Z pero caja no se colgó (async `enqueueAndPrintTicket` best-effort tras charge). | Demo `chargeCartOffline OK` → outbox enqueue → UI no spinner bloqueante + `listBlocking()` counts + cierre Z bloqueado solo si `PENDING/FAILED` con `blocksCashClose true` |
| **T3** | Copy sin jerga técnica | Pairing UI y diagnostics sin `WebUSB/WSS/IP/endpoint` en flujo principal (validado por `validateDiagnosticsCopy`/`findJargonViolations` + `browser-functional-audit.md` G2). Mensajes: "Revisa cable o red", "Usa wss:// (seguro).", "Impresora en red guardada (…)" | Screenshots UI + reporte `findJargonViolations 0` + E2E `hardware-diagnostics 3/3` DOM sin jerga |
| **T4** | `verify.sh` + `quality` + ledger | `scripts/verify.sh` `RESULT SUITE GREEN` (V-00..V-31), `pnpm quality` bundle ≤300 kB, `scripts/index.sh` sync, entrada ledger nueva con `prev_hash`/`entry_hash` + `red/green_run_id` + `ancestry_verified` | `verify.log` + `quality.log` + `ledger NNNN` hash chain |

---

## 5. Dependencias y orden de ejecución (read before lab)

```text
G1  go-live-fcm (fcm-vapid-real)  ─┐
                                   ├──► hw-android-offline 500 (G2)  ─┐
G2  hw-printers-matrix 58/80 2×2 ──┘                                  ├──► go-live-hardware CLOSED (A+V)
      └─ Pairing UI C7 + disconnect/timeout                          ──┘
```

- **G1 desbloquea A2.x:** sin VAPID+FCM real, mobile.push no está operativo en staging; el SLO `ACK DISPLAYED p95<10s ≥99%` es precondición de las 500 offline (misma infra push para alertas de quota/cierre).
- **Matriz printers no depende de G1:** G2.1–G2.9 pueden ejecutarse en paralelo a G1, pero el CLOSED global espera ambas ramas.
- **Reutiliza sprint-C7:** `LanWssPrinterStrategy` + `buildPosPrinterEnv` + `persistTerminalToServer` ya existen; el lab no pide código nuevo, solo evidencia de integración real.
- **Invariante offline-first:** durante todo el lab, la venta nunca espera impresora ni red; imprimir es post-commit idempotente con `itemId` `documentType:series:number` y nonce.

---

## 6. Riesgos de cerrar sin lab (por qué el NO-GO es honesto, no burocrático)

| Riesgo | Impacto L3/L4 | Gatillo sin lab |
|---|---|---|
| Claim falso "etiquetas compatibles" vendido → cliente compra impresora no soportada → no imprime → demanda/chargeback, pérdida de confianza en FEFO/merma live (S18/S20) | P0 L4 legal/GTM | Declarar 58/80 soportado con solo golden bytes |
| Doze/F5 corrompe IndexedDB → 500 ventas perdidas o duplicadas en tienda real → caja descuadrada, CxC duplicado, AR/AP inconsistente | P0 L3 financiero | No probar `OfflineQueueBlockedError` ni supervivencia doze en device real |
| Timeout WSS silencioso sin ACK → cajero cree impreso, cliente sin ticket → auditoría `HARDWARE_DIAG` no reproducible, soporte remoto falla | P1 L3 operativo | No probar `PRINTER_ACK_TIMEOUT`/`PRINTER_RECONNECT_REQUIRED` con AP off |
| Paper width resolver client-side → 58mm ticket truncado o 80mm ticket desperdiciado → etiqueta ilegible / barcode no escaneable | P1 L3 comercial | No verificar `pos_terminals.paper_width_mm` autoritativo vs `lineWidth` fallback |
| Bundle regresión por lib npm QR/PDF → supera 300 kB → POS lento en Go 1GB → p95 >100 ms → cola bloqueada | P1 L4 perf | Añadir dependencia runtime sin ADR CAL-06 |

El NO-GO protege al negocio más que al gate.

---

## 7. Plan operativo del lab (qué falta comprar/hacer, quién, cuándo)

**Procurement (R: Hardware, A: Principal):**

- 2 impresoras térmicas con corte (1×58 mm, 1×80 mm) de marcas distintas, con drivers ESC/POS estándar y datasheet `vendorId/productId/interface/endpoint`. Ejemplo concreto para cotizar: **58 mm XPrinter XP-58IIH (USB)** + **80 mm Epson TM-T20III (USB)**, ambas ESC/POS, con cable USB-A. Bridge WSS: Raspberry Pi o mini-PC LAN con servicio `wss://` TLS (cert self-signed documentado) o impresora con bridge nativo WSS si existe.
- 2 Android Go 1 GB (ej. Nokia C12 Pro Go + Tecno Spark Go 2023), Android 12 Go, Chrome stable, con `adb` habilitado para `deviceidle` y `dumpsys`.
- Papel térmico 58 mm y 80 mm (≥2 rollos c/u), regla milimetrada, app genérica barcode scanner (ej. Barcode Scanner de ZXing).

**Lab steps (R: Hardware ejecuta, V: QA independiente reproduce 50% ciego):**

1. **Day 0 — Staging ready:** desplegar staging Cloudflare real con `FEATURE_DATA_BACKUP=1 FEATURE_PLATFORM_DR=1` runtime (hecho parcial), añadir `FEATURE_HARDWARE_DIAGNOSTICS=0` (default-off), `PUSH_VAPID_PUBLIC_KEY` var real + `FEATURE_MOBILE_PUSH=1` tras G1. Verificar `stg-crons-verify` 6 crons.
2. **Day 1 — Pairing + 58/80:** ejecutar G2.1–G2.4 en ambos printers, capturar anexos `device.jpg`/`ticket-58.jpg`/`preflight.png`/`terminal-row.json`. Firmar V partial.
3. **Day 1 — Disconnect/timeout:** G2.5–G2.7 con videos unplug/AP off/nonce mismatch, verificar fallback `system_print` HTML QR SVG.
4. **Day 2 — Android Go #1:** A2.1–A2.9 en device #1 (500 offline), con `doze` + `F5`, logs `verify.log` + `quality.log`.
5. **Day 2 — Android Go #2 réplica:** repetir completo en device #2 (modelo distinto) para ≥2 modelos; comparar p95 <100 ms en ambos.
6. **Day 3 — Red hostil + cuota + chunked:** A2.5–A2.7 con `navigator.storage.estimate` near-quota + throttling LAN, confirmar `ALREADY_SYNCED` 5% sin dup.
7. **Day 3 — Cierre A+V:** anexar carpeta `docs/ops/hw-evidence/<run-id>/`, correr `scripts/verify.sh` → `RESULT SUITE GREEN`, `pnpm quality`, generar ledger entry `prev_hash`/`entry_hash` con `red/green_run_id`, firmas A (Principal) + V (QA ind.) manuscritas/digitales.

**Estimación:** 3 días lab + 1 día A+V review. Coste devices ~S/ 600–900 (2 printers) + S/ 600 (2 Go) + papel/RPi si aplica. Sin estos, el bloque **no tiene path a GREEN honesto**.

**Si el procurement no está disponible:** el presente informe **es** la evidencia de NO-GO; `go-live-hardware` permanece `AGENDADO_AL_FINAL` con `hw-printers-matrix` y `hw-android-offline` en WAIT, y el tracker `pending-batches.yaml` no se edita a CERRADO. El equipo no debe inventar fotos/tickets ni usar `demo` literals (V-30).

---

## 8. Checklist de firma R/A/V para CLOSED (vacío hasta lab)

| Rol | Responsable | Firma | Fecha | Veredicto | Condición |
|---|---|---|---|---|---|
| **R** | Staff Hardware (owner printers/matrix) | ________________ | ______ | — | Ejecutó G2.1–G2.9 + T1–T4, anexó `hw-evidence/` |
| **R** | Staff Mobile (owner Android 500) | ________________ | ______ | — | Ejecutó A2.1–A2.10 en 2 devices |
| **R** | Staff Backend Datos (pos_terminals/outbox) | ________________ | ______ | — | Validó `paper_width_mm` autoritativo + `blocksCashClose` |
| **A** | Staff Principal (A) | ________________ | ______ | **NO-GO hoy** | Aprueba CLOSED solo con anexos completos y `verify` GREEN |
| **V** | Staff QA independiente (V) — printers | ________________ | ______ | **NO-GO hoy** | Reprodujo G2.1–G2.9 ciego, 0 jerga, 2 modelos |
| **V** | Staff QA independiente (V) — Android | ________________ | ______ | **NO-GO hoy** | Reprodujo A2.2–A2.9 + doze/F5, 0 pérdida/dup |
| **V** | Staff Security (V) — cuota/fail-closed | ________________ | ______ | **NO-GO hoy** | Validó `OfflineQueueBlockedError`, `WSS_HOST_NOT_ALLOWED`, `PRINTER_USB_PROFILE_NOT_ALLOWED` fail-closed |
| **V** | Staff Verifier V (independiente de R) | ________________ | ______ | **NO-GO hoy** | Firma final OLA M4 (sin V = NO-GO, Proceso §8.1) |

**Estado actual (2026-08-29):** todas las firmas **vacías / NO-GO** — lab requiere hardware físico, no se puede cerrar sin devices. Este informe es la evidencia M4 de NO-GO honesto.

---

## 9. Anexos — referencias y trazabilidad

**Maps:** `INDEX.md` Puertos → `PrinterTransport` (WebUSB→WSS→BT→SystemPrint), packages `print-templates` + `domain-hardware`; capítulos §7.5/§10, §5.8 regla 26, §5.7 regla 25, §5.3 regla 37b, §13 Quality.  
**Gates:** `s41-price-labels-qg.md` (software GREEN 115 workerd, 500 chaos, bundle 111.92 kB gzip), `s53-hardware-diagnostics-qg.md` (diagnostics 4 botones, <30 s), `claims-go-live.md` (GTM-17/S41 WAIT).  
**Verify:** hoy `hw-android-offline.test.ts` PASS emulado no es CLOSED; `scripts/verify.sh` debe dar `RESULT SUITE GREEN` el día del lab con anexos físicos, y `pnpm quality` bundle ≤300 kB (CAL-06).  
**Ledger:** al cerrar el lab, entrada nueva `prev_hash`/`entry_hash` con `red_commit_sha`/`green_commit_sha`, `red_run_id`/`green_run_id`, `ancestry_verified:true`, `expected_failure` nulo, `test_ids` que resuelven en tests del monorepo (CAL-07 §13.9).  
**Brand/footer:** `brandFooter` siempre después de leyenda fiscal (NV/CPE), opt-out por tenant — verificado en tickets sample del lab.  

**Do not:** `FEATURE_CATALOG_SELLABLE`/`FEATURE_MOBILE_PUSH`/`FEATURE_HARDWARE_DIAGNOSTICS` = runtime only, nunca en `wrangler.jsonc`; no `toFixed`/`parseFloat` sobre `*_cents`; no `switch(vertical)`; no `UPSERT INTO`; no `demo` literals en `apps/pos-web/src` (V-30).

---

**Cierre M4:** este hardware lab no se declara soportado hasta ≥2 modelos físicos/simulados por perfil probados y firmados. El software está listo para el lab; el lab no está listo sin hardware. **NO-GO honesto hoy = GREEN honesto mañana.**

