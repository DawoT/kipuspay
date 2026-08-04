---
name: atlas-verify
description: Verificaciones documentales de KipusPay (fences pares, 0 UPSERT INTO, 0 literales http/ws, db.transaction prohibido, FKs tenant, cadena del ledger). Ejecuta la batería antes de commitear cualquier doc o código.
allowed-tools: Bash(*)
---

# atlas-verify — Batería de verificación documental

Ejecuta la batería completa antes de dar por cerrado cualquier cambio normativo o de código.
Equivalente a `scripts/verify.sh` (se ejecuta también en el hook `pre-commit` y en CI).

## Ejecución

```bash
opencode/verify   # invoca bash scripts/verify.sh
```

O manualmente:

```bash
scripts/verify.sh
```

## Qué verifica (contrato raíz AGENTS.md)

1. **Fences pares:** recuento de líneas `^``` ` por doc (Ledger, AGENTS, Agents, GTM, Arquitectura) — deben ser pares.
2. **Zero `UPSERT INTO`** en todo el repo (prohibido por contrato D1).
3. **Cero literales `http://`/`ws://`** en `*.md` y código (todas las URLs deben ser https/wss, salvo hostnames canónicos permitidos).
4. **Prohibido `db.transaction(callback)`** en código: la API D1 no lo expone; solo `db.batch([...])`.
5. **FKs tenant**: toda tabla multitenant referencia `tenants` con `tenant_id`.
6. **Cadena del ledger** (`Ledger.md`): schema v2 — cada `entry_hash` = SHA-256 del bloque `id:`→`estado:` **sin** la línea `entry_hash` y sin fences; `prev_hash` debe igualar el `entry_hash` previo (a partir de 0177); entradas 0143–0176 se conservan como históricas.

## Criterios de salida

- `GREEN`: 0 errores → el gate documental pasa.
- `RED`: cualquier fallo → corregir antes de commit. Para el ledger, **nunca** editar una entrada commiteada: agregar entrada `CORRIGE`.

## Estado de gobernanza

Un gate documental `GREEN` es condición **necesaria pero no suficiente** para el cierre de sprint: los Quality Gates de implementación (Agents §8.1) exigen además evidencia runtime (RED→GREEN, migración D1, benchmarks) y firma RACI de `A` + `V` independiente.