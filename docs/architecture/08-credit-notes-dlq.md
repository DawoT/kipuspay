---
doc_id: arch-08-credit-notes-dlq
alias: Arquitectura
authority: normativa
owner: "@DawoT"
section: "8"
---

## **8. Notas de Crédito / Débito, Baja de Boleta, Devolución NV & DLQ**

### Reglas de negocio

- **NC `07`:** solo si el comprobante origen tiene `sunat_status = ACCEPTED` (CDR). Motivo Catálogo 09. Permite **NC parcial** (ítems/cantidades ⊂ originales); el guard anti-doble es por monto residual: `sum(NC.total) ≤ original.total`. **Excepción de anulación sin CDR (edge E-A):** si el origen está `REJECTED`/`QUARANTINED`/`DEADLINE_EXCEEDED` (nunca fue aceptado), la NC de **anulación total** se permite **sin** exigir CDR, con motivo Catálogo 09 y `audit_events` `CREDIT_NOTE_NO_CDR` (estado origen + alerta Dueño); su XML viaja como corrección del original no aceptado. El 409 `FISCAL_CDR_REQUIRED` aplica solo a orígenes `PENDING`/`PROCESSING` (resultado SUNAT aún no resuelto) o `ACCEPTED` mal usado.
- **ND `08`:** motivos Catálogo 10; misma precondición CDR aceptada sobre el origen. La ND **no** aplica la excepción E-A (jamás se emite sin CDR: incrementa deuda). **Cupo (FIS-08/09):** la ND es un CPE → `doc_count + 1` en la misma tx (regla 3 §4.1) con `usage:ND:{id}`; **no** reembolsa el cupo del origen ni consume CxC. Si la ND corrige ICBPER de boletas con bolsas plásticas (código `7152`, `charges_icbper`), el delta positivo de `total_icbper_cents` viaja con motivo Catálogo 10.
- **Baja de boleta:** `void_status = VOID_PENDING_RC` → se informa en Resumen Diario del **mismo día de emisión**; no es NC. **Solo fiscal (edge E-C):** la baja **no** revierte stock ni caja — la venta subsiste (el cliente se lleva el producto y el dinero ya se contabilizó); solo invalida el comprobante. Si la RC del día ya se envió/aceptó, la baja ya no es posible: la anulación posterior se hace **vía NC** (nunca se re-voida). **Cupo (FIS-10):** la baja **no** consume cupo (la venta ya lo consumió al emitirse) — alineado con GTM §4.1 (no hay "segundo cobro").
- **Contrato UBL mínimo (FIS-12):** el XML que sale a SUNAT/OSE garantiza, por schema UBL 2.1 pre-firma (FASE 8 Sprint 26), los elementos obligatorios: `cbc:UBLVersionID`, `cbc:CustomizationID` (factura `1.0` / boleta `1.1`), `cac:Signature/cac:SignatoryParty`, `cbc:ID` serie-número, `cac:AccountingSupplierParty` (RUC emisor), `cac:AccountingCustomerParty`, `cac:TaxTotal`, `cac:LegalMonetaryTotal`. Validación **antes** de firmar; un XML que no la pase va a DLQ `QUARANTINED` sin tocar el breaker (taxonomía §8.1).
- **Devolución NV:** documento `NV_RETURN` (o anulación append-only) — revierte stock/caja, `NOT_APPLICABLE`, sin SUNAT.
- **CxC / crédito:** permitido en NV y CPE; el tipo de pago “crédito” genera `accounts_receivable`. **Compensación de CxC en NC/devolución (edge E-D):** toda NC/NV_RETURN (regla 13) sobre una venta con saldo pendiente reduce `accounts_receivable.balance_due_cents` en la **misma tx** por el monto acreditado — total (cierra el saldo a cero) o parcial (prorratea por ítems/cantidades acreditadas). Si ya hubo abonos cobrados, el vuelto se entrega por el método del último abono o en efectivo, o se convierte en crédito de tienda (regla 20) cuando la política lo permite; **jamás** se ajusta CxC en silencio (`audit_events` con el asiento de compensación).
- **Upgrade de formalización mid-day:** permitido con sesión abierta; docs ya emitidos conservan tipo; nuevas ventas usan el nuevo default.
- **Gracia past_due:** caja y CPE siguen; costos OSE/PSE durante gracia los absorbe KipusPay (política comercial).

