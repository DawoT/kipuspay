---
doc_id: adr-0026-kpbk1-backup-envelope
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0026 — KPBK1 y cifrado de envoltura para backups

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-08 |
| Decisores | Staff Principal · Staff SRE · Staff Data · Staff Security |
| Consultados | Staff Backend D1 · Staff Frontend · Staff QA · Staff Growth |
| Informados | Staff PM · Staff Support |
| Relaciona | Arquitectura §5.9 regla 27 · Roadmap Sprint 42 · Sprint 48 · DAT-12 · CAL-04 |

## Contexto

Un export útil debe cubrir el negocio completo sin copiar secretos, demostrar integridad
de D1 y objetos R2, tolerar mutaciones concurrentes sin detener caja y seguir siendo
restaurable después de rotar claves. “Reproducible bit-a-bit” era ambiguo: cifrado GCM
seguro exige aleatoriedad, mientras la evidencia de contenido exige determinismo.
Además, Sprint 42 no tiene alcance para aplicar una restauración.

## Decisión

1. Adoptar `KPBK1`: manifest y JSONL canónicos, orden fijo de tablas/columnas/PK,
   chunks plaintext de hasta 4 MiB y hashes por chunk, tabla, objeto y contenido
   global, según Arquitectura §5.9.
2. Un registry exhaustivo clasifica tablas tenant como `BUSINESS`, `DERIVED`,
   `EPHEMERAL` o `SECRET`; incluye hijos legacy por su grafo FK y falla ante cualquier
   tabla o columna no clasificada.
3. El export incluye D1 BUSINESS y objetos R2 BUSINESS referenciados. Manifiesta, pero
   excluye, secretos/credenciales, sesiones/tokens efímeros, derivados regenerables y
   cambios IndexedDB aún no sincronizados.
4. `tenant_data_epoch` detecta drift: se relee al final, se reintenta desde cero hasta
   tres veces y luego aborta sin bloquear operaciones POS.
5. El hash y los bytes **descifrados** son deterministas para el mismo snapshot; cada
   backup usa DEK y nonces aleatorios, por lo que el ciphertext debe diferir.
6. Cada backup usa un DEK AES-256-GCM aleatorio, nonce único de 96 bits por unidad y
   AAD tenant/backup/formato/tipo/ordinal. `BACKUP_KMS` envuelve el DEK con una KEK
   versionada. No se persisten claves en claro.
7. Sprint 42 entrega únicamente export y restore dry-run con cero escrituras BUSINESS.
   Restore apply y objetivos DR operativos pertenecen a Sprint 48.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Dump completo del shard D1 | Mezcla tenants, secretos y estado efímero; no modela objetos R2 |
| Selección manual no exhaustiva | Omite silenciosamente tablas nuevas o hijos legacy |
| Snapshot por lock global | Compite con el write-lock de D1 y puede detener caja |
| Ciphertext determinista | Fuerza nonce/key reuse o filtra igualdad; contradice AES-GCM seguro |
| Una clave fija en D1/R2 | Expone material de cifrado y hace insegura la rotación |
| Restaurar directamente en Sprint 42 | Amplía el blast radius sin contrato de merge/rollback de Sprint 48 |
| Incluir IndexedDB pendiente | El servidor no posee ni puede verificar esos cambios |

## Consecuencias

- **Gana:** alcance verificable, export tenant-safe, evidencia determinista de contenido,
  tamper detection de D1/R2, rotación KMS y caja disponible durante retry/abort.
- **Paga:** registry mantenido con el schema, epoch en toda mutación BUSINESS, staging
  multipart, seis tablas objetivo en migración 0035 y Workflow de implementación futura.
- **Invariantes tocadas:** DAT-12, `db.batch([...])`, offline-first, revocación/
  dependencias fail-closed, zero secretos y capability flags default-off.
- **Activación:** contratos RED y gobernanza en Sprint 42; producción solo tras GREEN,
  evidencia runtime y firma Security/SRE. Apply queda reservado a Sprint 48.

## Evidencia de cierre

- Tests/checks: contratos RED de formato/registry, D1/migración/epoch, Workflow-R2-KMS-
  HTTP, POS/offline y chaos 500; `scripts/verify.sh`.
- Ledger: pendiente de implementación GREEN; el baseline RED no cierra Sprint 42.
- Firmas RACI: `R` Staff SRE/Data · `A` Staff Principal ·
  `V` Staff Security/Staff QA independiente.
