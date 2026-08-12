#!/usr/bin/env python3
"""KipusPay — V-21: dinero en código (CAL-01, Arquitectura §13.3, refuerza DAT-09).

Escanea `packages/**` y `apps/**` (`.ts`, `.js`, `.svelte`) buscando operaciones que
degradan dinero entero a coma flotante o redondeo no server-side:
- `toFixed(` (prohibido: redondeo de caja se hace server-side con `Math.round`)
- `parseFloat(` / `Number(` / `+` unario aplicados a identificadores `*_cents`
- declaraciones de dinero sin sufijo `_cents` tipadas `number` a secas (heuristic:
  variables llamadas total/price/amount/igv que no terminan en `_cents`)

Si no hay código todavía, es un GREEN "sin código" (no un falso positivo).
"""
from __future__ import annotations

import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

GLOBS = ("packages/**/*.ts", "packages/**/*.js", "apps/**/*.ts", "apps/**/*.svelte")
TO_FIXED = re.compile(r"\.toFixed\s*\(")
FLOAT_ON_MONEY = re.compile(
    r"\b(?:parseFloat|Number)\s*\(\s*([a-zA-Z_][\w.]*_(?:cents|amount|total|price|paid|balance))"
)
SUSPECT_TYPED = re.compile(r"\b(?:const|let|var)\s+(\w*(?:total|price|amount|igv|balance|paid)\w*)\s*:\s*number\b")
CENTS_OK = re.compile(r"(?:amount|total|price|paid|balance|igv|change|subtotal|debt|fee|cost|revenue|margin)\w*_cents\b")


def scan_files() -> list[str]:
    files: list[str] = []
    excluded = ("/node_modules/", "/.svelte-kit/", "/dist/", "/coverage/", "/build/")
    for pattern in GLOBS:
        for p in glob.glob(os.path.join(ROOT, pattern), recursive=True):
            if not any(seg in p for seg in excluded):
                files.append(p)
    return sorted(files)


def main() -> int:
    files = [f for f in scan_files() if "__pycache__" not in f]
    if not files:
        print("RESULT V-21 GREEN")
        print("     sin código en packages/ o apps/ (nada que medir)")
        return 0
    problems: list[str] = []
    for path in files:
        rel = os.path.relpath(path, ROOT)
        try:
            text = open(path, encoding="utf-8").read()
        except OSError:
            continue
        for lineno, line in enumerate(text.splitlines(), 1):
            code = line.split("//")[0]
            if TO_FIXED.search(code):
                problems.append(f"{rel}:{lineno} toFixed (usar Math.round server-side)")
            for m in FLOAT_ON_MONEY.finditer(code):
                problems.append(f"{rel}:{lineno} {m.group(1)} pasa por parseFloat/Number")
            for m in SUSPECT_TYPED.finditer(code):
                if not CENTS_OK.search(m.group(1)):
                    problems.append(f"{rel}:{lineno} '{m.group(1)}' tipado number sin sufijo _cents")
    if problems:
        print(f"RESULT V-21 RED  {len(problems)} violación(es) de dinero en código")
        for p in problems[:6]:
            print(f"     {p}")
        return 1
    print(f"RESULT V-21 GREEN")
    print(f"     {len(files)} archivo(s) escaneado(s) sin violaciones de dinero")
    return 0


if __name__ == "__main__":
    sys.exit(main())
