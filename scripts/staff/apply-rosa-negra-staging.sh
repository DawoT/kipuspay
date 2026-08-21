#!/usr/bin/env bash
# FIS-T0/T1 staging: migracion 0056 + seed D1 + TENANT_KV. No toca FEATURE_*=1.
# No imprime secretos. Requiere wrangler autenticado.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
API_DIR="$ROOT/apps/worker-api"
FISCAL_DIR="$ROOT/apps/worker-fiscal"
SEED="$ROOT/scripts/staff/seed-rosa-negra-staging.sql"
KV_JSON="$ROOT/scripts/staff/rosa-negra-tenant-kv.json"

echo "d1 migrations apply (staging DB + DR_DB)" >&2
pnpm --filter @kipuspay/worker-api run d1:migrate:staging
pnpm --filter @kipuspay/worker-api run d1:migrate:staging:dr

echo "d1 seed Rosa Negra" >&2
pnpm --filter @kipuspay/worker-api exec wrangler d1 execute DB --env staging --remote --file "$SEED"

echo "TENANT_KV snapshot" >&2
pnpm --filter @kipuspay/worker-api exec wrangler kv key put tenant:tenant_stg_rosa_negra_001 \
  --namespace-id=2810a54505764909900a242755d8c660 \
  --path "$KV_JSON" --remote

echo "done T0 apply (JWT mint: AUTH_JWT_HS_SECRET node scripts/staff/mint-owner-jwt.mjs)" >&2
echo "fiscal dir $FISCAL_DIR" >&2
