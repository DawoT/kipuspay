#!/usr/bin/env python3
"""KipusPay — contrato de integración entre apps (AGENTS.md §5).

Emite `RESULT <ID> GREEN|RED [motivo]` por check y sale 1 si alguno es RED.

V-29  paridad de triggers de epoch: toda tabla del registry D1_BACKUP_TABLES
      (data-backup-registry.generated.ts) debe tener sus 3 triggers de
      tenant_data_epochs en las migraciones (prefijo `backup_epoch_` o
      `epoch_`, contrato de 0035). Excluidas por diseño las tablas de
      infraestructura del propio backup: `tenant_data_epochs` (tabla de
      control: recursión), `data_backup_*` y `restore_dry_runs` (escriben
      durante el snapshot). Fe de errata 0052/0053: growth_events y 15 tablas
      de sprints 38-52 se quedaron sin triggers y sus cambios se perdían del
      snapshot incremental si eran los únicos.

V-28  contrato POS↔API: todo path `/api/...` que los clientes de pos-web
      invocan (apiFetch o fetch directo, método inferido del contexto) debe
      estar registrado en apps/worker-api/src/index.ts con app.<método>.
      Fe de errata 0396: /api/cash/authz-token, step-up-token y PUT
      returns/policy estaban implementados pero jamás registrados (404 real;
      la matriz de rutas protegidas no lo detectaba porque el middleware
      ALL /api/* responde 401 antes que el 404 del router).
      NOTA: los handlers `run*Http` usados SOLO internamente (p.ej.
      runSendOwnerPushHttp invocado por loyalty-messaging-routes, sin
      endpoint propio) son legítimos y quedan fuera de este contrato: el
      check valida paths que el POS invoca, no la totalidad de los exports.
"""
from __future__ import annotations

import importlib.util
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

RED = "RESULT {} RED {}"
GREEN = "RESULT {} GREEN"
FAIL = 0

REGISTRY = os.path.join(
    ROOT, "packages/adapters-d1/src/data-backup-registry.generated.ts"
)
MIGRATIONS = os.path.join(ROOT, "packages/adapters-d1/migrations")
INDEX_TS = os.path.join(ROOT, "apps/worker-api/src/index.ts")
POS_SRC = os.path.join(ROOT, "apps/pos-web/src")

# Tablas de infraestructura del backup: no pueden tener triggers de epoch.
# tenants es la raíz del multitenant (el epoch vive POR tenant; un trigger
# sobre ella no tiene semántica de backup por-tenant).
BACKUP_INFRA = re.compile(
    r"^(tenant_data_epochs|tenants|data_backup.*|restore_dry_runs)$"
)

# ---------------------------------------------------------------------------
# V-27 — paridad de triggers de epoch
# ---------------------------------------------------------------------------


def run_v29() -> int:
    if not os.path.exists(REGISTRY):
        print(RED.format("V-29", f"registry ausente: {REGISTRY}"))
        return 1
    registry_src = open(REGISTRY, encoding="utf-8").read()
    tables = sorted(
        set(re.findall(r"name:\s*'([a-z_0-9]+)'", registry_src))
    )
    if not tables:
        print(RED.format("V-29", "registry vacío"))
        return 1

    migrations_src = ""
    for fn in sorted(os.listdir(MIGRATIONS)):
        if fn.endswith(".sql"):
            migrations_src += open(
                os.path.join(MIGRATIONS, fn), encoding="utf-8"
            ).read() + "\n"

    missing = epoch_parity_missing(tables, migrations_src)

    if missing:
        print(RED.format("V-29", f"tablas del registry sin triggers epoch: {', '.join(missing)}"))
        return 1
    print(GREEN.format("V-29"))
    return 0


def epoch_parity_missing(tables: list[str], migrations_src: str) -> list[str]:
    """Tablas del registry sin sus 3 triggers de epoch en las migraciones."""
    missing: list[str] = []
    for table in tables:
        if BACKUP_INFRA.match(table):
            continue
        have = all(
            re.search(
                rf"CREATE TRIGGER (?:backup_epoch|epoch)_{table}_{kind}\b",
                migrations_src,
            )
            for kind in ("insert", "update", "delete")
        )
        if not have:
            missing.append(table)
    return missing


# ---------------------------------------------------------------------------
# V-28 — contrato POS↔API
# ---------------------------------------------------------------------------

