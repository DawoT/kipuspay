#!/usr/bin/env python3
"""Append a ledger entry from stdin (body without entry_hash / fences)."""
from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path

LEDGER = Path("docs/LEDGER.md")


def main() -> int:
    body = sys.stdin.read()
    if not body.endswith("\n"):
        body += "\n"
    if "entry_hash:" in body:
        print("body must not include entry_hash", file=sys.stderr)
        return 1
    text = LEDGER.read_text(encoding="utf-8")
    prev_hash = re.findall(r"^entry_hash: ([a-f0-9]+)", text, re.M)[-1]
    # ensure prev_hash in body matches
    if f"prev_hash: {prev_hash}" not in body:
        print(f"prev_hash must be {prev_hash}", file=sys.stderr)
        return 1
    computed = hashlib.sha256(body.encode()).hexdigest()
    out: list[str] = []
    for line in body.splitlines(keepends=True):
        out.append(line)
        if line.startswith("prev_hash:"):
            out.append(f"entry_hash: {computed}\n")
    entry = "".join(out)
    block = "".join(l for l in out if not l.startswith("entry_hash:"))
    assert hashlib.sha256(block.encode()).hexdigest() == computed
    if not text.endswith("\n"):
        text += "\n"
    LEDGER.write_text(text + "\n```\n" + entry + "```\n", encoding="utf-8")
    print(computed)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
