---
name: kipus-task
description: Ciclo canónico de una tarea de sprint en KipusPay, de la lectura del contrato al cierre del gate. Úsalo al empezar cualquier sprint o entregable (spec o código) para no improvisar el orden ni saltarte el Ledger y el RACI.
allowed-tools: Bash(*)
---

# kipus-task — Ciclo de una tarea

El repo ya tiene doctrina (`AGENTS.md`), especificación, roadmap y gate ejecutable. Lo que este skill fija es el **orden**: qué se lee, qué se decide y en qué momento se registra. Toda tarea recorre las 8 fases; ninguna se salta "porque el cambio es chico".

## 0. Preparar entorno (una vez por clone)

```bash
scripts/bootstrap.sh   # instala el hook pre-commit y corre el gate
```

Los hooks no viajan en un `git clone`: sin esto, los commits no pasan por la batería.

## 1. Leer el contrato

`AGENTS.md` completo. Las 10 invariantes son NO-GO: violar una invalida el entregable, sin importar la calidad del resto.

## 2. Localizar el trabajo

`INDEX.md` es el mapa de punteros (generado, no normativo):

- capability → sprint → empaquetado GTM
- tabla DDL → sección canónica de la especificación
- regla (`SEC-`, `FIS-`, `DAT-`, …) → sección donde está definida
- puerto → adapters previstos
- package destino del monorepo

Con el sprint identificado, la fuente de verdad es su archivo de fase (`INDEX.md` → `docs/roadmap/fase-X.md`) (alcance y criterios) y la especificación para las reglas y el DDL. `INDEX.md` nunca sustituye a ninguno de los dos.

## 3. Resolver reglas antes de escribir

Cada regla que toques debe tener fila en el Registry §0.4. Si la necesitas y no existe: primero la defines **una vez** en la especificación y la registras (skill `kipus-rules-registry`). Nunca dos definiciones, nunca un ID huérfano.

Decisiones que no se improvisan en el PR: si el cambio implica una elección arquitectónica (canal fiscal, política de stock, modelo de cobro, auth/revocación), va como ADR con su fila en el Registry. Plantilla: `docs/adr/TEMPLATE.md` → archivo `docs/adr/ADR-NNNN-….md`. Procedimientos operativos: `docs/runbooks/TEMPLATE.md`.

## 4. Diseñar contra las invariantes

Antes de escribir la primera línea, resuelve en voz alta:

- **Dinero:** ¿todo en `INTEGER cents`? ¿el redondeo ocurre server-side?
- **Atomicidad:** ¿la escritura multi-tabla cabe en un solo `db.batch([...])` con guards SQL?
- **Capability:** ¿se habilita por flag, sin ramificar por vertical?
- **Offline:** ¿la venta sigue cerrando si se corta la red? ¿el servidor sigue siendo la autoridad del monto?
- **Fiscal:** ¿se respeta el CDR como única confirmación y el `must_submit_by`?
- **Aislamiento:** ¿`tenant_id NOT NULL` y FK compuesta `(tenant_id, parent_id)` en toda tabla nueva (DAT-12)?

## 5. RED antes de GREEN

Para cambios de código: test que falle primero, con el ID del test anotado (va al `test_ids` del Ledger). Para cambios de especificación: el check del gate que detecta el problema **antes** de arreglarlo — si ningún check lo detecta, el gate está incompleto y toca extenderlo (`scripts/checks/`).

## 6. Implementar donde corresponde

- Reglas de dominio en `packages/domain-*`: sin imports de Hono, D1, Svelte ni SDK SUNAT.
- Workers y apps son composition root + adapters; los puertos se implementan como adapters, no como `if` en el orquestador.
- Documentación: la regla en la especificación; `docs/PROCESS.md` y `docs/GTM.md` la **citan** con `§`.

## 7. Cerrar el gate y registrar

```bash
scripts/index.sh          # si cambiaron capabilities, DDL, reglas, puertos o packages
scripts/verify.sh         # debe terminar en RESULT SUITE GREEN
```

Luego, en este orden:

1. Entrada nueva en `docs/LEDGER.md` con `prev_hash`/`entry_hash` reales y evidencia RED→GREEN (skill `kipus-changelog`).
2. PR con la plantilla (`.github/pull_request_template.md`) completa.
3. Quality Gate de `docs/PROCESS.md` §8.1: `R` ejecuta, `A` aprueba, `V` verifica de forma independiente. Sin `A` + `V` distinto de `R`, el resultado es `NO-GO`.

## Señales de que vas mal

- Estás copiando una regla que ya existe en otro doc → viola la invariante 9; cita `§`.
- Estás por escribir `if (vertical === …)` → falta una capability.
- El gate está GREEN pero no escribiste ningún check nuevo para un problema que sí existía → el gate no cubre tu cambio.
- Quieres editar una entrada del Ledger → nunca; entrada nueva con `relacion: CORRIGE`.
