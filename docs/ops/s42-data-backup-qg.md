---
doc_id: ops-s42-data-backup-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 42 — Backup KPBK1 y restore dry-run — Quality Gate

**Estado software:** GREEN local  
**Estado producción/claim/cutover:** NO-GO  
**Capability:** `data.backup`, default-off  
**Spec:** Arquitectura §5.9 regla 27 · ADR-0026 · Roadmap FASE 6D

El gate automatizado demuestra el contrato de software en entorno local. No existe
evidencia de Cloudflare staging real, bindings externos ni firma humana independiente
A+V. Por ello no autoriza activación de producción, restore apply, cutover ni la
promesa “exporta todo tu historial sincronizado”.

## Evidencia RED→GREEN

| Hito | Run ID | Commit completo | Evidencia |
|---|---|---|---|
| RED contractual | `run-red-s42-kpbk1-contract-43d53d3` | `43d53d34465d0a79d43bcfb853412035fcbfec27` | Contratos KPBK1, registry/DAT-12, migración 0035, epoch, Worker/R2/KMS, POS, dry-run y chaos definidos; fallaban por implementación productiva ausente/incompleta |
| Implementación | `run-implementation-s42-26ecfcb` | `26ecfcb294edffb3f3f0a7f598a6db3400c4e440` | La implementación productiva quedó en la línea de ancestría entre RED y el hardening GREEN |
| GREEN + hardening | `run-green-s42-security-quality-acdd254` | `acdd25443957269437a079179df6c9ca0ab00228` | Remediación de límites de descarga, step-up, integridad de streaming y errores; suites y Quality Gate locales GREEN |

Ancestría verificada:
`43d53d34465d0a79d43bcfb853412035fcbfec27` →
`26ecfcb294edffb3f3f0a7f598a6db3400c4e440` →
`acdd25443957269437a079179df6c9ca0ab00228`.

**Expected failure RED:** no existía una implementación productiva completa que
satisficiera export KPBK1 cifrado, clasificación exhaustiva DAT-12, snapshot por epoch,
restore dry-run de cero escrituras y tolerancia local de fallos sin bloquear caja.

## Resultado local exacto

| Suite/check | Resultado observado |
|---|---|
| Worker API | 542 tests |
| POS web | 92 tests |
| Worker KMS | 2 tests |
| Adapters | 252 unit + 147 integration |
| Monorepo | 34/34 tareas de tests |
| Chaos harness | 91 tests; 97.16% líneas |
| Dominio | 106 tests; 99.37% líneas / 95.06% ramas |
| Chaos de backup | 500 ciclos locales deterministas, PASS |
| POS bundle | 120.75 kB gzip, dentro del presupuesto |
| `scripts/quality.sh` | `Quality Gate OK` |

Esta evidencia corresponde a ejecución local con fake bindings/workerd donde aplica.
No se presenta como ejecución de Cloudflare staging.

## Cobertura contractual

| Contrato | Evidencia local |
|---|---|
| KPBK1 | Bytes decrypted y `global_hash` reproducibles; ciphertext aleatorio; JSON/JSONL canónico, chunks acotados, hashes de tabla/chunk/objeto y rechazo estricto de formato/tamper |
| DAT-12/registry | Clasificación exhaustiva BUSINESS/DERIVED/EPHEMERAL/SECRET; incluye hijos tenant legacy; migración 0035 y down protegido |
| Epoch/offline-first | Mutación BUSINESS y epoch en el mismo batch; drift descarta/reintenta; venta concurrente completa sin bloqueo |
| Dry-run | Valida AEAD, hashes, schema, registry y tenant; cero escrituras BUSINESS D1 y cero put/delete R2; apply devuelve no disponible en S42 |
| KMS/KEK | Wrap/unwrap versionado y fail-closed local; rotación conserva payload; ninguna clave en claro |
| R2/Workflow | Multipart idempotente, resume por hash, abort/cleanup terminal, publicación `READY` solo completa y errores allowlisted |
| Tenant/RBAC | Capability default-off, tenant derivado de auth, 404 cross-tenant opaco, descarga/dry-run Owner con permiso y step-up one-shot |
| Integridad de descarga | AEAD y SHA-256 plaintext verificados antes de emitir cada unidad; headers no-store y memoria acotada |
| POS | Advierte alcance sincronizado y pendientes offline; backup/retry/abort no deshabilita venta, sync ni cierre Z; no existe control apply |

Tests de trazabilidad que resuelven en el monorepo:

- `packages/domain-integrations/src/data-backup-contract.test.ts`:
  `KPBK1 canonical backup contract`.
- `packages/adapters-d1/src/data-backup.integration.test.ts`:
  `Sprint 42 D1 backup schema and registry` y
  `Sprint 42 epoch reader and dry-run`.
- `apps/worker-api/src/data-backup-contract.test.ts`:
  `data.backup Worker flags, RBAC and tenant boundary` y
  `data.backup Workflow, R2 and KMS contracts`.