// src/handlers/creditNoteHandler.ts — precondiciones (extracto)
// 1. originalSale.sunat_status === 'ACCEPTED' (else 409 FISCAL_CDR_REQUIRED).
//    EXCEPCIÓN E-A (anulación sin CDR): si el origen es REJECTED/QUARANTINED/DEADLINE_EXCEEDED
//    (jamás tuvo CDR), PERMITIR NC de anulación TOTAL sin exigir ACCEPTED — el 409 aplica solo a
//    PENDING/PROCESSING (resultado SUNAT sin resolver). audit CREDIT_NOTE_NO_CDR + alerta Dueño.
// 2. residual = original.total_amount_cents - sum(prior NC totals) >= requested credit total
// 3. motiveCode ∈ Catálogo 09
// 4. Restaurar stock solo de ítems/cantidades acreditadas; si el ítem es is_uncatalogued
//    (venta rápida R34/regla 13, edge E-B): NO restaurar stock ni refresh_avg_cost — la línea nunca descontó.
// 5. Si la venta tiene CxC (balance_due_cents > 0): reducir accounts_receivable en la MISMA tx (edge E-D).
// 6. Encolar: si origen es factura → envío unitario NC; si boleta → incluir en RC del día
// 7. Cupo (Arquitectura §4.1): la NC es un CPE → doc_count + 1 en la MISMA tx,
//    con idempotency usage:NC:{id}; el cupo consumido por la venta original NO se reembolsa.

app.post('/v1/sales/:id/credit-note', async (c) => {  
  const originalSaleId = c.req.param('id');  
  const tenant = c.get('tenant');  
  const db = c.get('db') as D1Database;  
  const user = c.get('user');  
  const body = await c.req.json<{ motiveCode: string; items?: Array<{ saleItemId: string; quantity: number }> }>();

  const originalSale = await db.prepare(  
    `SELECT * FROM sales WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`  
  ).bind(originalSaleId, tenant.id).first<any>();

  if (!originalSale) return c.json({ error: 'Original sale not found' }, 404);  
  if (originalSale.document_type === 'NV') {  
    return c.json({ error: 'Use NV_RETURN for internal sale returns', code: 'USE_NV_RETURN' }, 422);  
  }  
  // E-A (anulación sin CDR): solo se bloquea cuando el resultado SUNAT aún no está resuelto.  
  // Un CPE REJECTED/QUARANTINED/DEADLINE_EXCEEDED jamás tuvo CDR: su NC de anulación es válida sin él.  
  if (['PENDING', 'PROCESSING'].includes(originalSale.sunat_status)) {  
    return c.json({ error: 'Credit note requires settled SUNAT status', code: 'FISCAL_CDR_REQUIRED' }, 409);  
  }  
  const noCdr = originalSale.sunat_status !== 'ACCEPTED'; // true → NC de anulación TOTAL (E-A)

  // Residual parcial: sumar NC previas (document_type 07) y validar monto  
  const priorCredits = await db.prepare(  
    `SELECT COALESCE(SUM(total_amount_cents),0) AS credited FROM sales  
     WHERE referenced_sale_id = ? AND document_type = '07' AND tenant_id = ? AND deleted_at IS NULL`  
  ).bind(originalSaleId, tenant.id).first<{ credited: number }>();

  const result = await processReferencedDocumentAtomic(db, tenant.id, user.userId, {
    documentType: '07',
    referencedSaleId: originalSaleId,
    creditNoteMotiveCode: body.motiveCode,
    branchId: originalSale.branch_id,
    items: body.items?.map((item) => ({ ...item, productId: null }))
  });
  return c.json(result);
});

export default app;

### **8.1 Resiliencia del canal fiscal — FiscalTransport & Circuit Breaker (v8.2)**

