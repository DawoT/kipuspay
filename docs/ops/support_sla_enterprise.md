---
doc_id: ops-support-sla-enterprise
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Contrato operativo — `support_sla_enterprise` (GTM-02)

| Campo | Valor |
|---|---|
| Estado | Aprobado (Sprint 13 QG) |
| Aprobadores | Staff PM · Staff Growth |
| Relaciona | GTM §4.1.1 GTM-02 · Roadmap Sprint 13 · Proceso §8.1 |

## Alcance

Este contrato define soporte **estándar** (Arranque/Crece/Cadena) y soporte **prioritario Enterprise**.
No modifica la promesa de cobro continuo (la caja no se apaga por ticket de soporte).

## Canales

| Plan | Canal primario | Canal secundario |
|---|---|---|
| Arranque / Crece | Chat in-app / correo soporte | — |
| Cadena | Chat + account manager (horario laboral PE) | Correo |
| Enterprise | Chat prioritario + teléfono/WhatsApp de escalamiento | Account manager + on-call comercial |

Horario base: Lun–Vie 09:00–19:00 America/Lima. Enterprise: cobertura extendida 08:00–22:00 + on-call SEV-1.

## Tiempos de respuesta (primer contacto humano)

| Severidad | Estándar (Crece/Cadena) | Prioritario (Enterprise) |
|---|---|---|
| SEV-1 — caja no cobra / pérdida de ventas | 4 h hábiles | **1 h** calendario en ventana extendida |
| SEV-2 — fiscal/envío degradado, cobro OK | 1 día hábil | **4 h** hábiles |
| SEV-3 — consulta / config | 2 días hábiles | **1 día** hábil |

## Cobertura

- Incidentes de producto KipusPay (POS, sync, fiscal PSE plataforma, billing de suscripción).
- Guía de activación de facturación y lectura de estados (sin garantizar aceptación SUNAT).
- Onboarding asistido Enterprise (kickoff + checklist primera venta).

## Exclusiones

- Fallos de red del comercio, hardware de terceros no certificado, o impresoras sin ladder de Sprint 25.
- Aceptación/rechazo SUNAT (CDR): KipusPay acompaña; no garantiza aceptación.
- Integraciones a medida no contratadas; e-commerce (backlog v10).
- Exportación LPDP completa / borrado inmediato de retención fiscal (GTM-09 → Sprints 42/47).
- Promesas de features congeladas (matriz GTM-01..18).

## Escalamiento

1. L1 soporte → L2 ingeniería on-call (SEV-1/2).
2. SEV-1 > SLA → Staff Principal + postmortem en 5 días hábiles.
3. Disputa comercial de SLA → Staff PM (A) con registro en ledger.

## Activación GTM-02

Tras la firma de este documento en el Quality Gate del Sprint 13, el claim
**“soporte prioritario Enterprise”** queda **descongelado** en pricing/landing.
Crece y Arranque mantienen **soporte estándar** (sin claim prioritario).
