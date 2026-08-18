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

MARKERS = {
    "workflow_dispatch": r"workflow_dispatch\s*:",
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


def violations(root: str) -> list[str]:
    body = read_workflow(root)
    out: list[str] = []
    for key in MARKERS:
        miss = marker_missing(body, key)
        if miss:
            out.append(miss)
    out.extend(order_violations(body))
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