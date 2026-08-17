#!/usr/bin/env python3
"""KipusPay — auditoría de copy marketing: 0 jerga técnica (GTM §1 / Sprint 10).

Escanea apps/marketing-web (svelte/ts/md) por términos prohibidos.
Emite RESULT MARKETING_COPY GREEN|RED.
"""
from __future__ import annotations

import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
TARGET = os.path.join(ROOT, "apps", "marketing-web")

# Términos técnicos internos — no van en copy de cara al cliente (GTM §1).
BANNED = re.compile(
    r"\b("
    r"Edge|D1|Workers?|ACID|sharding|Durable\s*Object|DurableObject|"
    r"Analytics\s*Engine|workerd|Cloudflare\s*Workers|cloudflare|"
    r"CDR|UBL|PSE"
    r")\b",
    re.IGNORECASE,
)

# Referencias de CONTROL INTERNO — jamás visibles al visitante (M1).
# "GTM §4.1", "GTM-02", "HTTP 402", "Quality Gate", "Sprint N", "ADR-NNNN".
INTERNAL = re.compile(
    r"\b(GTM-\d+|ADR-\d+)\b|HTTP\s*\d{3}|Quality\s*Gate|Sprint\s+\d+|[§]\s*\d",
    re.IGNORECASE,
)

# Superficies de control interno (registry/claim-gate) y código no renderizado.
SKIP_DIRS = {
    ".svelte-kit",
    "node_modules",
    "coverage",
    "dist",
    "build",
    "static",
    "src/lib/claims",
    "tests",
}


def _is_scanned(name: str) -> bool:
    """Solo superficies que renderizan copy: nada de tests ni configs de tooling.

    Playwright (tests/e2e + playwright.config.ts) llegó a marketing-web con el
    Sello QA 6H; el anti-jerga V-26 apunta al copy visible, no al código de
    test (mismo criterio que V-27/V-30 en el POS).
    """
    return name.endswith(".test.ts") is False and name.endswith(".spec.ts") is False and name.endswith(".config.ts") is False
EXT = {".svelte", ".ts", ".md", ".html", ".css"}

# Comentarios de código (TS/CSS) — no son copy renderizado.
COMMENT = re.compile(
    r"^\s*(//|/\*|\*|<!--)|^\s*\*/\s*$",
)

def _is_comment(line: str) -> bool:
    stripped = line.lstrip()
    if COMMENT.match(line):
        return True
    if stripped.startswith("/*") or stripped.startswith("*") or stripped.startswith("//"):
        return True
    return False


def iter_files() -> list[str]:
    out: list[str] = []
    if not os.path.isdir(TARGET):
        return out
    for dirpath, dirnames, filenames in os.walk(TARGET):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            ext = os.path.splitext(name)[1]
            if ext in EXT and _is_scanned(name):
                out.append(os.path.join(dirpath, name))
    return out


def main() -> int:
    if not os.path.isdir(TARGET):
        print("RESULT MARKETING_COPY GREEN")
        print("     apps/marketing-web aún no existe")
        return 0
    problems: list[str] = []
    for path in iter_files():
        rel = os.path.relpath(path, ROOT)
        try:
            text = open(path, encoding="utf-8").read()
        except OSError as e:
            problems.append(f"{rel}: {e}")
            continue
        for i, line in enumerate(text.splitlines(), 1):
            if _is_comment(line):
                continue
            for pat, tag in ((BANNED, "jerga técnica"), (INTERNAL, "referencia interna")):
                m = pat.search(line)
                if m:
                    problems.append(f"{rel}:{i}: {tag} '{m.group(0)}'")
                    break
    if problems:
        print(f"RESULT MARKETING_COPY RED  {len(problems)} hallazgo(s)")
        for p in problems[:12]:
            print(f"     {p}")
        return 1
    print("RESULT MARKETING_COPY GREEN")
    print(f"     {len(iter_files())} archivo(s) sin jerga técnica GTM §1")
    return 0


if __name__ == "__main__":
    sys.exit(main())
