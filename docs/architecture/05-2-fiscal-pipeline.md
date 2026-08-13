---
doc_id: arch-05-2-fiscal-pipeline
alias: Arquitectura
authority: normativa
owner: "@DawoT"
section: "5.2"
---

### **5.2 Pipeline de envío fiscal (Factura vs Resumen Diario)**

| Tipo | Cómo llega a SUNAT/OSE | Plazo máximo | Campo `must_submit_by` |
|---|---|---|---|
| Factura `01` + NC/ND de factura | XML unitario firmado | Fecha emisión o hasta **3 días calendario** contados desde el día siguiente | `issued_date_lima + 3 días` fin de día Lima *(corrección off-by-one: `+1+3` daba día+4)* |
| Boleta `03` + NC/ND de boleta | **Resumen Diario (RC)** — no se exige XML unitario de boleta al OSE como factura | Día de emisión o hasta **7 días calendario** siguientes | `issued_date_lima + 7 días` fin de día Lima |
| Nota de Débito `08` (P1a, ADR-FISCAL-003) | ND de factura `01` → **XML unitario** (mismo plazo de la factura); ND de boleta `03` → **línea del RC** (mismo plazo de la boleta); **no toca stock** | Según el documento que ajusta | Igual que el documento origen |
| `NV` / `NV_RETURN` | No se envía | N/A | NULL |

**Jobs:**

- `submitInvoiceWorker`: prioriza por `must_submit_by`; alerta Admin/Dueño a **T-24h y T-6h**; DLQ `DEADLINE_EXCEEDED` si vence (comprobante entregado al cliente puede perder validez tributaria). **Auto-sugerencia de reversión:** un CPE que entra a `DEADLINE_EXCEEDED` dispara en el panel Modo Dueño la sugerencia de **NC de anulación sin CDR (E-A)** para desbloquear la contabilidad del contribuyente sin esperar acción manual.
- `buildDailySummaryCron`: agrupa boletas/NC-boleta del día Lima por **emisor (`tenant_id` + `summary_date`)** — SUNAT admite **un único RC por día por emisor**; `branch_id` queda como atributo de cada línea (boleta→branch), nunca como clave del RC (corrección FIS-03). Genera RC; espera CDR; permite baja (`void`) de boleta informada en RC del mismo día de emisión. **RC complementaria (SYN-11):** una boleta con `issued_at` de un día cerrado que sincroniza después admite **RC complementaria del mismo `summary_date`** mientras esté dentro de `must_submit_by`, con alerta Modo Dueño; si se vence la ventana, runbook de NC/re-facturación (reusa E-A/E-B §8).
- **Arqueo Z / cierre de caja ≠ Resumen Diario.** El RC es job fiscal independiente; banner si hay boletas del día sin RC aceptado.

**Representación impresa / PDF CPE (mínimo obligatorio):**

- RUC, razón social, dirección, serie-número, fecha/hora Lima.
- Código **hash** del XML y **QR** de consulta.
- Leyendas: *"Representación impresa de la [FACTURA/BOLETA/NOTA] ELECTRÓNICA"*; *"Autorizado mediante Resolución …"* (o equivalente PSE).
- NV: solo leyenda de control interno (sin hash/QR SUNAT).