**ADR-FISCAL-002 (canal):** no reabre reglas de ADR-FISCAL-001 (plazos, RC, 700/RUC, NC+CDR). Solo define **cómo** viaja el XML. **Frontera de contrato (R-01):** `FiscalTransport` consume **únicamente** los DTO normalizados `CPEInvoiceDTO` / `CPESummaryDTO` (comprobante fiscal ya resuelto por el motor, incl. hash/QR/leyendas) — **prohibido** que importe entidades retail de FASE 6B–6G (`inventory_*`, `sales_returns`, `orders_*`); el transporte es un puerto desacoplado y avanzable sin esperar la capa comercial de profundidad. Lo mismo aplica a `PrinterTransport` (§7.5): serializa DTO de impresión, nunca entidades de inventario/retornos.

| Adaptador `FiscalTransport` | Uso |
|---|---|
| `KIPUSPAY_PSE_DIRECT` | **Default** — PSE KipusPay envía directo a SUNAT (mínimo costo OSE) |
| `ose_*` | Enterprise / preferencia del tenant |
| `pse_third_party` | Plugin; requiere **suite de contrato** antes de enable |

#### Circuit Breaker (estado global correcto)

- Contador + estado + temporizador viven en un **Durable Object** por `(transport, endpoint)` — endpoints: `submit`, `cdr_query`, `rc_submit`. **No** un breaker global único.
- Estados: `closed → open → half-open`; probe vía `alarm()` del DO.
- Umbral ejemplo: 10 errores **5xx / timeout / red** en ventana → `open` ~2h; half-open prueba 1 request.

**Lectura del estado — caché de 2 niveles (anti thundering herd):**

1. **In-memory isolate (TTL 5-10s):** cada Worker cachea el flag `open` en su aislado; si sabe que el breaker está abierto, **rechaza/encola localmente sin tocar KV ni el DO**. Nunca sirve `closed` con stale ≥ TTL (sesgo fail-closed acotado).
2. **KV (eventual ~60s):** solo **cache de lectura** del flag `open`; **nunca** como contador.
3. **DO (autoritativo):** **nunca se consulta en el hot path de lectura**; solo recibe escrituras.

**Incrementos — sampling, no 1:1 por fallo:** en la primera ola de fallos (colapso SUNAT con miles de isolates), los Workers **no** incrementan el DO por cada request fallido: se agregan en el aislado y se envían coalescidos (1 incremento por ventana de ~5s, o factor de decimación). El DO serializa el conteo sin ser re-bombardeado; el jitter/backoff de la taxonomía evita reintentos en ráfaga.

#### Taxonomía de errores (obligatoria)

| Clase | Ejemplo | Acción |
|---|---|---|
| **Infra (abre breaker)** | HTTP 5xx, timeout, DNS, reset | Incrementa DO; backoff + jitter |
| **Negocio 4xx** | XML inválido, RUC malo, rechazo CDR de contenido | **No** abre breaker; documento → DLQ / `QUARANTINED` |
| **Deadline** | `must_submit_by` vencido | `DEADLINE_EXCEEDED`; alerta Dueño; no reintentar como si fuera 5xx |

#### Backpressure (anti inversión de deadline)

Cloudflare Queues = **disparador**, no fuente de verdad de prioridad.

1. XML firmado → **R2**; D1 guarda puntero + `must_submit_by` + `retry_count`.
2. Cron/scheduler: `SELECT … WHERE sunat_status IN ('PENDING','PROCESSING') ORDER BY must_submit_by ASC LIMIT N`.
3. Mensaje de cola = `{ saleId, r2Key }` (puntero), no el XML embebido.
4. Si `retry_count ≥ N` (venenoso): `QUARANTINED` + alerta; no bloquea la cabecera.
5. Si vence retención/plazo: estado `DEADLINE_EXCEEDED` en D1 (`sunat_dlq` / columna); panel Modo Dueño muestra **represados** y **cuarentena**.**Reversión (edge E-A):** un CPE en `REJECTED`/`QUARANTINED`/`DEADLINE_EXCEEDED` (jamás aceptado) puede anularse con NC sin CDR (§8) — el panel ofrece "Anular" con motivo Catálogo 09; no queda atrapado en la cola fiscal.

```sql
-- Extensión sugerida sales / sunat_outbox
-- r2_xml_key TEXT, quarantine_reason TEXT,
-- sunat_status incluye: QUARANTINED | DEADLINE_EXCEEDED | DLQ_REQUIRES_INTERVENTION
```

