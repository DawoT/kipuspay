#!/usr/bin/env bash
# KipusPay — Quality Gate de implementación (CAL-05 / Proceso §8.1).
# Orquesta lint + typecheck + tests unitarios + tests de integración + seguridad + build + bundle.
# Cada fase corta el pipeline si falla; el veredicto final lo firma CI, no este script.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

step() {
  echo
  printf '==> %s\n' "$1"
}

step "1/8 Lint (ESLint + Prettier)"
pnpm lint
pnpm format:check

step "2/8 Typecheck (tsc estricto por paquete)"
pnpm typecheck

step "3/8 Tests unitarios (Vitest, umbrales de cobertura)"
pnpm test:unit

step "4/8 Tests de integración (Vitest + pool de Workers)"
pnpm test:integration

step "4b/8 Chaos Sprint 4 (§13.5 concurrent-writers + duplicate-retry)"
node scripts/chaos/run.mjs --scenario all --sprint 4

step "4c/8 Chaos plazos fiscales (§13.5 deadline fail-closed)"
node scripts/chaos/run.mjs --scenario deadline --sprint 5

step "4d/8 Chaos offline sync (§13.5 network-adversarial + quota-exceeded)"
node scripts/chaos/run.mjs --scenario network-adversarial --sprint 6
node scripts/chaos/run.mjs --scenario quota-exceeded --sprint 6

step "4e/8 Chaos low-end device (§13.5 low-end-device fail-closed)"
node scripts/chaos/run.mjs --scenario low-end-device --sprint 7

step "4f/8 Chaos AR compensate (§13.5 ar-compensate 500 ciclos fail-closed)"
node scripts/chaos/run.mjs --scenario ar-compensate --sprint 8

step "5/8 Secretos (Gitleaks)"
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks git --no-banner --redact -v
else
  echo "gitleaks no instalado; lo corre CI (CAL-04)."
fi

step "6/8 Semgrep (invariantes de dominio)"
if command -v semgrep >/dev/null 2>&1; then
  semgrep --config semgrep/rules/invariants.yml --error apps packages
else
  echo "semgrep no instalado; lo corre CI (CAL-03)."
fi

step "7/8 Build"
pnpm build

step "8/8 Presupuesto de bundle del POS (CAL-06)"
(cd apps/pos-web && pnpm bundle)

echo
echo "Quality Gate OK."
