#!/usr/bin/env python3
"""KipusPay — auditoría de copy del POS: 0 jerga técnica visible (Sprint F / V-27).

Escanea el TEMPLATE de las rutas de apps/pos-web (excluye routes/dev/) y
extrae el TEXTO VISIBLE: quita bloques <script>/<style>/comentarios, etiquetas,
atributos estructurales (id/data-testid/class/bind/on*) y expresiones Svelte
{...}; conserva labels, placeholders, títulos y badges (copy real). Emite
RESULT V-27 GREEN|RED.
"""
from __future__ import annotations

import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ROUTES = os.path.join(ROOT, "apps", "pos-web", "src", "routes")

BANNED_PREFIXES = re.compile(r"(FEATURE_|PUBLIC_FEATURE_)", re.IGNORECASE)

BANNED_WORDS = re.compile(
    r"\b("
    r"capability|Capability|"
    r"Edge|D1|IDB|IndexedDB|TTFS|p80|"
    r"lease|Lease|outbox|Outbox|preflight|Pre-flight|"
    r"KPBK1|KEK|SHA-256|Schema|Registry|"
    r"microunidades|microunits|1e6|cents|céntimos|centavos|"
    r"WebHID|WebUSB|Web Serial|Server-Bound|ESC/POS|"
    r"tenantId|userId|branchId|sessionId|terminalId|"
    r"s-demo|b-demo|t-demo|pm-cash|p-demo|cust-demo|oc-demo|po-demo|"
    r"snapshot|flags|Bearer|endpoint|multitenancy|Tenant|demo|"
    r"JSON|json"
    r")\b",
    re.IGNORECASE,
)

BANNED_PATTERNS = [
    re.compile(r"GTM §"),
    re.compile(r"GTM-\d+"),
    re.compile(r"DAT-\d+"),
    re.compile(r"QG Sprint"),
    re.compile(r"Rollup D1"),
]

SCRIPT_BLOCK = re.compile(r"<script\b[^>]*>.*?</script>", re.S)
STYLE_BLOCK = re.compile(r"<style\b[^>]*>.*?</style>", re.S)
COMMENT_BLOCK = re.compile(r"<!--.*?-->", re.S)

TAG = re.compile(r"<[^>]+>")
COPY_ATTR = re.compile(
    r"\b(?:label|placeholder|title|aria-label|aria-description|aria-valuetext)"
    r"=[\"']([^\"']*)[\"']",
    re.I,
)
STRUCTURAL_ATTR = re.compile(
    r"\b(?:id|data-testid|class|for|name|value|checked|disabled|href|target|rel|"
    r"autocomplete|inputmode|maxlength|min|max|step|pattern|rows|cols|colspan)"
    r"=[\"'][^\"']*[\"']"
)
BIND_ATTR = re.compile(r"\b(?:class|bind:[a-z-]+|on:[a-z]+|on[a-z]+)=")
EXPRESSION = re.compile(r"\{[^{}]*\}")


def visible_text(line: str) -> str:
    if 'href={`' in line or "href={`" in line:
        return ''
    copy_attrs = " ".join(COPY_ATTR.findall(line))
    line = TAG.sub(" ", line)
    line = STRUCTURAL_ATTR.sub(" ", line)
    line = BIND_ATTR.sub(" ", line)
    line = EXPRESSION.sub(" ", line)
    return f"{copy_attrs} {line}".strip()


def template_lines(path: str) -> list[tuple[int, str]]:
    text = open(path, encoding="utf-8").read()
    text = SCRIPT_BLOCK.sub("", text)
    text = STYLE_BLOCK.sub("", text)
    text = COMMENT_BLOCK.sub("", text)
    return [(i, visible_text(line)) for i, line in enumerate(text.splitlines(), 1)]


def iter_routes() -> list[str]:
    out: list[str] = []
    if not os.path.isdir(ROUTES):
        return out
    for dirpath, dirnames, filenames in os.walk(ROUTES):
        dirnames[:] = [d for d in dirnames if d not in {"dev", "node_modules"}]
        for name in filenames:
            if name.endswith(".svelte"):
                out.append(os.path.join(dirpath, name))
    return out


def main() -> int:
    problems: list[str] = []
    for path in iter_routes():
        rel = os.path.relpath(path, ROOT)
        for i, line in template_lines(path):
            m = BANNED_PREFIXES.search(line)
            if m:
                problems.append(f"{rel}:{i}: jerga '{m.group(0)}'")
                continue
            m = BANNED_WORDS.search(line)
            if m:
                problems.append(f"{rel}:{i}: jerga '{m.group(0)}'")
                continue
            for pat in BANNED_PATTERNS:
                m = pat.search(line)
                if m:
                    problems.append(f"{rel}:{i}: jerga '{m.group(0)}'")
                    break
    if problems:
        print(f"RESULT V-27 RED  {len(problems)} hallazgo(s)")
        for p in problems[:20]:
            print(f"     {p}")
        return 1
    print("RESULT V-27 GREEN")
    print(f"     {len(iter_routes())} ruta(s) sin jerga técnica visible")
    return 0


if __name__ == "__main__":
    sys.exit(main())
