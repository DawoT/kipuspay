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

## Flags de features en dev (fail-closed por diseño)

Los `vars` de `wrangler.jsonc` declaran cada `FEATURE_*` con default `"0"`:
sin activación explícita, las rutas responden `404 FEATURE_OFF` (p. ej.
`POST /api/v1/sync/sales` → `FEATURE_OFFLINE_SYNC off`) y el POS cae a la cola
offline local sin sincronizar. **Las `vars` del config ganan sobre el env del
proceso**: para activar un flag en dev usar `--var` (override real):

```bash
# Todos los flags FEATURE_* = 1 (entorno dev completo; 64 vars)
cd apps/worker-api
VARS=$(grep -oP '"FEATURE_[A-Z_]+": "0"' wrangler.jsonc \
  | sed -E 's/"([A-Z_]+)": "0"/--var \1:1/' | tr '\n' ' ')
npx wrangler dev --port 8787 --local $VARS
```

Flags clave para el flujo de la guía comercial: `FEATURE_OFFLINE_SYNC`
(sincronización de ventas), `FEATURE_CASH_BLIND_Z` (cierre Z),
`FEATURE_LEDGER_STORE_CREDIT` (vales), `FEATURE_PURCHASING_*` (3-way),
`FEATURE_BILLING_*` (banner anti-apagado). El POS gana los suyos con
`PUBLIC_FEATURE_*` (mismos nombres) en el env del preview; el set completo del
e2e vive en `apps/pos-web/playwright.config.ts`.

> Al matar `wrangler dev`, su `workerd` hijo puede quedar huérfano escuchando
> en el puerto y aceptando conexiones sin responder: el proxy del preview
> cuelga en vez de fallar (Sello QA s58). Verificar `ss -tlnp | grep 8787` y
> matar el pid del listener antes de relanzar.

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