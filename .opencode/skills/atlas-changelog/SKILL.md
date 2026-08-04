---
name: atlas-changelog
description: Escribe una entrada nueva en Ledger.md con el schema v2 y la cadena de hashes real (prev_hash/entry_hash). Úsalo para registrar cualquier cambio de especificación, corrección o milestone.
allowed-tools: Bash(sed:*) Bash(grep:*) Bash(python3:*)
---

# atlas-changelog — Nueva entrada en el Ledger

Registra cambios normativos en `Ledger.md` (registro inmutable). **Nunca se editan ni borran entradas existentes**; toda corrección es una entrada nueva con `relacion: CORRIGE`.

## Procedimiento

1. Determina el próximo `id` (último id en `Ledger.md` + 1).
2. Localiza el bloque de la entrada anterior para obtener su `entry_hash` (ese valor será el `prev_hash` de la nueva).
3. Añade la nueva entrada **al final** del archivo, con el schema v2 (cada entrada envuelta en su propio fence ```` ``` ````):

```
id: NNNN
timestamp_utc: <ISO 8601 Z>
schema_version: 2
sprint_fase: <Sprint X — Fase Y>
agente_responsable: <rol>
tipo: <Entregable nuevo | Corrección de especificación | ...>
subtipo: <opcional>
relacion: <amplia | corrige | milestone | ...>
referencias_entradas: [<ids previos que toca>]
referencias_documentales: [<docs>]
prev_id: <id anterior>
prev_hash: <entry_hash de la entrada anterior>
entry_hash: __ENTRY_HASH__    # se rellena en el paso 5
ticket_or_adr: <ticket | ADR | referencia>
test_ids: [<tests>]
entregable_afectado: <doc §sección>
descripcion: >
  <qué cambió y por qué>
evidencia: >
  RED: <qué pasaba antes>
  GREEN: <evidencia del cambio>
ancestry_verified: true
aprobaciones: [Staff Principal, ...]
estado_gov: GOV-APROBADO      # o "EN REVISION" según gobernanza
estado: Vigente
```

4. **`prev_hash`:** copia el `entry_hash` de la entrada inmediatamente anterior (regla canónica vigente desde 0177).
5. **`entry_hash` propio:** SHA-256 de las líneas `id:` → `estado:` **inclusive**, **excluyendo** la línea `entry_hash`, sin fences ni líneas en blanco separadoras:

```bash
sed -n '<LINEA_ID>,<LINEA_ESTADO>p' Ledger.md | grep -v '^entry_hash:' | sha256sum
```

6. Verifica la cadena con `atlas-verify` (debe quedar `GREEN`).

## Contrato (no negociable)

- Append-only: jamás reescribir 0143–0176 (históricas; conservan "Atlas").
- Dinero en `_cents`; sin `REAL/float` (invariante 1).
- Cada regla referenciada debe existir en el Registry §0.4 (nunca IDs huérfanos).
