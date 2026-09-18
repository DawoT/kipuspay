#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/apps/worker-api"
PORT="${PIN_CRYPTO_TEST_PORT:-8791}"
LOG_DIR="$(mktemp -d /tmp/kipuspay-pin-crypto.XXXXXX)"
RESPONSE="$LOG_DIR/response.json"

cd "$APP"
./node_modules/.bin/wrangler dev --local --ip 127.0.0.1 --port "$PORT" \
  --config wrangler.pin-crypto-test.jsonc >"$LOG_DIR/wrangler.log" 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

for attempt in {1..30}; do
  if grep -Fq "Ready on http://127.0.0.1:$PORT" "$LOG_DIR/wrangler.log"; then
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    cat "$LOG_DIR/wrangler.log" >&2
    echo "Wrangler exited before the local Worker became ready." >&2
    exit 1
  fi
  sleep 0.5
done

if ! grep -Fq "Ready on http://127.0.0.1:$PORT" "$LOG_DIR/wrangler.log"; then
  cat "$LOG_DIR/wrangler.log" >&2
  echo "Wrangler did not become ready on the isolated test port." >&2
  exit 1
fi

curl --fail --silent "http://127.0.0.1:$PORT/" --output "$RESPONSE"

if [[ ! -s "$RESPONSE" ]]; then
  cat "$LOG_DIR/wrangler.log" >&2
  echo "Workerd did not return the Argon2id verification result." >&2
  exit 1
fi

node -e "const assert=require('node:assert/strict');const fs=require('node:fs');const result=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));assert.equal(result.phcFormat,true);assert.equal(result.parameters,true);assert.deepEqual(result.validPin,{ok:true,needsRehash:false});assert.deepEqual(result.wrongPin,{ok:false,needsRehash:false});" "$RESPONSE"
cat "$RESPONSE"
