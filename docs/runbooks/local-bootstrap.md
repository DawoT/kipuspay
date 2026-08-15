---
doc_id: runbook-local-bootstrap
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Runbook — Bootstrap local de migraciones D1 (primer setup)

| Campo | Valor |
|---|---|
| Severidad tipica | SEV-3 (dev/prod local; en prod un fetch 503) |
| Owner on-call | Staff SRE + Staff Backend |
| Ultima ensayada | 2026-08-15 (remediación F-10) |
| Relaciona | Arquitectura §5-5 · ADR-0002 · V-25 · Proceso §9.1 |

## Sintomas

- Rutas nuevas responden `503 DB_UNAVAILABLE` en dev aunque el código del worker
  ya existe (ej. `/reclamaciones` antes de aplicar 0054/0055).
- `/api/...` de un feature recién migrado devuelve `DATABASE_OBJECT_NOT_FOUND`
  en logs del worker.

## Causa

Las tablas nuevas viven en `packages/adapters-d1/migrations/` (espejo
`migrations-down/`, V-25). El esquema local (`wrangler d1` local) no aplica las
migraciones solas: se requiere aplicar explícitamente contra la DB local. Un
clone nuevo o una DB recreada queda desfasado hasta correr el apply.

## Diagnóstico rápido (<5 min)

1. Comparar `packages/adapters-d1/migrations/` vs la DB local:
   `npx wrangler d1 execute DB --local --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"` (en `apps/worker-api`).
2. Si faltan tablas del snapshot (`platform_reclamaciones`, etc.), aplicar:

   ```bash
   cd apps/worker-api
   npx wrangler d1 migrations apply DB --local
   ```

3. Verificar paridad de las migraciones-down (V-25) y volver a correr
   `scripts/verify.sh` (debe quedar `RESULT SUITE GREEN`).

## Migraciones

| Worker | DB | migrations_dir |
|---|---|---|
| `worker-api` | `DB` | `../../packages/adapters-d1/migrations` |
| `worker-fiscal` | `DB` | `../../packages/adapters-d1/migrations` |

## Mitigación

1. Aplicar siempre tras un clone (`scripts/bootstrap.sh` no aplica D1; el apply
   es manual por diseño).
2. En staging/preview: `npx wrangler d1 migrations apply DB --remote` con el
   mismo `migrations_dir`.
3. No editar migraciones aplicadas: crear la siguiente (append-only); toda
   corrección = migración nueva con su par down.

## Rollback

`npx wrangler d1 migrations list DB --local` y aplicar el par down solo con
evidencia de que ninguna escritura depende de la tabla revertida.

## Escalamiento

| Condición | Escalar a |
|---|---|
| 503 `DB_UNAVAILABLE` en prod | Staff Principal + Staff SRE |
| Migración sin par down | Staff Principal (viola V-25) |

## Postmortem

- Entrada de ledger: `id: 0409` (hallazgo F-10 documentado).
- Acción preventiva: este runbook; el agente corrector verifica el apply en el
  entorno antes de firmar el gate de un feature que usa tablas nuevas.