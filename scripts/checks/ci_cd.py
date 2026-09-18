#!/usr/bin/env python3
"""KipusPay — V-31: contrato CI/CD del deploy a staging (Proceso §5.2 Etapa 6, §13.7).

Etapa 6 (post-staging) exige un workflow de deploy a staging disparado por
`workflow_dispatch` **manual** que:
- corre las Etapas 0–5 (gate documental + quality) como precondición del deploy,
  sin saltos (Proceso §5.3: ningún entregable salta una etapa);
- despliega en el orden §13.7: workers (kms -> api -> fiscal) y luego Pages
  (pos-web -> marketing-web), usando los scripts `deploy:staging` del monorepo;
- sube evidencia (logs/versiones del deploy) como artifact.

Emite `RESULT V-31 GREEN|RED`.
"""
from __future__ import annotations

import os
import re
import sys

DEPLOY_WORKFLOW = ".github/workflows/deploy-staging.yml"

# Orden normativo §13.7 para staging: workers primero, Pages después.
DEPLOY_TARGETS = [
    "@kipuspay/worker-kms",
    "@kipuspay/worker-api",
    "@kipuspay/worker-fiscal",
    "@kipuspay/pos-web",
    "@kipuspay/marketing-web",
]

# Flags de capabilities que staging debe conservar explícitamente. `--keep-vars`
# por sí solo no basta: las vars definidas en wrangler.jsonc pueden sobrescribir
# el estado del dashboard durante un redeploy.
STAGING_API_FLAGS = [
    "FEATURE_CATALOG_QUICK_ADD",
    "FEATURE_SHIFT_HANDOFF",
    "FEATURE_TEAM_INVITE",
    "FEATURE_ONBOARDING_TOUR",
    "FEATURE_HARDWARE_DIAGNOSTICS",
    "FEATURE_ORDERS_CUSTOMER_ORDERS",
    "FEATURE_ANALYTICS_FORECASTING",
    "FEATURE_ANALYTICS_AGENTIC_INSIGHTS",
    "FEATURE_LPDP",
    "FEATURE_SALES_RECURRING",
    "RECURRING_MANUAL_RUN_ENABLED",
    "FEATURE_DATA_BACKUP",
    "FEATURE_PLATFORM_DR",
    "FEATURE_MOBILE_PUSH",
    "FEATURE_CLIENT_MOBILE_POS",
]

STAGING_PROFILES = {
    "baseline": [],
    "s43-orders": ["FEATURE_ORDERS_CUSTOMER_ORDERS"],
    "s44-recurring": ["FEATURE_SALES_RECURRING", "RECURRING_MANUAL_RUN_ENABLED"],
    "s45-push": ["FEATURE_MOBILE_PUSH", "FEATURE_CLIENT_MOBILE_POS"],
    "s46-forecast": ["FEATURE_ANALYTICS_FORECASTING"],
    "s48-dr": ["FEATURE_DATA_BACKUP", "FEATURE_PLATFORM_DR"],
    "s49-insights": ["FEATURE_ANALYTICS_AGENTIC_INSIGHTS"],
}

MARKERS = {
    "workflow_dispatch": r"workflow_dispatch\s*:",
    "capability_profile": r"capability_profile\s*:",
    "gate_documental": r"scripts/verify\.sh",
    "deploy_script": r"deploy:staging",
    "artifact_evidence": r"actions/upload-artifact",
}


def read_workflow(root: str) -> str:
    path = os.path.join(root, DEPLOY_WORKFLOW)
    if not os.path.exists(path):
        return ""
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def marker_missing(body: str, key: str) -> str | None:
    if not body:
        return f"falta workflow {DEPLOY_WORKFLOW}"
    if not re.search(MARKERS[key], body, re.M):
        return f"falta {key}"
    return None


def order_violations(body: str) -> list[str]:
    """Posición de cada target en los pasos de deploy: debe seguir §13.7.

    Solo cuentan las líneas que ejecutan `deploy:staging` (los builds de Etapas
    0-5 citan paquetes del monorepo y no definen el orden de despliegue).
    """
    out: list[str] = []
    deploy_lines = [ln for ln in body.splitlines() if "deploy:staging" in ln]
    prev_pos = -1
    for target in DEPLOY_TARGETS:
        pos = next((i for i, ln in enumerate(deploy_lines) if target in ln), -1)
        if pos == -1:
            out.append(f"target {target} ausente del workflow")
            continue
        if pos <= prev_pos:
            out.append(f"orden §13.7 roto: {target} aparece antes/igual que el anterior")
        prev_pos = pos
    return out


def profile_violations(body: str) -> list[str]:
    """El API de staging requiere un perfil explícito; sin él el helper aborta.

    La entrada manual evita que un redeploy vuelva a encender capabilities de otro
    sprint. Se exige además que el valor viaje específicamente al paso del API.
    """
    out: list[str] = []
    profile_match = re.search(r"^(?P<indent>\s*)capability_profile\s*:\s*$", body, re.M)
    if not profile_match:
        out.append("falta capability_profile en workflow_dispatch")
    else:
        indent = len(profile_match.group("indent"))
        lines = body[profile_match.end() :].splitlines()
        block: list[str] = []
        for line in lines:
            if line.strip() and len(line) - len(line.lstrip()) <= indent:
                break
            block.append(line.strip())
        if "type: choice" not in block or "required: true" not in block:
            out.append("capability_profile debe ser choice obligatorio")
        options = [line[2:].strip() for line in block if line.startswith("- ")]
        if set(options) != set(STAGING_PROFILES) or len(options) != len(STAGING_PROFILES):
            out.append("opciones capability_profile no coinciden con perfiles staging autorizados")
    if not re.search(
        r"STAGING_DEPLOY_PROFILE\s*:\s*\$\{\{\s*inputs\.capability_profile\s*\}\}",
        body,
    ):
        out.append("falta capability_profile explícito para deploy worker-api staging")
    return out


