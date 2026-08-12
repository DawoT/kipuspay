---
doc_id: runbook-backup-restore-incident
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Runbook — Incidente de backup y restore dry-run

| Campo | Valor |
|---|---|
| Severidad tipica | SEV-2; SEV-1 si hay exposición cross-tenant o de plaintext/clave |
| Owner on-call | Staff SRE + Staff Data |
| Ultima ensayada | Solo simulación local Sprint 42; staging real pendiente |
| Relaciona | Arquitectura §5.9 regla 27 · ADR-0026 · Proceso §9.1 · Sprint 42/48 |

> Para la recuperación completa de un shard (pérdida de D1) usar
> [`dr-bcp-recovery.md`](dr-bcp-recovery.md) (Sprint 48, RPO/RTO y game day).

## Sintomas

- Backup detenido en `PENDING`, `SNAPSHOTTING` o `UPLOADING`, reintentos por
  `BACKUP_EPOCH_DRIFT`, fallo KMS/Workflow/R2 o multipart huérfano.
- Backup `FAILED`, descarga rechazada, hash/tag/manifest inválido, versión KEK
  desconocida o dry-run fallido.
- `READY` sin manifest completo, acceso cross-tenant, plaintext/material de claves en
  D1/R2/logs o error interno expuesto: tratar como incidente de seguridad.
- La capability `data.backup` o su UI aparece habilitada fuera del tenant autorizado.

## Impacto

El tenant puede perder temporalmente la creación, descarga o validación dry-run del
export. La venta POS, cobro, sincronización y cierre Z permanecen abiertos: nunca se
pausan para recuperar un backup. Sprint 42 no aplica restauraciones ni autoriza un
cutover de producción; restore apply pertenece a Sprint 48.

## Diagnóstico rápido (<5 min)

1. Confirmar tenant, `backup_id`, estado, `error_code` allowlisted y `error_ref`; no
   copiar PII, tokens, R2 keys, wrapped DEK ni mensajes internos al ticket.
2. Verificar que `data.backup` sigue default-off salvo el tenant piloto. Ante duda,
   apagar el flag y pausar nuevas ejecuciones del Workflow.
3. Clasificar la falla: KMS/KEK, Workflow, R2/multipart, drift de epoch, integridad/
   tamper o autorización/tenant.
4. Confirmar que caja, sync y cierre Z siguen disponibles. Si se bloquearon, elevar
   inmediatamente a SEV-1 por violación offline-first.
5. Preservar IDs, timestamps UTC, hashes, epoch inicial/final, versión KEK, estado de
   multipart y audit chain; no descargar ni descifrar payload para diagnosticar.

## Mitigación segura

1. Apagar `data.backup` para el tenant afectado o globalmente y pausar nuevas
   instancias del Workflow. No cambiar las rutas de venta.
2. Dejar no descargable todo artefacto que no esté `READY` con manifest completo.
3. Para fallo terminal, cancelación o drift agotado, abortar el multipart mediante su
   referencia opaca y borrar solo keys de staging del `backup_id`; verificar cero
   partes huérfanas antes de cerrar. Nunca borrar objetos BUSINESS fuente.
4. Reanudar multipart únicamente si cada parte confirmada coincide con su hash de
   ciphertext. Ante conflicto, abortar y reiniciar con DEK/nonces nuevos.
5. Mantener el flag apagado hasta que la causa esté contenida y el dry-run local
   vuelva a pasar. No ejecutar ni improvisar restore apply.

## Casos de diagnóstico

| Caso | Acción fail-closed |
|---|---|
| KMS no disponible o KEK desconocida | Marcar fallo allowlisted, no publicar `READY`, no rotar ni sustituir KEK manualmente; escalar a owner KMS |
| Workflow caído/replay | Pausar nuevas instancias; reanudar desde checkpoint idempotente o abortar staging; comprobar un solo ganador y audit chain lineal |
| R2 timeout/cuota/parte incompleta | No publicar; abortar o reanudar multipart según hash; comprobar cleanup de todas las partes |
| Epoch cambió durante lectura | Descartar staging y reintentar desde cero hasta el límite; al tercer drift, `BACKUP_EPOCH_DRIFT` sin bloquear POS |
| Manifest/chunk/tag/object hash alterado | Aislar artefacto, cortar descarga antes de emitir la unidad corrupta, preservar hashes y elevar a Security |
| Cross-tenant o token inválido/reusado | Responder opaco/fail-closed, apagar capability, preservar audit y elevar a SEV-1 |
| Dry-run intenta escribir | Detener proceso y capability; preservar traza. Cero `INSERT`/`UPDATE`/`DELETE` BUSINESS y cero put/delete R2 es invariante S42 |

## Rollback y down guard

- Rollback operativo: flag apagado + Workflow pausado; conservar metadata y audit.
  Rehabilitar solo para un tenant autorizado después de validar create/status/download/
  dry-run y cleanup. La caja no forma parte del rollback.
- No ejecutar la migración down 0035 mientras exista un backup no `DELETED`, cualquier
  dry-run o un chunk/objeto registrado. El down debe abortar en ese estado y solo puede
  eliminar hijos antes que padres cuando el guard demuestre cero evidencia activa.
- No restaurar datos a producción en Sprint 42. La decisión, simulación y rollback de
  restore apply/cutover se diseñan y prueban en Sprint 48.

## Escalamiento

| Condición | Escalar a |
|---|---|
| POS, sync o cierre Z bloqueado | SEV-1 · Staff Principal + Staff SRE + owner POS |
| Cross-tenant, plaintext/clave, tamper no detectado o error sensible expuesto | SEV-1 · Staff Security + Staff Principal + Legal/LPDP |
| KMS/KEK o Secrets Store externo | Staff Security + owner KMS/Secrets |
| Workflow/R2/multipart sin cleanup | Staff SRE + Staff Data |
| Epoch drift persistente o DAT-12 inconsistente | Staff Data + Staff Backend D1 |
| Solicitud de restore apply/cutover | Rechazar en S42; Staff Principal + owner Sprint 48 |

## Retención de evidencia y postmortem

- Retener audit chain, IDs opacos, hashes, epochs, versión KEK, métricas de cleanup,
  códigos allowlisted, commit desplegado y timeline UTC según la política de incidentes.
- No retener tokens raw, DEK/KEK, plaintext, PII, SQL/R2 provider details ni dumps.
- Registrar toda corrección en una entrada nueva del ledger; nunca reescribir entradas.
- Asociar acción preventiva y owner de Sprint 42/48. La evidencia local S42 no sustituye
  ensayo real de staging, RPO/RTO, restore cutover ni firma independiente A+V.
