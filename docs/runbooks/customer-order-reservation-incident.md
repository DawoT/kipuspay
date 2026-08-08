---
doc_id: runbook-customer-order-reservation-incident
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Runbook — Incidente de reserva de pedido de cliente

| Campo | Valor |
|---|---|
| Severidad típica | SEV-2 si hay drift o riesgo de doble efecto; SEV-3 si solo falla el aviso |
| Owner on-call | Staff Backend ACID + Staff SRE |
| Última ensayada | 2026-08-08 (suite local/chaos; staging externo pendiente) |
| Relaciona | Arquitectura §5.10 · ADR-0027 · Proceso §9.1 |

## Síntomas

- Reserva atascada: pedido `OPEN`/`PARTIAL` vencido que conserva remanente reservado.
- Reserva fantasma: stock agregado o granular figura reservado sin pedido vigente que lo explique.
- Drift de conservación: para un ítem no se cumple
  `requested = fulfilled + released + reserved`, o una dimensión de lote, ubicación,
  serie o UOM no coincide con el agregado de sucursal.
- Aviso fallido: `EXPIRY_WARNING` queda en `RETRY`, `ESCALATED` o `FAILED`, aumenta
  `attempt_count` o no avanza `next_attempt_at`.
- Replay de lease: el mismo envelope/nonce intenta crear otro fulfillment o venta,
  o un lease expirado/ajeno intenta mutar el pedido.
- Carrera de expiración: fulfill, cancel y expire compiten y aparecen doble venta,
  doble liberación, estado terminal incoherente o versión sin ganador único.

## Impacto

El flujo de retiro puede quedar temporalmente degradado o pausado. El checkout
ordinario, la venta offline, el cobro, la impresión y su reconciliación permanecen
disponibles; nunca se apagan para proteger una reserva. Un fallo de transporte de
aviso tampoco bloquea caja ni retiene stock vencido indefinidamente.

## Diagnóstico rápido (<5 min)

1. Acotar `tenant_id`, `branch_id`, `customer_order_id`, versión, estado,
   `reserved_until`, último `audit_event` e idempotency key; no usar IDs aportados por
   otro tenant.
2. Comparar por ítem las cuatro cantidades de conservación y las mismas dimensiones
   de producto, lote, ubicación, serie y UOM contra los movimientos de inventario.
3. Revisar fulfillments por envelope, token hash, nonce, terminal/sesión activa,
   expiración, idempotency key, `sale_id` y ganador de versión.
4. Revisar la intención `EXPIRY_WARNING`, canal, estado, intentos, próximo retry y
   error allowlisted. Confirmar que la intención durable precede al release.
5. Clasificar: solo dispatcher/aviso; lease replay sin mutación; carrera resuelta
   idempotentemente; o drift/doble efecto. Si hay drift o doble efecto, pausar
   inmediatamente las mutaciones de pedidos para el tenant afectado.

## Mitigación reversible

1. Mantener `orders.customer_orders` default-off o apagarla para el tenant afectado.
   Si el problema es solo de transporte, pausar el dispatcher de avisos y conservar
   las intenciones D1 para retry; no pausar el checkout ordinario.
2. Bloquear temporalmente create/fulfill/cancel/expire de pedidos cuando exista drift,
   dejando lectura y evidencia auditables disponibles.
3. No editar cantidades, estados, versiones, stock ni movimientos con SQL manual.
   No borrar leases, avisos ni idempotency keys para forzar un retry.
4. Ejecutar la reconciliación autoritativa soportada: volver a verificar pedido,
   movimientos, venta y ganador idempotente; reintentar solo mediante el comando o
   dispatcher de dominio con la misma identidad.
5. Para aviso fallido, conservar `RETRY`/`ESCALATED`, habilitar seguimiento `IN_APP`
   y reanudar el dispatcher solo después de validar que no duplica intención ni
   release.
6. Para lease replay o expirado, devolver el resultado idempotente o conflicto
   recuperable; nunca crear una venta sustitutiva ni alterar stock manualmente.

## Reconciliación y verificación

- Cada ítem vuelve a cumplir la igualdad de conservación y ninguna cantidad es negativa.
- Stock agregado y granular concuerdan con reserva, fulfill y release exactamente una vez.
- Existe un único ganador entre fulfill/cancel/expire y la cadena de auditoría no tiene fork.
- Replay devuelve el resultado previo; lease expirado, terminal sin sesión activa o
  scope ajeno no muta pedido ni crea venta.
- El aviso durable existe antes del release; un transporte fallido queda observable y
  no bloquea caja.
- Ejecutar los tests enfocados y un ciclo de chaos antes de reactivar por tenant.

## Rollback y guard de down

Apagar la capability y pausar el dispatcher son el rollback operativo preferido; son
reversibles y preservan evidencia. La migración down `0036` solo puede ejecutarse
cuando no exista ningún pedido, ítem, fulfillment ni notificación. Su guard debe
abortar ante cualquier dato: nunca se elimina información para facilitar rollback.
No desplegar un down durante reconciliación, incidente abierto o cola pendiente.

## Escalamiento

| Condición | Escalar a |
|---|---|
| Drift, doble venta/liberación, audit fork o guard ACID fallido | Staff Principal + Staff Backend ACID + Staff Data |
| Replay aceptado, acceso cross-branch/tenant o terminal sin sesión activa | Staff Security + Staff Backend ACID |
| Avisos acumulados sin bloquear caja | Staff SRE + owner del adapter de mensajería |
| Down bloqueado por datos o rollback inseguro | Staff Principal + Staff Data |
| Impacto alcanza checkout ordinario/offline | SEV-1: Staff Principal + Staff SRE |

## Postmortem

- Registrar evidencia, tenant/sucursal afectados, primer síntoma, ganador de carrera,
  reconciliación aplicada y prueba de conservación.
- Añadir entrada append-only al ledger si hubo incidente, corrección o cambio operativo.
- No cerrar hasta demostrar que caja ordinaria permaneció disponible y que no se
  fabricó entrega externa de WhatsApp/push.
