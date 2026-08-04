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
    r"Edge|D1|Workers|ACID|sharding|Durable\s*Object|DurableObject|"
    r"Analytics\s*Engine|workerd|Cloudflare\s*Workers"
    r")\b",
    re.IGNORECASE,
)

SKIP_DIRS = {".svelte-kit", "node_modules", "coverage", "dist", "build", "static"}
EXT = {".svelte", ".ts", ".md", ".html", ".css"}


def iter_files() -> list[str]:
    out: list[str] = []
    if not os.path.isdir(TARGET):
        return out
    for dirpath, dirnames, filenames in os.walk(TARGET):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            ext = os.path.splitext(name)[1]
            if ext in EXT and not name.endswith(".test.ts"):
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
            if BANNED.search(line):
                m = BANNED.search(line)
                problems.append(f"{rel}:{i}: jerga '{m.group(0) if m else '?'}'")
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
