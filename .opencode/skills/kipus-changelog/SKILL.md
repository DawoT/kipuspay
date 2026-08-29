---
name: kipus-changelog
description: Escribe una entrada nueva en docs/LEDGER.md con el schema v2 y la cadena de hashes real (prev_hash/entry_hash). Úsalo para registrar cualquier cambio de especificación, corrección o milestone.
allowed-tools: Bash(sed:*) Bash(grep:*) Bash(python3:*) Bash(git merge-base:*)
---

# kipus-changelog — Nueva entrada en el Ledger

Registra cambios normativos en `docs/LEDGER.md` (registro inmutable). **Nunca se editan ni borran entradas existentes**; toda corrección es una entrada nueva con `relacion: CORRIGE`. El hook `pre-commit` lo verifica (V-16) y la cadena de hashes se valida con `kipus-verify` (V-13).

## Procedimiento

1. Determina el próximo `id` (último id en `docs/LEDGER.md` + 1).
2. Localiza el bloque de la entrada anterior para obtener su `entry_hash` (ese valor será el `prev_hash` de la nueva).
3. Añade la nueva entrada **al final** del archivo, con el schema v2 (cada entrada envuelta en su propio fence ```` ``` ````):

```text
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
test_ids: [<tests o checks V-NN>]
red_commit_sha: <SHA 7-40 hex real | N/A — milestone de especificación (pre-código)>
red_run_id: <run-xxx | N/A — milestone de especificación>
expected_failure: <AssertionError mensaje | N/A si no es código>
green_commit_sha: <SHA 7-40 hex real | N/A — milestone>
green_run_id: <run-xxx | N/A>
ancestry_verified: true
entregable_afectado: <doc §sección>
descripcion: >
  <qué cambió y por qué>
evidencia: >
  RED: <qué pasaba antes>
  GREEN: <evidencia del cambio>
aprobaciones: [Staff Principal, ...]
estado_gov: GOV-APROBADO      # o "EN REVISION" según gobernanza
estado: Vigente
```

4. **`prev_hash`:** copia el `entry_hash` de la entrada inmediatamente anterior (regla canónica vigente desde 0177).
5. **`entry_hash` propio:** SHA-256 de las líneas `id:` → `estado:` **inclusive**, **excluyendo** la línea `entry_hash`, sin fences ni líneas en blanco separadoras:

```bash
sed -n '<LINEA_ID>,<LINEA_ESTADO>p' docs/LEDGER.md | grep -v '^entry_hash:' | sha256sum
```

6. **`ancestry_verified: true`** — reachability TDD (CAL-07 §13.9, `scripts/checks/tdd_evidence.py`): para entradas de código, verifica `red_commit_sha` ancestro de `green_commit_sha` y ambos ancestros de `HEAD`:

```bash
git merge-base --is-ancestor <red_commit_sha> <green_commit_sha> && git merge-base --is-ancestor <green_commit_sha> HEAD && git merge-base --is-ancestor <red_commit_sha> HEAD
```

Milestones pre-código usan `N/A` y quedan exentos (`V-20` los considera no-código). Ejemplo canónico: `docs/LEDGER.md` entrada `0534`.

7. Verifica la cadena con `kipus-verify` (debe quedar `RESULT V-13 GREEN`, `RESULT V-20 GREEN` y `RESULT SUITE GREEN`).

## Contrato (no negociable)

- Append-only: jamás reescribir 0143–0176 (históricas; conservan "Atlas" como término histórico, declarado en 0177).
- Dinero en `_cents`; sin `REAL/float` (invariante 1).
- Cada regla referenciada debe existir en el Registry §0.4 (nunca IDs huérfanos).
- **CAL-07 / V-20 (Proceso §7.2.1, `tdd_evidence.py`):** toda entrada de código exige `ticket_or_adr`, `test_ids` que resuelven en un test del monorepo, `red_commit_sha`/`red_run_id`/`green_commit_sha`/`green_run_id` reales, `expected_failure` y `ancestry_verified:true` con reachability verificada. `N/A` solo para milestones pre-código.
- Si el cambio movió capabilities, DDL, reglas, puertos o packages: regenerar `INDEX.md` con `scripts/index.sh` antes de commitear (V-15).