# Paths que el POS resuelve dinámicamente o contra otro servidor (allowlist).
ALLOWLIST_V28 = {
    # El harness dev apunta a su propia base y no es ruta de producto.
    "dev": None,
}

PATH_RE = re.compile(r"/api/(?:[a-z0-9_-]+|\*)(?:/(?:[a-z0-9_-]+|\*))*")

# métodos que los clientes pueden enviar en fetch directo o apiFetch:
# solo `method: 'X'` explícito (una palabra GET/POST suelta en otra
# sentencia de la ventana no implica método).
METHOD_RE = re.compile(r"method:\s*'([A-Z]+)'")


def extract_api_paths_from_line(line: str) -> list[str]:
    """Paths `/api/...` en literales y en templates `${base}/api/.../${id}`."""
    collapsed = re.sub(r"\$\{[^}]+\}", "*", line)
    out: list[str] = []
    for raw in PATH_RE.findall(collapsed):
        static = raw.split("?")[0].rstrip("/")
        if static.startswith("/api/"):
            out.append(static)
    return out


def _read_pos_paths():
    """Extrae (path_literal, metodos_inferidos) de los clientes del POS."""
    found: dict[str, set[str]] = {}
    for root, _dirs, files in os.walk(POS_SRC):
        for fn in files:
            if not fn.endswith((".ts", ".svelte")):
                continue
            if fn.endswith(".test.ts"):
                continue
            path = os.path.join(root, fn)
            if "/dev/" in path.replace(POS_SRC, ""):
                continue
            lines = open(path, encoding="utf-8").readlines()
            for i, line in enumerate(lines):
                stripped = line.strip()
                if (
                    stripped.startswith("//")
                    or stripped.startswith("*")
                    or stripped.startswith("/*")
                    or stripped.startswith("<!--")
                ):
                    continue
                for static in extract_api_paths_from_line(line):
                    window = "\n".join(lines[i : i + 2])
                    methods = set(METHOD_RE.findall(window))
                    # Sin `method:` explícito en la ventana (helpers `post()`/
                    # `request()` con el literal aparte): exigir solo existencia.
                    found.setdefault(static, set()).update(methods or {"*"})
    return found


def _normalize_template(path: str) -> str:
    return "/".join("*" if seg.startswith(":") else seg for seg in path.split("/"))


def run_v28() -> int:
    index_src = open(INDEX_TS, encoding="utf-8").read()
    registered = registered_api_routes(index_src)
    missing = route_parity_missing(registered, _read_pos_paths())
    if missing:
        print(RED.format("V-28", "; ".join(missing[:12])))
        return 1
    print(GREEN.format("V-28"))
    return 0


def registered_api_routes(index_src: str) -> list[tuple[str, str]]:
    """(método, template normalizado) de app.<método>('/api/...') en index.ts."""
    registered: list[tuple[str, str]] = []
    for m in re.finditer(r"app\.(get|post|put|patch|delete)\(\s*'([^']+)'", index_src):
        path = _normalize_template(m.group(2))
        if path.startswith("/api/"):
            registered.append((m.group(1).upper(), path))
    return registered


def _template_matches(template: str, literal: str) -> bool:
    """Template registrado ('/api/cash/:id' o '/api/cash/*') vs path concreto
    que el POS invoca ('/api/cash/authz-token')."""
    t = template.split("?")[0].split("/")
    l = literal.split("?")[0].split("/")
    if len(t) != len(l):
        return False
    return all(seg_t == "*" or seg_t.startswith(":") or seg_t == seg_l for seg_t, seg_l in zip(t, l))


def route_parity_missing(
    registered: list[tuple[str, str]],
    pos_paths: dict[str, set[str]],
) -> list[str]:
    """Paths que el POS invoca sin registro (o con método ausente) en el worker."""
    missing: list[str] = []
    for literal, methods in sorted(pos_paths.items()):
        hit_methods = {m for m, p in registered if _template_matches(p, literal)}
        if not hit_methods:
            missing.append(f"{'/'.join(sorted(methods))} {literal}")
            continue
        for method in sorted(methods):
            if method != "*" and method not in hit_methods:
                missing.append(f"{method} {literal} (registrado: {sorted(hit_methods)})")
    return missing


# ---------------------------------------------------------------------------

def main() -> int:
    rc = 0
    rc += run_v29()
    rc += run_v28()
    return 1 if rc else 0


if __name__ == "__main__":
    sys.exit(main())
