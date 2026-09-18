#!/usr/bin/env python3
"""KipusPay — V-30: cero IDs/valores demo en el código fuente del POS.

Completa V-27 (que solo revisa el TEXTO VISIBLE del TEMPLATE de rutas):
aquí se escanea todo apps/pos-web/src (.ts + .svelte, sin *.test.* ni
routes/dev/) y se detectan literales de string que contienen "demo"
asignados como valor (estado, objecto, params). Las comparaciones
(`!== 'demo'`, defensivas contra sesiones legacy) y los comentarios se
permiten. Cero IDs demo en el código es la fuente de cero IDs demo en la
UI (F-6).

Emite RESULT V-30 GREEN|RED y sale 1 si hay hallazgos.
"""
from __future__ import annotations

import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
POS_SRC = os.path.join(ROOT, "apps", "pos-web", "src")

# Literales de string (comilla simple/doble/backtick) que contienen "demo"
# o los identificadores demo de la clase F-6 detectados en el Sello QA (el
# kiosk usaba 'k1'/'b-kiosk'/'s-kiosk'/'Item kiosko'/'Producto de ejemplo'
# y el cobro real fallaba contra el server).
DEMO_LITERAL = re.compile(
    r"(['\"`])([^'\"`\n]*(?:demo|b-kiosk|s-kiosk|Item kiosko|Producto de ejemplo)[^'\"`\n]*)\1",
    re.IGNORECASE,
)
# Contexto previo: comparación (referencia defensiva, permitida).
COMPARISON = re.compile(r"(?:===|!==|==|!=)\s*$")


def strip_comments(text: str) -> str:
    """Quita //, /* */ y <!-- --> fuera de strings (tokenizador minimal)."""
    out: list[str] = []
    i, n = 0, len(text)
    in_block = in_line = False
    in_string: str | None = None
    while i < n:
        c = text[i]
        nxt = text[i + 1] if i + 1 < n else ""
        if in_string:
            out.append(c)
            if c == "\\":
                if i + 1 < n:
                    out.append(text[i + 1])
                    i += 2
                    continue
            elif c == in_string:
                in_string = None
            i += 1
            continue
        if in_line:
            out.append(c) if c == "\n" else None
            if c == "\n":
                in_line = False
            i += 1
            continue
        if in_block:
            if c == "*" and nxt == "/":
                in_block = False
                i += 2
                continue
            if c == "-" and text[i : i + 3] == "-->":
                in_block = False
                i += 3
                continue
            i += 1
            continue
        if c == "/" and nxt == "/":
            in_line = True
            i += 2
            continue
        if c == "/" and nxt == "*":
            in_block = True
            i += 2
            continue
        if text.startswith("<!--", i):
            in_block = True
            i += 4
            continue
        if c in ("'", '"', "`"):
            in_string = c
            out.append(c)
            i += 1
            continue
        out.append(c)
        i += 1
    return "".join(out)


def scan_file(path: str) -> list[tuple[int, str]]:
    text = open(path, encoding="utf-8").read()
    clean = strip_comments(text)
    problems: list[tuple[int, str]] = []
    for m in DEMO_LITERAL.finditer(clean):
        start = m.start()
        before = clean[max(0, start - 12) : start]
        if COMPARISON.search(before):
            continue
        line = clean.count("\n", 0, start) + 1
        problems.append((line, m.group(2)))
    return problems


def iter_files() -> list[str]:
    out: list[str] = []
    if not os.path.isdir(POS_SRC):
        return out
    for dirpath, dirnames, filenames in os.walk(POS_SRC):
        dirnames[:] = [d for d in dirnames if d not in {"dev", "node_modules"}]
        for name in filenames:
            if name.endswith((".ts", ".svelte")) and ".test." not in name and not name.endswith(
                ".d.ts"
            ):
                out.append(os.path.join(dirpath, name))
    return out


def main() -> int:
    problems: list[str] = []
    for path in iter_files():
        rel = os.path.relpath(path, ROOT)
        for line, literal in scan_file(path):
            problems.append(f"{rel}:{line}: literal demo '{literal}'")
    if problems:
        print(f"RESULT V-30 RED  {len(problems)} hallazgo(s)")
        for p in problems[:20]:
            print(f"     {p}")
        return 1
    print("RESULT V-30 GREEN")
    print(f"     {len(iter_files())} archivo(s) de fuente sin literales demo")
    return 0


if __name__ == "__main__":
    sys.exit(main())