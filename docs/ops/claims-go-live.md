---
doc_id: claims-go-live
alias: Claims
authority: normativa
owner: "@DawoT"
---

# Matriz de claims — estado, evidencia y responsables (cierre del proyecto)

> Creada en el Sprint C1 del cierre. Es la fuente única de la planificación
> `pending-batches.yaml` (bloque `go-live-*`). Un claim pasa a vendible solo
> con su QG cerrado (evidencia interna + externa + firmas A+V independientes).

## Claims congelados / condicionados

| Claim | Capability | Software | Evidencia interna (cerrada) | Evidencia externa (pendiente) | Gate | Responsable |
|---|---|---|---|---|---|---|
| Emisión SUNAT en vivo (GTM-07/08) | `fiscal.cpe` | GREEN local y **e-beta** (pipeline SOAP `sendBill`/`sendSummary` + XAdES Worker; complementary RC; FL-0 fail-closed `MISCONFIGURED`≠mock) | submit HTTP→PSE (código), SOAP e-beta (piloto TENANT_CERT), CDR, drain outbox→R2→SENT, DLQ | QG GTM-08: mismo ticket **ACCEPTED en D1 y visible en SOL prod o OSE/PSE acreditado**. e-beta **no** basta. FASE FL-1..FL-4 / S11–S16 WAIT (pass CDT / URL PSE / auth e-factura). Firma A+V. `go-live-sunat` permanece `AGENDADO_AL_FINAL` hasta entonces | GTM-08 / FASE FL | Staff Fiscal + Staff Security |
| Alertas push + caja móvil PWA Android (GTM-26) | `mobile.push`, `client.mobile_pos` | GREEN local (KMS push sellado, batch I) | PushKmsCore, acks, AES-GCM | Web Push VAPID + FCM HTTP v1 staging real (ACK `DISPLAYED` p95<10 s, ≥99%); 500 ventas offline Android físico gama baja; firmas Mobile+QA+Security | s45 | Staff Mobile + Staff QA |
| Membresías / ventas recurrentes (GTM-25) | `sales.recurring` | GREEN local (sellado batch A) | UI + recurrencia con deuda/gracia | cron/staging/canary Cloudflare real; QA humana; PM A+V | s44 | Staff PM + Staff QA |
| Pedidos con retiro (GTM-24) | `orders.customer_orders` | GREEN local (sellado batch A) | UI + reserva + leases | staging/piloto externo; QA humana; PM A+V | s43 | Staff PM + Staff QA |
| Export "cuando quieras" + LPDP ARCO (GTM-09) | `compliance.lpdp` | GREEN local (admin batch H + titular self-serve C3; rate-limit/anti-enum) | consent/export/erase admin + `/lpdp` titular | staging R2/Workflow/Secrets/KMS reales; política publicada; A+V | s42/s47 | Staff Security + Staff Data |
| DR/BCP (GTM-18) | `platform.dr` | GREEN local (backup sellado batch A) | backups versionados + QG S42 | restauración probada + simulacro `DR_SIMULATION`; RPO/RTO por shard | s48 | Staff SRE + Staff Principal |
| Agentic insights / briefing (GTM-10) | `analytics.agentic_insights` | GREEN local (sellado batch F) | UI asistente + forecasting | cron/staging real; QA humana; PM A+V | s49 | Staff PM + Staff Data |
| Etiquetas de precio (GTM-17, S41) | `reporting.catalog` | GREEN local | snapshots server-side, plantillas | matriz física (impresoras/perfiles compatibles); firma A+V | s41 | Staff Hardware + Staff QA |
| Backup (S42) | `platform.backup` | GREEN local (sellado batch A) | UI + KMS wrap/unwrap real (batch I) | staging Cloudflare real, R2 multipart, Workflow, Secrets, KMS externos + rotación | s42 | Staff SRE |
| Comandas/KDS + salón + split | `orders.kds` | GREEN local (UI C2 + correlativo CAS en split) | kds-pending, salón, split e2e de contrato | staging externo cocina/salón; firma A+V | C2 + s43 | Staff QA + Staff Mobile |
| Arqueo Z ciego (PIN/auditoría) | `cash.blind_z` | GREEN local (sellado batch A) | cierre Z ciego + PIN descuentos | matriz de caja física; firma A+V | s53 | Staff QA + Staff Hardware |
| Prueba social / badges (GTM-12) | — | — | copy aprobado | testimonios con permiso; certificación con respaldo vigente | GTM-12 | Staff Growth + Staff Fiscal |
| Offline en producción | `pos.offline` | GREEN local (sellado batches A–J) | cola offline, sync, reconciliación | piloto real con dispositivos; firma A+V | s53-ext | Staff QA + Staff Mobile |

## Claims descongelados en el cierre (C1)

| Claim | Gate | Estado |
|---|---|---|
| FEFO / lotes con vencimientos (recetas/BOM) | GTM-16 (S18) | **Live** — pricing y PUBLIC_CLAIMS alineados (sin "En preparación") |
| Merma / transferencias entre locales | GTM-13 (S20) | **Live** — ídem |
