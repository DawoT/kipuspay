#!/usr/bin/env python3
"""KipusPay — V-24: presupuesto de bundle y cero-dependencia runtime del POS
(CAL-06, Arquitectura §13.8; invariante 10 AGENTS §2).

Dos frentes:
1. **Dependencias runtime:** `apps/pos-web/package.json` solo puede declarar como
   `dependencies` lo que autoriza el baseline `bundle_deps_baseline.json`. El POS es
   zero-dependency para render visual (QR/ticket/PDF/ESC/POS con Web Platform APIs o
   código vendorizado): cualquier dependencia runtime nueva rompe CI salvo ADR.
2. **Tamaño del bundle:** si existe artefacto de build del POS, la suma gz de su JS
   no puede superar el presupuesto de `size-limit.config.js`. Si hay artefacto pero
   no hay config, el check es RED (config obligatoria antes de medir).

Sin código todavía: GREEN "sin artefactos".
"""
from __future__ import annotations

import gzip
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
POS = os.path.join(ROOT, "apps", "pos-web")
BASELINE = os.path.join(ROOT, "scripts", "checks", "bundle_deps_baseline.json")
CONFIG = os.path.join(POS, "size-limit.config.js")
PKG = os.path.join(POS, "package.json")


def gz_size(path: str) -> int:
    with open(path, "rb") as fh:
        return len(gzip.compress(fh.read()))


def main() -> int:
    if not os.path.exists(PKG):
        print("RESULT V-24 GREEN")
        print("     apps/pos-web aún no existe (nada que medir)")
        return 0

    problems: list[str] = []

    # 1) Dependencias runtime contra baseline
    baseline_deps = []
    if os.path.exists(BASELINE):
        with open(BASELINE, encoding="utf-8") as fh:
            baseline_deps = json.load(fh).get("apps/pos-web", [])
    with open(PKG, encoding="utf-8") as fh:
        pkg = json.load(fh)
    declared = set(pkg.get("dependencies", {}))
    extra = sorted(declared - set(baseline_deps))
    if extra:
        problems.append(f"dependencias runtime no autorizadas: {', '.join(extra)} (cal-06, ADR obligatorio)")

    # 2) Tamaño de bundle si hay artefacto
    artifacts: list[str] = []
    for root_dir in (os.path.join(POS, "build"), os.path.join(POS, ".svelte-kit", "output", "client")):
        if os.path.isdir(root_dir):
            for dirpath, _dirnames, filenames in os.walk(root_dir):
                for name in filenames:
                    if name.endswith(".js") or name.endswith(".mjs"):
                        artifacts.append(os.path.join(dirpath, name))
    if artifacts:
        if not os.path.exists(CONFIG):
            problems.append("hay artefacto de build pero falta apps/pos-web/size-limit.config.js")
        else:
            budget_match = re.search(r"100\s*%\)?\s*[:=]\s*['\"]?([\d.]+)\s*kB", open(CONFIG, encoding="utf-8").read())
            budget_kb = float(budget_match.group(1)) if budget_match else None
            total = sum(gz_size(a) for a in artifacts)
            if budget_kb is None:
                problems.append("size-limit.config.js sin presupuesto kB legible")
            elif total > budget_kb * 1024:
                problems.append(f"bundle {total / 1024:.1f} kB gz > presupuesto {budget_kb} kB gz")

    if problems:
        print(f"RESULT V-24 RED  {len(problems)} problema(s) de presupuesto de bundle")
        for p in problems[:6]:
            print(f"     {p}")
        return 1
    if artifacts:
        print("RESULT V-24 GREEN")
        print(f"     {len(artifacts)} artefacto(s) bajo presupuesto")
    else:
        print("RESULT V-24 GREEN")
        print("     sin artefactos de build todavía")
    return 0


if __name__ == "__main__":
    sys.exit(main())
