---
name: kipus-rules-registry
description: Trabaja el Registry de reglas de KipusPay (§0.4 de la Arquitectura): crear, mover o retirar una regla sin dejar IDs huérfanos ni punteros duplicados. La validación mecánica es el check V-08 de scripts/verify.sh.
allowed-tools: Bash(grep:*) Bash(sed:*) Bash(python3:*)
---

# kipus-rules-registry — Registry de reglas

Garantiza el DRY de dominio (invariante 9): cada regla vive **una** vez en la especificación y cualquier otro doc la referencia por `§`.

## Validación mecánica

El cruce completo (huérfanos, duplicados, prefijos) lo hace el gate, no la vista humana:

```bash
scripts/verify.sh | grep V-08
```

`V-08` recorre los 5 docs normativos, extrae todo ID `SEC-`, `FIS-`, `COM-`, `DAT-`, `PERF-`, `SYN-`, `LPDP-` y `ADR-<AREA>-<NNN>`, y falla si:

1. **Huérfano:** el ID se usa en algún doc pero no tiene fila en el Registry §0.4.
2. **Duplicado:** el Registry tiene dos filas para el mismo ID.
3. **Prefijo no autorizado:** una fila del Registry usa un prefijo fuera de la lista.

Inventario manual, cuando necesites explorar:

```bash
grep -rhoE '\b(SEC|FIS|COM|DAT|PERF|SYN|LPDP)-[0-9]{2,}\b' --include='*.md' . | sort -u
```

## Crear o mover una regla

1. Define la regla **una sola vez** en la sección canónica de la especificación.
2. Agrega o corrige su fila en §0.4 (`| ID | §sección | tema |`). El puntero debe apuntar a una sección que exista: V-12 falla si no.
3. Los demás docs (`docs/PROCESS.md`, `docs/GTM.md`) la citan por `§`; **no** la re-escriben.
4. Regenera `INDEX.md` (`scripts/index.sh`) — la tabla de reglas del índice se deriva de §0.4 (V-15).
5. Registra el cambio en el Ledger (`kipus-changelog`).

## Reglas especiales

- `FIS-01`, `DAT-03`, `DAT-09`, `DAT-10`: definidas por corrección de ledger (0164/0165). Su puntero canónico ya está en el Registry; no volver a definirlas en prosa.
- Filas marcadas "compartida" (p. ej. SEC-05/SYN-02, SEC-06/SYN-04, PERF-08/PERF-10, FIS-02/DAT-02): comparten sección canónica por diseño; el Registry es el único puntero.
- `LPDP-*` es un prefijo reservado: aún no hay IDs emitidos, así que usar `LPDP-01` en un doc dispara V-08 hasta que exista su fila.
- Un puntero puede citar un principio numerado (p. ej. `§1 (Principio 10)`), pero nunca inventar una subsección inexistente.
