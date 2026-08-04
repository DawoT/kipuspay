---
doc_id: arch-07-sync-offloading
alias: Arquitectura
authority: normativa
owner: "@DawoT"
section: "7"
---

## **7. Chunked Sync Dispatcher (Service Worker Client-Side)**

// src/client/sync/chunkedSyncDispatcher.ts  
const CHUNK_SIZE = 30;

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
  pendingSales: OfflineSalePayload[],  
  syncEndpoint: string,
  bearerToken: string,
  indexDb: { del(key: string): Promise<void>; mark(key: string, status: 'RETRY'): Promise<void> }
) {  
  const chunks = chunkArray(pendingSales, CHUNK_SIZE);  
  const report = { total: pendingSales.length, succeeded: 0, failed: 0 };
  const BACKOFF_BASE_MS = 500;
  const MAX_ATTEMPTS = 5;

  for (let i = 0; i < chunks.length; i++) {  
    const chunk = chunks[i];  
    let attempt = 0;  
    while (true) {  
      try {  
        const res = await fetch(syncEndpoint, {  
          method: 'POST',  
           headers: {
             'content-type': 'application/json',
             Authorization: `Bearer ${bearerToken}`
           },  
          body: JSON.stringify({ sales: chunk })  
        });  
        if (res.ok) {  
          const { results } = await res.json();  
          for (const r of results) {  
            if (r.status === 'SUCCESS' || r.status === 'ALREADY_SYNCED') {  
              report.succeeded++;  
              await indexDb.del(`offline/${r.offlineSaleId}`);  
            } else {  
              report.failed++;  
              await indexDb.mark(`offline/${r.offlineSaleId}`, 'RETRY');  
            }  
          }  
          break;  
        } else {  
          // 5xx/429: chunk entero a reintento con backoff; no se descarta nada.
           if (attempt >= MAX_ATTEMPTS) {
             report.failed += chunk.length;
             for (const sale of chunk) await indexDb.mark(`offline/${sale.offlineSaleId}`, 'RETRY');
             break;
           }
          await sleep(BACKOFF_BASE_MS * 2 ** attempt + Math.random() * 100);  
          attempt++;  
          continue;  
        }  
      } catch (err) {  
        // Red física: backoff y reanudación desde el último checkpoint (resume).
         if (attempt >= MAX_ATTEMPTS) {  
          report.failed += chunk.length;  
          for (const sale of chunk) await indexDb.mark(`offline/${sale.offlineSaleId}`, 'RETRY');
          break;  
        }  
        await sleep(BACKOFF_BASE_MS * 2 ** attempt + Math.random() * 100);  
        attempt++;  
      }  
    }  
  }

  return report;  
}

function chunkArray<T>(arr: T[], size: number): T[][] {  
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size));  
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

