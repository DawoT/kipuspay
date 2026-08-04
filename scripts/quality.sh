#!/usr/bin/env bash
# KipusPay — Quality Gate de implementación (CAL-05 / Proceso §8.1).
# Orquesta lint + typecheck + tests unitarios + tests de integración + seguridad + build.
# Cada fase corta el pipeline si falla; el veredicto final lo firma CI, no este script.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

step() {
  echo
  printf '==> %s\n' "$1"
}

step "1/7 Lint (ESLint + Prettier)"
pnpm lint
pnpm format:check

step "2/7 Typecheck (tsc estricto por paquete)"
pnpm typecheck

step "3/7 Tests unitarios (Vitest, umbrales de cobertura)"
pnpm test:unit

step "4/7 Tests de integración (Vitest + pool de Workers)"
pnpm test:integration

step "5/7 Secretos (Gitleaks)"
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks git --no-banner --redact -v
else
  echo "gitleaks no instalado; lo corre CI (CAL-04)."
fi

step "6/7 Semgrep (invariantes de dominio)"
if command -v semgrep >/dev/null 2>&1; then
  semgrep --config semgrep/rules/invariants.yml --error apps packages
else
  echo "semgrep no instalado; lo corre CI (CAL-04)."
fi

step "7/7 Build"
pnpm build

echo
echo "Quality Gate OK."
