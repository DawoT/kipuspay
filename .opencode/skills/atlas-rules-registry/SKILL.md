---
name: atlas-rules-registry
description: Valida la tabla canónica de reglas de KipusPay (Registry §0.4 de la Arquitectura): IDs huérfanos (referenciados sin definir) y punteros duplicados (una regla con más de un lugar de definición). Úsalo antes de cerrar cualquier cambio que toque reglas.
allowed-tools: Bash(grep:*) Bash(sed:*) Bash(python3:*)
---

# atlas-rules-registry — Validación del Registry

Garantiza la regla DRY de dominio (invariante 9): cada regla vive **una** vez en la especificación y cualquier doc la referencia por `§`.

## Qué valida

1. **IDs huérfanos:** una regla referenciada en cualquier doc (`Agents`, `GTM`, `Ledger`, código) que **no** exista en el Registry §0.4.
2. **Duplicados de puntero:** dos definiciones canónicas para el mismo ID (fuera de las reglas marcadas como "compartida", que comparten sección por diseño).
3. **Prefijos inválidos:** IDs con prefijo no autorizado (autorizados: `SEC-`, `FIS-`, `COM-`, `DAT-`, `PERF-`, `SYN-`, `ADR-`, `LPDP-`).

## Ejecución

```bash
# inventario de IDs usados en el repo
grep -rhoE '\b(SEC|FIS|COM|DAT|PERF|SYN|ADR|LPDP)-[A-Z0-9]+\b' --include='*.md' --include='*.ts' . | sort -u
```

Cruza el resultado contra la tabla de §0.4. Cualquier ID fuera de la tabla es **huérfano** → o se define en la especificación (y se agrega al Registry), o la referencia se corrige.

## Reglas especiales

- `FIS-01`, `DAT-03`, `DAT-09`, `DAT-10`: definidas por corrección de ledger (0164/0165) — su puntero canónico ya está en el Registry; no volver a definirlas en prosa.
- Reglas marcadas "compartida" en el Registry (p. ej. SEC-05/SYN-02, SEC-06/SYN-04, PERF-08/PERF-10, FIS-02/DAT-02): comparten sección canónica por diseño; el Registry es el único puntero.

## Criterios de salida

- Sin huérfanos ni duplicados → `GREEN`.
- Cualquier hallazgo → corregir en la especificación y el Registry **antes** del commit.