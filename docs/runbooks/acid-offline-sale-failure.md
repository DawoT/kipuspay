---
doc_id: runbook-acid-offline-sale-failure
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Runbook — Fallo mid-batch / oversell / sync duplicado (motor ACID)


| Campo | Valor |
|---|---|
| Severidad tipica | SEV-1 (dinero/stock) / SEV-2 (flag off) |
| Owner on-call | Staff SRE + Staff Backend ACID |
| Ultima ensayada | 2026-08-04 (process-offline-sale-atomic.integration + chaos-harness) |
| Relaciona | Arquitectura §6 · ADR-0007 · SYN-06 · SYN-12 · Roadmap Sprint 4 |

## Sintomas

- `POST /api/pos/offline-sale` → 422 `INSUFFICIENT_STOCK` / `SESSION_CLOSED` / skew.
- 500 `OFFLINE_SALE_FAILED` tras fallo de batch (guard CHECK).
- 404 `FEATURE_DISABLED` si `FEATURE_ACID_OFFLINE_SALE` ≠ 1/true.
- Stock negativo o doble venta con mismo `offlineSaleId` (incidente grave).

## Impacto

- Caja offline sigue encolando localmente; sync falla hasta remediar.
- Oversell controlado (SYN-06) solo si `allow_negative_stock`; MVP Sprint 4 rechaza.

## Diagnóstico rápido (<5 min)

1. Flag `FEATURE_ACID_OFFLINE_SALE` en Worker.
2. Binding `DB` / migraciones hasta `0003_atomic_guards`.
3. Sesión `OPEN`; serie NV activa; stock en `branch_product_stock`.
4. Buscar `offline_client_sale_id` duplicado → debe ser `ALREADY_SYNCED`.

## Mitigación

1. Activar/desactivar flag sin rollback de código (§5.1).
2. No borrar ventas: reconciliar con `ALREADY_SYNCED`.
3. Si batch abortó: verificar 0 filas huérfanas (sale sin items).
4. Storm de sync: el UNIQUE evita doble efecto.

## Rollback

- Poner `FEATURE_ACID_OFFLINE_SALE=0`.
- Revertir Worker solo si el bug es de cableado (suite integration GREEN).

## Escalamiento

| Condición | Escalar a |
|---|---|
| Stock negativo sin allow_negative | Staff Principal + Backend ACID |
| Pérdida de venta aceptada en caja | Staff Backend ACID (SEV-1) |

## Ensayo (suite = drill)

- Guard ok=0 sin efectos parciales (`schema.integration`).
- Concurrent writers stock=2 / N=5 → 2 SUCCESS, stock=0.
- Duplicate retry → un solo `sales` row.

## Postmortem

- Entrada de ledger: `id: ____`
- Acción preventiva: …