- `apps/pos-web/src/lib/data-backup-client.test.ts`: `data.backup POS seams`.
- `apps/pos-web/src/lib/data-backup-page.test.ts`:
  `Admin backups workbench source contract`.
- `packages/chaos-harness/src/data-backup-chaos.test.ts`:
  `Sprint 42 data-backup certification chaos`.

## Matriz chaos local — 500 ciclos

La matriz reparte 500 ciclos de forma balanceada entre 25 fallos, 20 ciclos por fallo,
y repite el resultado determinísticamente:

| Familia | Escenarios |
|---|---|
| Epoch/carga | checkout concurrente con drift; multipágina grande |
| R2/multipart | timeout, parcial, abort, resume, cuota, carrera ETag |
| KMS/crypto | indisponible, versión errónea, rotación, golden crypto negativo |
| Workflow | crash en reserve, export, manifest y ready |
| Tamper | manifest, chunk y tag alterados |
| Lifecycle/tenant | request duplicado, expirado, borrado, replay cross-tenant |
| Restore dry-run | pass y failure, ambos con cero cambios |

Resultado: 0 snapshots mixtos, leaks plaintext R2, leaks de claves D1, leaks sensibles
en logs, reuse de nonce, chunks finales duplicados, forks de audit, `READY` prematuro,
mutaciones dry-run, cleanup perdido, bloqueos de checkout, ganadores idempotentes
duplicados y tamper no detectado. El entorno declara
`LOCAL_FAKE_BINDINGS_WORKERD`, `realCloudflareStaging=false`, `externalR2=false` y
`externalKms=false`.

## Security Review y remediación

Una Security Review encontró **1 HIGH** y **3 MEDIUM**:

1. HIGH: descarga permitida a Admin y sin step-up Owner.
2. MEDIUM: `x-step-up-token` enviado pero no verificado server-side.
3. MEDIUM: streaming sin comparar SHA-256 plaintext con metadata D1 antes de emitir.
4. MEDIUM: errores de Workflow podían persistir/exponer detalles internos.

`acdd25443957269437a079179df6c9ca0ab00228` remedia los cuatro hallazgos con tests
enfocados: descarga Owner-only con permiso explícito, token opaco SHA-256 one-shot
acotado a tenant/user/action/backup y TTL corto, hash plaintext antes de enqueue y
errores/códigos allowlisted con `error_ref` opaco. También cubre KMS productivo y
elimina shortcuts de tenant de test.

No se ejecutó una segunda Security Review limpia. La evidencia solo afirma remediación
implementada y tests GREEN; la validación independiente permanece pendiente.

## Matriz residual externa

| Evidencia requerida | Estado | Condición de cierre |
|---|---|---|
| Cloudflare staging real | PENDIENTE / NO-GO | Ejecutar matriz en cuenta y tenant de staging controlados |
| R2 externo + multipart real | PENDIENTE / NO-GO | Timeout/partial/resume/abort/cleanup y tamper con evidencia |
| Workflow externo | PENDIENTE / NO-GO | Crash/replay/checkpoint/idempotencia y publicación atómica |
| Secrets Store externo | PENDIENTE / NO-GO | Confirmar cero material secreto en D1/R2/logs |
| KMS externo y rotación KEK | PENDIENTE / NO-GO | Unwrap versionado, indisponibilidad y rotación real |
| Restore dry-run externo | PENDIENTE / NO-GO | Cero writes D1/R2 demostrado con telemetría independiente |
| Restore apply/cutover | FUERA DE S42 / NO-GO | Pertenece a Sprint 48; ensayo, rollback y aprobación propios |
| RPO/RTO | NO MEDIDO / NO-GO | Medición y aceptación en Sprint 48 |
| Borrado inmediato LPDP | NO IMPLEMENTADO / NO-GO | Sprint 47; no prometer eliminación inmediata |
| Firma humana A+V independiente | PENDIENTE / NO-GO | A y V identificados firman evidencia externa reproducible |

## RACI real

| Rol | Quién | Estado |
|---|---|---|
| R | Staff SRE + Staff Data | Software local GREEN |
| Security | Staff Security | Hallazgos emitidos y remediados; segunda revisión independiente no realizada |
| A | Staff Principal | PENDIENTE para staging/producción/claim |
| V | Staff Security o Staff QA independiente | PENDIENTE; no hay firma humana independiente |
| Claim | Staff Growth + Staff PM | NO-GO |
| Restore cutover | Owner Sprint 48 | FUERA DE ALCANCE S42 |

## Veredicto

**SOFTWARE-GREEN-CLAIM-NO-GO.** El software y gate automatizado quedan GREEN local.
La capability permanece default-off. La promesa “exporta todo tu historial
sincronizado” continúa congelada y condicionada a staging Cloudflare real con bindings
externos y firma independiente A+V. No se afirma restore aplicado, RPO/RTO, borrado
inmediato LPDP ni readiness de producción; restore apply pertenece a Sprint 48.
