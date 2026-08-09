---
doc_id: runbook-recurring-sales-incident
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Runbook — Incidente de ventas recurrentes

| Campo | Valor |
|---|---|
| Severidad típica | SEV-2 si hay doble efecto, omisión o drift; SEV-3 si solo hay backlog acotado |
| Owner on-call | Staff Backend ACID + Staff SRE |
| Última ensayada | 2026-08-08 (suite local/chaos; staging externo pendiente) |
| Relaciona | Arquitectura §5.11 · ADR-0028 · Proceso §9.1 |

## Síntomas

- Ocurrencia duplicada o ausente para `tenant_id` × `plan_id` × `period_start`.
- Lease vencido que no puede reclamarse, token stale aceptado o dos workers aparentan
  haber liquidado el mismo período.
- Venta y NV/CPE existen sin una única CxC o evento de cupo, o alguno existe sin la
  venta; estado fiscal, AR, usage y ocurrencia no coinciden.
- Stock físico descontado parcialmente ante una liquidación fallida, o servicio que
  alteró stock.
- Catch-up atrasado, fuera de orden o detenido continuamente en su límite.
- Gracia aplicada antes de tiempo, plan que sigue después de
  `PAUSE_FUTURE_EXECUTION`, checkout ordinario bloqueado por mora, o prorrateo
  duplicado/incorrecto.

## Impacto

La generación de nuevas ocurrencias puede pausarse por tenant o globalmente. El POS
ordinario, la venta offline, caja, impresión, emisión fiscal normal y reconciliación
de ventas no recurrentes permanecen disponibles. Nunca se apaga la caja para contener
una membresía.

## Diagnóstico rápido (<5 min)

1. Acotar tenant, plan, versión y período civil `America/Lima`; capturar estado,
   `next_run_at`, retry, lease hash/expiración, idempotency key y últimos
   `RECURRING_*` audit events.
2. Verificar unicidad de ocurrencia y correspondencia 1:1 con venta, una CxC, NV o
   fiscal outbox, usage y líneas aplicadas. No exponer token crudo, SQL ni PII.
3. Comparar stock agregado/movimientos para líneas físicas y confirmar cero mutación
   para servicios. Un fallo debe dejar todos los efectos en cero.
4. Validar calendario semiabierto, ancla, FIXED/CURRENT, catch-up pendiente y orden de
   períodos; no derivar el siguiente período desde la hora de finalización.
5. Revisar mora, deadline de gracia y política posterior; para cancelación inmediata,
   verificar días civiles, ajuste único y NC/NV_RETURN sin mutación de la venta origen.

## Mitigación reversible

1. Apagar `sales.recurring` para el tenant afectado o pausar el cron recurrente; no
   cambiar el flag de checkout ni el cron diario de rollups.
2. Conservar leases y esperar su expiración natural si el owner está stale. No borrar
   token hashes, bajar TTL retroactivamente ni fabricar un lease.
3. Pausar solo el plan afectado cuando el aislamiento esté probado. Mantener lectura,
   auditoría y ventas ordinarias disponibles.
4. No reescribir manualmente con SQL venta, sale items, CPE/NV, CxC, usage, stock,
   ocurrencia, calendario, prorrateo ni auditoría.
5. Reconciliar reintentando el scheduler idempotente con el mismo plan/período. Si una
   venta válida requiere corrección, usar el flujo normal de NC/NV_RETURN; nunca
   mutar o borrar el comprobante original.

## Reconciliación y verificación

- Existe como máximo una ocurrencia, venta, CxC, documento y consumo por período.
- Un período omitido vuelve por catch-up en orden; alcanzar el límite deja el siguiente
  pendiente sin saltarlo.
- Retry y takeover tras expiry producen un único ganador; el token stale no muta.
- Venta, documento, CxC, usage y stock se confirman juntos o todos quedan ausentes.
- FIXED conserva snapshot; CURRENT usa catálogo servidor; ambos conservan historia.
- Prorrateo replay devuelve el mismo ajuste y documento; la venta origen no cambia.
- Gracia solo afecta futuras ejecuciones de ese plan y checkout ordinario sigue sano.

Antes de reactivar, ejecutar tests enfocados, chaos determinista y comparar la cola
con los audit events. En producción, exigir telemetría de staging/canary y aprobación
del owner del incidente.

## Rollback y guard de down

El rollback operativo preferido es capability default-off más pausa del cron
recurrente; ambos son reversibles y preservan evidencia. El down de migración `0037`
debe abortar con `RECURRING_SALES_DOWN_PROTECTED` si cualquiera de sus cinco tablas
contiene filas. Nunca borrar datos para franquear el guard ni ejecutar down con leases,
backlog, reconciliación o incidente abiertos.

## Escalamiento

| Condición | Escalar a |
|---|---|
| Duplicado, omisión, commit parcial, stock drift o audit fork | Staff Principal + Staff Backend ACID + Staff Data |
| Lease stale aceptado, token replay o cruce de tenant/plan | Staff Security + Staff Backend ACID |
| CPE/NV, CxC o usage no concilian | Staff Fiscal + Staff Finance + Staff Backend ACID |
| Backlog supera catch-up o cron no despacha exactamente | Staff SRE + owner Worker |
| Gracia/prorrateo incorrecto | Staff Domain + Staff Finance + Staff Fiscal |
| Impacto alcanza checkout ordinario/offline | SEV-1: Staff Principal + Staff SRE |

## Postmortem

- Registrar tenant/plan/período, primer síntoma, lease ganador, efectos observados,
  mitigación, reconciliación idempotente y prueba de disponibilidad del POS.
- Añadir una entrada append-only al ledger si hubo incidente, corrección o cambio.
- No cerrar hasta verificar cron diario intacto, cero SQL manual y cero claim de
  autocobro, tarjeta guardada o continuidad post-gracia.
