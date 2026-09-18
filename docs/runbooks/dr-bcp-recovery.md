---
doc_id: runbook-dr-bcp-recovery
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Runbook — Recuperación DR/BCP (pérdida de shard D1)

| Campo | Valor |
|---|---|
| Severidad tipica | SEV-1 (shard caído = caja detenida para ese tenant) |
| Owner on-call | Staff SRE + Staff Backend ACID |
| Ultima ensayada | 2026-09-17 (restore/RPO observados en staging con `registry-5`; la cifra RTO precede la corrección del cronómetro y requiere re-ensayo; no incluye cutover/rollback) |
| Relaciona | Arquitectura §5.3 regla 32b · §5.9 regla 27 · ADR-0026 · Proceso §9.1 · Sprint 14/48 |

## Objetivos declarados

- **RPO = 0** en tx ACID comprometidas: el shard D1 es la fuente de verdad; el
  backup es para reconstruir un shard perdido, no para re-fechar.
- **RPO ≤ 1 día** en rollups (`daily_financial_rollups`): el simulacro verifica
  que el último rollup cubre ayer (Lima).
- **RTO ≤ 30 min por shard**: dry-run → verify → apply medido en el simulacro
  (`rto_ms` en el audit `DR_SIMULATION_PASSED`).

## Sintomas

- Error 5xx persistente de D1 en un tenant/shard (`DB_UNAVAILABLE` en worker-api).
- `runBackupStatusHttp` muestra el último backup `READY`; `DR_SIMULATION` más
  reciente ausente o con `verdict` distinto de `PASSED`.
- Posible corte regional Cloudflare (D1/Workers) con colas de sync offline
  acumulándose (los POS siguen cobrando offline — la venta nunca se cae).

## Diagnóstico rápido (<5 min)

1. Confirmar el alcance: ¿un tenant, un shard o la cuenta completa?
2. Verificar el último backup `READY` del tenant: `GET /api/backups` (owner).
3. Ejecutar el simulacro DR (game day) antes de tocar nada:
   `POST /api/dr/simulation` con `x-step-up-token` (owner). El veredicto
   `PASSED` confirma que el snapshot es restaurable dentro del RTO.

## Simulacro — Restore a shard DR aislado

> El apply del simulacro escribe en el binding `DR_DB` (shard DR aislado), jamás
> en producción viva. Un shard nuevo se conecta por composición (wrangler var),
> no por cambio de base de datos en caliente.

1. Usar únicamente un `DR_DB` aislado, con migraciones aplicadas; nunca
   redirigir el binding del shard productivo durante el simulacro.
2. Ejecutar el simulacro: `POST /api/dr/simulation` (owner + step-up).
   - `verdict: PASSED` → RPO/RTO ok; continuar.
   - `verdict: RTO_EXCEEDED` → revisar tamaño/tiempos de snapshot (chunks R2,
     KMS unwrap); el shard NO se considera recuperado hasta RTO cumplido.
   - `verdict: RPO_VIOLATION` → el backup no contiene todas las tx; buscar el
     snapshot más reciente que pase (re-ejecutar con `backupId` explícito).
3. Verificar el replay de colas: el simulacro devuelve
   `replayDuplicatesBlocked ≥ 3` (offline sales, store-credit source_ref,
   fiscal outbox) — 0 duplicados de efectos.
4. Registrar el resultado y detenerse. `DR_SIMULATION_PASSED` acredita solo la
   restauración/verificación en el shard DR aislado; no autoriza cutover,
   escritura productiva ni afirma que ventas nuevas hayan sido conmutadas.

## Failover productivo — NO PROCEDIMENTADO

El repositorio no implementa ni valida automáticamente cutover de tráfico,
conmutación de bindings/DNS, ni rollback tras admitir escrituras en el shard
restaurado. Ante una pérdida real de shard, mantener el tráfico sin cambios y
escalar a Staff SRE + Staff Principal + PM para una decisión explícita y un
plan de continuidad específico. No ejecutar pasos manuales de cutover basándose
solo en este runbook o en un simulacro `PASSED`. Este apartado queda NO-GO hasta
que exista procedimiento aprobado, prueba de rollback/cutover en staging y
firmas QA/A/V independientes.

## Qué NO hacer

- NO restaurar sobre producción viva con datos más nuevos (INSERT OR IGNORE es
  para el shard DR aislado; mezclar epoch rompe la cadena de auditoría).
- NO afirmar RPO=0 con un snapshot que no incluya la última tx: el simulacro
  falla `rpoTxZero` y eso es la señal de que falta re-exportar.
- NO saltarse el step-up token: el simulacro y el restore son owner-only.
- NO prometer "DR multi-región" sin evidencia de staging: el QG S48 mantiene
  producción NO-GO hasta R2 externo + Workflow real + firmas A/V.

## Rollback del simulacro

No hay rollback de tráfico que documentar: el simulacro no conmuta tráfico ni
escribe en producción. Puede repetirse idempotentemente sobre `DR_DB`
(`INSERT OR IGNORE` por PK). El rollback de un cutover real está pendiente de
un procedimiento aprobado y ensayado; no asumir que revertir un binding basta
una vez que el shard nuevo haya aceptado escrituras.

## Escalamiento

| Condición | Escalar a |
|---|---|
| Veredicto RPO_VIOLATION persistente | Staff Backend ACID + Staff Data (re-export) |
| RTO > 30 min en staging real | Staff SRE + Staff Principal |
| Pérdida de tx comprometidas NO recuperable | Staff Principal + PM (reporte) |

## Postmortem

- Entrada de ledger (tipo Corrección / incidente): `id: ____`
- Acción preventiva con sprint owner: simulacro anual (Sprint 48 → 53 y
  siguientes); registrar `DR_SIMULATION_*` en el audit del tenant afectado.