def helper_violations(helper_body: str) -> list[str]:
    """Verifica el contrato fail-closed del helper de capabilities staging."""
    out: list[str] = []
    if 'profile="${STAGING_DEPLOY_PROFILE:-}"' not in helper_body:
        out.append("helper staging sin STAGING_DEPLOY_PROFILE obligatorio")
    flags_match = re.search(r"flags=\(\s*(?P<flags>.*?)\s*\)", helper_body, re.S)
    flags = set(re.findall(r"(?:FEATURE_[A-Z_]+|RECURRING_MANUAL_RUN_ENABLED)", flags_match.group("flags") if flags_match else ""))
    if flags != set(STAGING_API_FLAGS):
        out.append("helper staging con inventario de flags distinto al contrato")
    if 'args+=(--var "$flag:0")' not in helper_body:
        out.append("helper staging no aplica default-off a todas las capabilities")
    if 'args+=(--var "$flag:1")' not in helper_body:
        out.append("helper staging no aplica únicamente el allowlist del perfil")
    case_match = re.search(r'case "\$profile" in(?P<cases>.*?)\n\s*esac', helper_body, re.S)
    cases = case_match.group("cases") if case_match else ""
    actual: dict[str, list[str]] = {}
    for match in re.finditer(r"^\s*([\w-]+)\)\s*(?:enabled=\(([^)]*)\)\s*)?;;", cases, re.M):
        actual[match.group(1)] = re.findall(r"(?:FEATURE_[A-Z_]+|RECURRING_MANUAL_RUN_ENABLED)", match.group(2) or "")
    if actual != STAGING_PROFILES:
        out.append("allowlist de perfiles staging no coincide con el contrato")
    if "FEATURE_LPDP" in {flag for enabled in actual.values() for flag in enabled}:
        out.append("LPDP no puede habilitarse desde perfiles staging")
    if not re.search(r"\*\)\s*\n\s*echo .*\n\s*exit 2", cases):
        out.append("helper staging no rechaza perfiles desconocidos")
    return out


def violations(root: str) -> list[str]:
    body = read_workflow(root)
    out: list[str] = []
    for key in MARKERS:
        miss = marker_missing(body, key)
        if miss:
            out.append(miss)
    out.extend(order_violations(body))
    out.extend(profile_violations(body))
    # Anti-deriva: todo deploy Workers debe preservar runtime vars (--keep-vars)
    # Pages usa build-time PUBLIC_* y no aplica keep-vars (ver OLA C4).
    # Solo valida si los package.json existen (selftest usa tmp sin monorepo).
    workers_keep_vars = ["@kipuspay/worker-kms", "@kipuspay/worker-fiscal"]
    import json, pathlib
    for target in workers_keep_vars:
        pkg = pathlib.Path(root) / "apps" / target.split("/")[-1] / "package.json"
        if not pkg.exists():
            pkg = pathlib.Path(root) / "apps" / target.replace("@kipuspay/", "") / "package.json"
        if not pkg.exists():
            continue
        try:
            data = json.loads(pkg.read_text(encoding="utf-8"))
            script = data.get("scripts", {}).get("deploy:staging", "")
            if "--keep-vars" not in script:
                out.append(f"{target} deploy:staging sin --keep-vars (anti-deriva)")
        except Exception as e:
            out.append(f"{target} package.json ilegible: {e}")

    api_pkg = pathlib.Path(root) / "apps" / "worker-api" / "package.json"
    if api_pkg.exists():
        try:
            api_data = json.loads(api_pkg.read_text(encoding="utf-8"))
            api_script = api_data.get("scripts", {}).get("deploy:staging", "")
            helper = pathlib.Path(root) / "scripts" / "deploy-worker-api-staging.sh"
            if "deploy-worker-api-staging.sh" not in api_script:
                out.append("@kipuspay/worker-api deploy:staging sin helper de flags acumuladas")
            elif not helper.exists():
                out.append("falta scripts/deploy-worker-api-staging.sh para el deploy del API")
            else:
                helper_body = helper.read_text(encoding="utf-8")
                if "--keep-vars" not in helper_body:
                    out.append("@kipuspay/worker-api helper staging sin --keep-vars")
                out.extend(helper_violations(helper_body))
        except Exception as e:
            out.append(f"@kipuspay/worker-api package.json ilegible: {e}")
    return out


def main(argv: list[str]) -> int:
    root = argv[1] if len(argv) > 1 else os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    bad = violations(root)
    if bad:
        print("RESULT V-31 RED  " + "; ".join(bad))
        return 1
    print("RESULT V-31 GREEN")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
