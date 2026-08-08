---
doc_id: ops-objections-playbook
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Guion de objeciones — ventas y soporte (Sprint 13)

| Campo | Valor |
|---|---|
| Fuente comercial | GTM §8 (no reescribir; solo trazar) |
| Owner | Staff Content · Staff Growth |
| Relaciona | Roadmap Sprint 13 · GTM §8 · Arquitectura / Roadmap por fila |

Cada objeción cita la **garantía técnica** o el **gate** que la respalda. Si el gate no cerró, la respuesta pública es roadmap con sprint — nunca una fecha inventada.

| Objeción (GTM §8) | Respuesta operativa | Trazabilidad |
|---|---|---|
| Ya tengo un sistema, cambiar es mucho trabajo | CSV/onboarding hoy; importador Bsale/Alegra tras S21 | Roadmap Sprint 21 · GTM objeción #1 |
| KDS / split / lotes FEFO | Solo si QG del sprint vertical cerró; si no, roadmap | GTM §2 · Sprints 17–20 |
| Yape / Plin / tarjeta en caja | Tras S22 Zero-Trust; antes efectivo/transferencia manual | Roadmap Sprint 22 · Arquitectura pagos |
| Contasis / Concar | Export asientos listo (QG S23); Cadena+ | Roadmap Sprint 23 · ops s23 |
| API / fidelización Cadena | API QG S23; puntos S24; si no, roadmap | GTM Cadena · Sprints 23–24 |
| Falla el primer día / pierdo ventas | Trial 30 días con datos reales; offline-first | AGENTS invariante 7 · GTM §6.2 |
| Personal poco tech | UI cobro mínima; trial real | GTM §6 · UX cobro |
| ¿Por qué tan barato? | Sin instalación/servidor aparte; Edge | GTM §4 · Arquitectura §1 |
| Crezco y no me alcanza el plan | Upgrade; Arranque nunca corta cobro (cupo+sobregiro copy) | GTM §4.1 · GTM-04/S27 metering vivo |
| No formalizado / control interno | NV con leyenda GTM-07; upgrade Config | Arquitectura formalización · GTM-07 · Sprint 11 |
| SUNAT me fiscaliza a medias | CPE vía PSE si activó; NV no se hace pasar por boleta | ADR-FISCAL-001 · GTM-07/08 |
| Internet varios días | Cobro offline + sync + plazos | Arquitectura sync · GTM-08 |
| Rebota pago suscripción | Gracia; caja no se apaga | GTM §4.3 |
| Promociones | Tras S29 GTM-15 | Roadmap Sprint 29 |
| Compras a proveedores | Tras S28–32 / S20 parcial | GTM-13 |
| Apartados | QG S32 GTM-17 | Roadmap Sprint 32 · ops s32 |
| Cotizaciones / presupuestos | QG S33 GTM-19 | Roadmap Sprint 33 · ops s33 |
| Devolución a proveedor | QG S34 GTM-20 | Roadmap Sprint 34 · ops s34 |
| Crédito de tienda / gift cards | QG S35 GTM-21 | Roadmap Sprint 35 · ops s35 |
| Cuotas / pago en partes | QG S36 GTM-22 | Roadmap Sprint 36 · ops s36 · solo principal reduce CxC; atraso ≠ apaga caja |
| Comisiones de vendedor | QG S37 GTM-23 | Roadmap Sprint 37 · ops s37 · ≠ nómina; monto servidor; NC revierte accrual |
| ¿Puedo saber en qué rack está cada producto? | Sí, ubicaciones/racks por sucursal tras QG S38 | GTM-17 · reporte/CSV por ubicación · transferencia interna no cambia total |
| ¿Ya incluye seriales, balanza, etiquetas y backup? | No; siguen como roadmap S39–S42 | GTM-17 · no decir “inventario avanzado completo” |
| Tallas/colores | QG S31 | GTM-16 |

## Regla de uso

1. Citar `GTM-*` cuando el claim dependa de un gate.
2. No usar “contingencia” para NV.
3. No afirmar aceptación SUNAT antes del CDR.
4. Actualizar este playbook con entrada de ledger cuando un gate descongele una fila.
