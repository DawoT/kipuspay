#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STATE_DIR=""
while (($#)); do
  case "$1" in
    --state-dir)
      if (($# < 2)) || [[ -z "$2" ]]; then
        echo "--state-dir requires a path" >&2
        exit 2
      fi
      STATE_DIR="$2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 --state-dir <ruta>"
      echo "Applies synthetic operational data to isolated local Wrangler D1 and KV state only."
      exit 0
      ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
if [[ -z "$STATE_DIR" ]]; then
  echo "--state-dir is required; refusing to use Wrangler's shared default local state" >&2
  exit 2
fi
mkdir -p "$STATE_DIR"
STATE_DIR="$(cd "$STATE_DIR" && pwd)"
if [[ "$STATE_DIR" == / || "$STATE_DIR" == "$ROOT" ]]; then
  echo "--state-dir must be an isolated subdirectory, not / or the repository root" >&2
  exit 2
fi
cd "$ROOT"
SQL_FILE="$STATE_DIR/operational-seed.sql"
SNAPSHOT_DIR="$STATE_DIR/kv-snapshots"
node scripts/staff/operational-seed.mjs "$SQL_FILE"
node scripts/staff/validate-operational-seed.mjs "$SQL_FILE"
node scripts/staff/operational-seed-artifacts.mjs "$STATE_DIR"

WRANGLER_BIN="$ROOT/apps/worker-api/node_modules/.bin/wrangler"
if [[ ! -x "$WRANGLER_BIN" ]]; then
  WRANGLER_BIN="$ROOT/node_modules/.bin/wrangler"
fi
if [[ ! -x "$WRANGLER_BIN" ]]; then
  echo "Wrangler CLI not found in the workspace" >&2
  exit 127
fi
WRANGLER=("$WRANGLER_BIN" --cwd "$ROOT/apps/worker-api")
"${WRANGLER[@]}" d1 migrations apply DB --local --persist-to "$STATE_DIR" >/dev/null
"${WRANGLER[@]}" d1 execute DB --local --yes --persist-to "$STATE_DIR" --file "$SQL_FILE" --json >/dev/null
for snapshot in "$SNAPSHOT_DIR"/*.json; do
  tenant_key="$(basename "$snapshot" .json)"
  "${WRANGLER[@]}" kv key put "tenant:$tenant_key" --path "$snapshot" --binding TENANT_KV --local --preview false --persist-to "$STATE_DIR"
done
node scripts/staff/operational-seed-artifacts.mjs "$STATE_DIR" --mark-applied
echo "operational seed applied to isolated local D1 + KV: $STATE_DIR"
