---
name: kipus-verify
description: Gate documental de KipusPay (scripts/verify.sh). Corre los checks V-01..V-16 (fences, UPSERT, http/ws, db.transaction, forks por vertical, tenant_id NOT NULL, dinero en cents, registry, placeholders, escapes, DDL fenceado, refs §, ratchet de FKs, cadena del ledger, INDEX sincronizado) y devuelve GREEN/RED por check. Úsalo antes de cerrar cualquier cambio normativo o de código.
allowed-tools: Bash(*)
---

# kipus-verify — Gate documental

```bash
scripts/verify.sh
```

Cada check emite una línea parseable y la última es el veredicto:

```text
RESULT V-06 GREEN
RESULT V-10 RED  escapes de exportación en 1 doc(s)
RESULT SUITE RED
```

Para un bucle de agente, filtra solo lo que falla:

```bash
scripts/verify.sh | awk '$1=="RESULT" && $3=="RED"'
```

## Checks

| ID | Verifica | Invariante / fuente |
|---|---|---|
| V-00 | Autotest: los detectores del gate detectan casos sucios y no marcan casos limpios | Ledger 0179 |
| V-01 | Fences pares en todo el corpus descubierto (`AGENTS.md` + `docs/**`) | — |
| V-02 | Cero `UPSERT INTO` (sintaxis inexistente en SQLite/D1) | AGENTS §2.2 |
| V-03 | Cero literales `http://` / `ws://` (salvo namespaces XML canónicos) | seguridad de transporte |
| V-04 | Cero `db.transaction(` en código | AGENTS §2.2 |
| V-05 | `tenant_id` declarado `NOT NULL` en toda tabla multitenant | DAT-12 / spec §5.0.1 |
| V-06 | Columnas monetarias en `INTEGER` cents; `*_cents` nunca `REAL` | AGENTS §2.1 / spec §5.0 |
| V-07 | Cero `switch(vertical)` / `vertical ===` en código | ADR-ARCH-002 |
| V-08 | Registry §0.4: sin IDs huérfanos, duplicados ni prefijos no autorizados | AGENTS §2.9 |
| V-09 | Sin placeholders `![][imageN]`: los números deben ser texto | legibilidad por máquina |
| V-10 | Sin escapes de exportación (backslash antes de `_`, `=`, `-`) que corrompen SQL/TS | legibilidad por máquina |
| V-11 | Todo `CREATE TABLE` dentro de un fence etiquetado | extracción de DDL |
| V-12 | Toda referencia `§` resuelve a una sección existente | punteros DRY |
| V-13 | Cadena `prev_hash`/`entry_hash` del ledger | AGENTS §2.4 |
| V-14 | Ratchet DAT-12: la deuda de FKs simples no crece | spec §5.0.1 |
| V-15 | `INDEX.md` regenerable sin diff (`scripts/index.sh`) | anti-drift |
| V-16 | Entradas del ledger append-only en el commit (hook `pre-commit` y CI, misma implementación; la cabecera sí se corrige) | AGENTS §2.4 |
| V-17 | Higiene de rutas versionadas: sin espacios, sin no-ASCII, sin colisiones case-insensitive | AGENTS §1 |
| V-18 | Front-matter válido; `Alias §N` resuelve dentro de los archivos de ese alias; todo `*.md` citado existe | AGENTS §3 |
| V-19 | Presupuesto de tamaño: ningún archivo de doctrina pasa de 1000 líneas (exentos `inmutable` y `generada`) | ruta de lectura |
| V-20 | Contrato TDD del ledger: `test_ids` que resuelven en un test del monorepo, run IDs RED/GREEN y SHAs reales para entradas de código | CAL-07 / §13.9 |
| V-21 | Dinero en código: cero `toFixed`/`parseFloat`/`Number` sobre montos; dinero tipado `number` exige sufijo `_cents` | CAL-01 / §13.3 |
| V-22 | Cero `UPSERT INTO` / `db.transaction(` en `*.sql`/`*.ts`/`*.svelte` del monorepo | AGENTS §2.2 |
| V-23 | Cero fork por vertical en componentes Svelte | ADR-ARCH-002 |
| V-24 | Presupuesto de bundle del POS + zero-dependencia runtime vs `bundle_deps_baseline.json` | CAL-06 / §13.8 |

## Notas de alcance

- `docs/LEDGER.md` es inmutable: queda fuera de V-11 (sus entradas usan fence desnudo por schema), de V-12 y de V-18 (sus punteros son históricos: citan los paths previos a la reorganización, equivalencia declarada en la entrada 0182).
- V-18 es más estricto que V-12 a propósito: V-12 resuelve `§N` contra los headings de todo el corpus, así que un puntero que existe en **otro** documento pasa. V-18 exige que resuelva dentro de los archivos del alias citado.
- V-20..V-24 escanean el **monorepo** (`packages/` y `apps/`, excluyendo `node_modules`/`dist`/`.svelte-kit`). El `test_ids` de una entrada de código debe resolverse en un archivo de test del monorepo; los milestones pre-código (`red_commit_sha: N/A`) quedan exentos.
- V-14 no exige arreglar el legado: congela el inventario en `scripts/checks/fk_composite_baseline.txt` y bloquea que aparezcan FKs simples nuevas. El burn-down se hace por sprint, quitando líneas del baseline junto con el fix del DDL.
- V-05 existe porque en SQLite una columna `TEXT PRIMARY KEY` **admite `NULL`** si no se declara.

## Criterios de salida

- `RESULT SUITE GREEN` → el gate documental pasa (exit 0).
- Cualquier RED → corregir antes del commit. Para el ledger, jamás editar una entrada commiteada: agregar entrada `CORRIGE`.

Un gate `GREEN` es condición **necesaria pero no suficiente** para cerrar un sprint: los Quality Gates de implementación (`docs/PROCESS.md` §8.1) exigen además evidencia runtime (RED→GREEN, migración D1, benchmarks) y firma RACI de `A` + `V` independiente.
