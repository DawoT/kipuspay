---
doc_id: ops-p2-cash-tips-drawer-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Backlog v10 P2 — Propinas + Cajón de efectivo (Arquitectura §5.3 regla 11) — Quality Gate

**Estado software:** GREEN local  
**Capabilities:** `FEATURE_SALE_TIP`, `FEATURE_CASH_DRAWER` default-off  
**Spec:** Arquitectura §5.3 regla 11 (propina fuera del valor de venta, sin IGV; cajón por ESC p tras efectivo y wallets) · Backlog v10 P2

El gate automatizado demuestra el contrato en local: propina opcional por pago
(`sale_payments.tip_cents`) fuera del CPE (línea informativa del ticket, sin
IGV), tope por política del tenant (`tip_max_percent` default 25% del base
gravable, server-side), total a cobrar = venta + propina con validación
`PAYMENT_TOTAL_MISMATCH`, y apertura del cajón por `ESC p` (0x1b 0x70) en el
primer adaptador de hardware (webusb/wss_lan/bluetooth) tras cobros en efectivo
y wallets. No existe staging de hardware: producción/piloto NO-GO hasta QA
humana con impresora/cajón físicos.

## Evidencia RED→GREEN

| Hito | Run ID | Evidencia |
|---|---|---|
| RED dominio | `run-red-p2-domain` | tip en offline-sale ausente (tests fallaron) |
| RED schema | `run-red-p2-schema` | 0048 ausente (schema test falló) |
| GREEN dominio | `run-green-p2-domain` | domain-sales 251/251 (propinas; 95.7% branches) |
| GREEN schema | `run-green-p2-schema` | cash-tips-drawer-schema 3/3 + integración 34/34 |
| GREEN motor | `run-green-p2-motor` | integración propinas 3/3 (tip persistido, IGV solo venta, tope, mismatch) |
| GREEN print | `run-green-p2-print` | print-templates 9/9 (PROPINA en ticket + openDrawerBytes ESC p); domain-hardware 19/19 (cash_drawer target) |
| GREEN rutas | `run-green-p2-routes` | cash-policy 5/5 + paridad 419 |
| GREEN UI+E2E | `run-green-p2-ui` | pos-web 239 unit + E2E 56/56 (tips/drawer 3/3) |

## Resultado local exacto

| Suite/check | Resultado observado |
|---|---|
| Domain sales | 251 tests GREEN (assertTipAllowed, totalDueWithTip, shape con tip) |
| Domain hardware | 19 tests GREEN (target `cash_drawer`, causas DRAWER_NOT_FOUND/COMM_FAILED) |
| Print templates | 9 tests GREEN (línea PROPINA; openDrawerBytes = `[0x1b,0x70,0x00,0x19,0xfa]`) |
| Adapters D1 | unit + integración 34/34 (propinas 3/3; registry regenerado sin triggers adelantados) |
| Worker API | 1017 tests GREEN (cash-policy 5/5; paridad 419) |
| POS web | 239 unit + E2E 56/56 GREEN |
| `scripts/verify.sh` | `RESULT SUITE GREEN` (V-00..V-26) |

## Cobertura contractual

| Contrato | Evidencia local |
|---|---|
| Propina sin IGV | Motor: `total_amount_cents` y `total_igv_cents` del CPE conservan la venta (integración: 1180 total / 180 IGV con tip 200) |
| Tope por política | `tip_max_percent` default 25 (dominio + motor `TIP_EXCEEDS_MAX_PERCENT`; ruta PATCH valida 1..100) |
| Total = venta + propina | `totalDueWithTip` + motor `PAYMENT_TOTAL_MISMATCH` si no cuadra |
| Ticket | `PROPINA: S/ X` (ESC/POS) solo si tip > 0 |
| Cajón `ESC p` | `openDrawerBytes()` + `PrinterTransport.openDrawer()` (hardware-only) + `probeDrawer()` (troubleshooter) |
| Apertura tras cobro | `+page.svelte`: `openDrawer()` fire-and-forget tras el cobro (efectivo y wallets) con flag |
| Política | `GET/PATCH /api/cash/policy` (owner/admin), toggles en Admin/Configuración |
| Gating | `FEATURE_SALE_TIP` / `FEATURE_CASH_DRAWER` default-off (404) |

Tests de trazabilidad:

- `packages/domain-sales/src/offline-sale.test.ts` (propinas).
- `packages/adapters-d1/src/cash-tips-drawer-schema.test.ts`,
  `src/process-offline-sale-atomic.integration.test.ts` (propinas 3/3).
- `packages/print-templates/src/print-templates.test.ts`,
  `packages/domain-hardware/src/diagnostics.test.ts`.
- `apps/worker-api/src/cash/cash-policy-routes.test.ts`.
- `apps/pos-web/src/lib/fiscal/withholdings.test.ts` (patrón),
  `tests/e2e/cash-tips-drawer.spec.ts` (3/3).

## Security Review

- La propina se calcula y valida server-side (invariante 1/7); la UI solo
  envía el monto, el tope lo impone el servidor.
- El cajón se abre solo con adaptadores de hardware (nunca system_print/WhatsApp).
- Tenancy: `tenant_id` del JWT en rutas y motores.

Esta revisión no equivale a pentest.

## Evidencia externa pendiente

| Evidencia requerida | Estado | Condición de cierre |
|---|---|---|
| Apertura de cajón en hardware real | PENDIENTE / NO-GO | QA humana con impresora/cajón físicos |
| Claim de propinas (restauración) | NO-GO | Solo tras gate + staging |
| QA humana + A/V independiente | PENDIENTE / NO-GO | Firma de ADR-FISCAL-001 v2 (ledger 0335) |

## RACI real

| Rol | Estado |
|---|---|
| Staff Backend ACID | Motor propinas + política GREEN local |
| Staff Hardware/Frontend | openDrawer + troubleshooter + E2E GREEN local |
| Staff Fiscal | Propina sin IGV documentada en §5.3 regla 11 |
| Staff Principal V | Revisión del motor: 0 hallazgos medium+ |

## Veredicto

**SOFTWARE-GREEN.** Propinas y cajón de efectivo quedan implementados y
verificados en local con capabilities default-off; claims NO-GO hasta QA
humana con hardware real y firmas A/V independientes.
