#!/usr/bin/env bash
# KipusPay — regenera INDEX.md (índice de implementación para agentes).
#   scripts/index.sh            regenera
#   scripts/index.sh --check    falla si está desincronizado (gate V-15)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
exec python3 scripts/checks/gen_index.py "$@"
