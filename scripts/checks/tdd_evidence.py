#!/usr/bin/env python3
"""KipusPay — V-20: evidencia TDD RED→GREEN del ledger (CAL-07, Arquitectura §13.9).

Valida que cada entrada del ledger que registra implementación de código tenga el
contrato TDD completo y que cada `test_ids` resuelva en un test del monorepo (cuando
el código exista). Un falso GREEN de TDD nace cuando el test_ids apunta a un test que
no existe o se omiten los run IDs del ciclo RED/GREEN.

Reglas:
- Entrada "de código" (declara `red_commit_sha`/`green_commit_sha` o `red_run_id`):
  debe incluir `red_run_id`, `green_run_id`, `red_commit_sha`, `green_commit_sha`,
  `ancestry_verified: true` y `expected_failure` (con la aserción esperada).
- Si el repo ya tiene archivos de test (`*.test.ts`, `*.spec.ts`, `*.test.js`,
  `*.spec.js`), cada `test_id` que no sea un check del gate (`V-NN`/`SUITE`) debe
  resolverse en un archivo de test del monorepo.
- Reachability: `green_commit_sha` y `red_commit_sha` deben ser ancestros de HEAD
  (`git merge-base --is-ancestor`), salvo que una entrada posterior con
  `relacion: CORRIGE` liste el id en `referencias_entradas` (SHA huérfano tras
  rewrite queda documentado por la CORRIGE, no se reescribe la entrada).

Emite `RESULT V-20 GREEN|RED [motivo]` y sale 1 si el contrato está incompleto.
"""
from __future__ import annotations

import glob
import importlib.util
import os
import re
import subprocess
import sys

_spec = importlib.util.spec_from_file_location("paths", f"{__file__.rsplit('/', 1)[0]}/paths.py")
paths = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(paths)

LEDGER = paths.LEDGER
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

REQUIRED_CODE = ("red_commit_sha", "green_commit_sha", "red_run_id", "green_run_id")
TEST_FILE_GLOBS = (
    "packages/**/*.test.ts",
    "packages/**/*.spec.ts",
    "packages/**/*.test.js",
    "packages/**/*.spec.js",
    "apps/**/*.test.ts",
    "apps/**/*.spec.ts",
    "apps/**/test/**/*.ts",
    "apps/**/tests/**/*.ts",
)


def load_test_names() -> set[str]:
    names: set[str] = set()
    excluded = ("/node_modules/", "/.svelte-kit/", "/dist/", "/coverage/", "/build/")
    for pattern in TEST_FILE_GLOBS:
        for p in glob.glob(os.path.join(ROOT, pattern), recursive=True):
            if any(seg in p for seg in excluded):
                continue
            rel = os.path.relpath(p, ROOT)
            base = os.path.splitext(os.path.basename(rel))[0]
            names.add(base)
            names.add(rel)
            names.add(base.replace(".test", "").replace(".spec", ""))
    return names


def parse_entries(lines: list[str]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    cur: dict[str, str] | None = None
    for line in lines:
        m = re.match(r"^id:\s*(\d+)\s*$", line)
        if m:
            cur = {"id": m.group(1)}
            out.append(cur)
            continue
        if cur is None:
            continue
        kv = re.match(r"^([a-z_]+):\s*(.+?)\s*$", line)
        if kv:
            cur[kv.group(1)] = kv.group(2)
    return out


def corriged_ids(entries: list[dict[str, str]]) -> set[str]:
    """Ids listados en referencias_entradas de entradas CORRIGE posteriores."""
    out: set[str] = set()
    for e in entries:
        if e.get("relacion", "").strip().upper() != "CORRIGE":
            continue
        refs = e.get("referencias_entradas", "")
        for rid in re.findall(r"\d+", refs):
            out.add(rid)
            out.add(rid.zfill(4))
    return out


def is_ancestor_of_head(sha: str) -> bool:
    sha = sha.strip()
    if not sha or sha.upper().startswith("N/A"):
        return True
    if not re.fullmatch(r"[0-9a-fA-F]{7,40}", sha):
        return False
    try:
        r = subprocess.run(
            ["git", "merge-base", "--is-ancestor", sha, "HEAD"],
            cwd=ROOT,
            capture_output=True,
            check=False,
        )
    except OSError:
        return False
    return r.returncode == 0


def main() -> int:
    if not os.path.exists(LEDGER):
        print("RESULT V-20 RED  falta docs/LEDGER.md")
        return 1
    with open(LEDGER, encoding="utf-8") as fh:
        entries = parse_entries(fh.readlines())
    test_names = load_test_names()
    corrected = corriged_ids(entries)
    problems: list[str] = []
    for e in entries:
        has_code_keys = any(e.get(f) for f in ("red_commit_sha", "green_commit_sha", "red_run_id"))
        has_real_sha = any(
            s.strip() and not s.strip().upper().startswith("N/A")
            for s in (e.get("red_commit_sha", ""), e.get("green_commit_sha", ""))
        )
        is_code = has_code_keys and has_real_sha
        if is_code:
            missing = [f for f in REQUIRED_CODE if not e.get(f)]
            if e.get("ancestry_verified", "").strip() != "true":
                missing.append("ancestry_verified")
            if not e.get("expected_failure"):
                missing.append("expected_failure")
            if missing:
                problems.append(f"{e['id']}: faltan {', '.join(missing)}")
            # Reachability + test_ids (skip if superseded by CORRIGE)
            if e["id"] not in corrected and e["id"].zfill(4) not in corrected:
                for field in ("green_commit_sha", "red_commit_sha"):
                    sha = e.get(field, "").strip()
                    if sha and not sha.upper().startswith("N/A") and not is_ancestor_of_head(sha):
                        problems.append(f"{e['id']}: {field} {sha[:12]} no es ancestro de HEAD")
                tids = [
                    t.strip()
                    for t in e.get("test_ids", "").replace("[", " ").replace("]", " ").split(",")
                    if t.strip()
                ]
                if is_code and test_names:
                    for t in tids:
                        if re.match(r"^V-\d+$", t) or t == "SUITE":
                            continue
                        if t not in test_names:
                            problems.append(f"{e['id']}: test_id {t} no resuelve en un test del repo")
    if problems:
        print(f"RESULT V-20 RED  {len(problems)} problema(s) en el contrato TDD")
        for p in problems[:6]:
            print(f"     {p}")
        return 1
    code_entries = sum(1 for e in entries if any(e.get(f) for f in ("red_commit_sha", "green_commit_sha")))
    print("RESULT V-20 GREEN")
    print(f"     {len(entries)} entradas revisadas; {code_entries} de código con contrato TDD completo")
    return 0


if __name__ == "__main__":
    sys.exit(main())
