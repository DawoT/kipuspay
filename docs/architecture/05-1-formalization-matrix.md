---
doc_id: arch-05-1-formalization-matrix
alias: Arquitectura
authority: normativa
owner: "@DawoT"
section: "5.1"
---

### **5.1 Formalización progresiva y matriz régimen × documento (Zero-Trust)**

KipusPay no asume que todo tenant es emisor electrónico desde el día 1. El servidor valida cada emisión contra `tax_regime` × `formalization_mode` × `enabled_document_types` antes de persistir (rechazo 422 si el cliente pide un tipo no permitido).

| `formalization_mode` | Quién | Default en caja | Camino CPE | Documentos tipicos |
|---|---|---|---|---|
| `INTERNAL_CONTROL` | Pre-formalización / control interno | **Nota de Venta (`NV`)** | N/A (`NOT_APPLICABLE`) | Solo `NV` (CPE bloqueados) |
| `FORMALIZING` | RUC activo; activando facturación | Boleta `03` / Factura `01` | **PSE KipusPay** (firma/envío por plataforma o cert tenant) → `PENDING` | CPE según régimen + `NV` opcional (leyenda) |
| `ELECTRONIC_ISSUER` | Emisor electrónico operativo | Boleta `03` / Factura `01` | Envío unitario / Resumen Diario según tipo | CPE según régimen; `NV` no sustituye boleta |

**Matriz `tax_regime` → documentos CPE permitidos (modos FORMALIZING / ELECTRONIC_ISSUER):**

| Régimen | `NV` | Boleta `03` / Ticket `12` | Factura `01` | NC `07` / ND `08` |
|---|---|---|---|---|
| `UNKNOWN` / pre-RUC | Sí (default) | No | No | No |
| `NRUS` | Solo si aún `INTERNAL_CONTROL`; al formalizar, no sustituye boleta | Sí | **No** | Sobre boleta |
| `RER` / `RMT` / `RG` | Opcional (control/crédito interno; leyenda obligatoria) | Sí (consumidor final) | Sí (cliente con RUC) | Sí |

**Reglas duras:**

1. `NV` **no** está en Catálogo 01 SUNAT. Impresión con leyenda: *"Nota de venta — documento de control interno. No es comprobante de pago autorizado por SUNAT."*
2. Upgrade `INTERNAL_CONTROL` → `FORMALIZING` / `ELECTRONIC_ISSUER`: las NV históricas **no se convierten** en boletas (prohibida re-numeración). Ventas nuevas usan CPE.
3. **PSE ≠ contingencia normativa.** Contingencia SUNAT = formatos preimpresos autorizados ante falla del sistema. KipusPay **no** emite serie B/F "en contingencia" solo porque falta `.pfx`. Default de producto: **PSE KipusPay** en modos formales (ADR-FISCAL-001).
4. NRUS formalizado: ventas ≤ S/ 5 pueden omitir emisión unitaria + **boleta de consolidación diaria**; boleta ≥ **S/ 700** exige tipo+número de doc y nombres del adquirente; Factura exige RUC (`6`).
5. **Nota de Débito `08` (Backlog v10 P1a, ADR-FISCAL-003):** la ND incrementa el valor de un comprobante **aceptado** (factura `01` o boleta `03`) por motivos del **catálogo 10** (cerrado: `01` interés por mora, `02` aumento de valor, `03` penalidades/otros conceptos, `10` ajuste de otros conceptos). Guard: origen `ACCEPTED` (sin CDR → anulación total E-A/E-B, mismo régimen que la NC §8); `amountCents > 0`; referencia encadenada por serie/número. La ND **no toca stock** (solo impuestos y saldos); se anula con una NC de la ND, nunca con `DELETE` (append-only, FIS-08). ND de factura → envío unitario XML; ND de boleta → línea del Resumen Diario (§5.2).
6. **Guía de Remisión Electrónica (GRE)** y percepciones/retenciones/detracciones = **fuera de MVP v8.0** (post-MVP).

#### ADR-FISCAL-001 v2 — Decisiones cerradas (obligatorio Sprint 5)

1. `INTERNAL_CONTROL` = solo NV (`NOT_APPLICABLE`).
2. `FORMALIZING` / `ELECTRONIC_ISSUER` = **PSE KipusPay** por defecto (`pse_mode = KIPUSPAY_PSE`); cert propio del tenant es opción avanzada.
3. Boletas → **Resumen Diario**; Facturas → envío **unitario** XML.
4. Plazos: factura **3 días calendario**; RC boletas **7 días calendario**; alertas T-24h; DLQ por vencimiento.
 5. Guards: boleta ≥ S/ 700 ⇒ identificación; factura ⇒ RUC; NC/ND ⇒ origen `ACCEPTED`.
 6. **Constante fiscal legal (única fuente de verdad):** umbral de identificación en boleta = **S/ 700 → 70000 cents** (`DOC_TOTAL_THRESHOLD_FOR_ID`); umbral NRUS de omisión unitaria = **S/ 5 → 500 cents**. Estas constantes se referencian (no se re-definen) en código (→ `total_amount_cents >= 70000`), GTM FAQ y Proceso; cualquier cambio futuro se edita aquí.
 7. Series CPE por **branch** (sucursal); correlativo autoritativo en servidor/DO.
 8. GRE, percepciones, retenciones, detracciones = **fuera de MVP v8.0**.
 9. Prohibido en producto/copy llamar “contingencia SUNAT” a la falta de `.pfx`.

