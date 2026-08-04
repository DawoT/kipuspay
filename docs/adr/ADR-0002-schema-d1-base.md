---
doc_id: adr-0002
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0002 — Esquema D1 base v8.0 como migraciones versionadas

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-04 |
| Decisores | Staff Principal, Staff Backend Datos |
| Consultados | Staff Security, Staff Fiscal |
| Informados | Escuadrón |
| Relaciona | Arquitectura §5.0 · §5.0.1 · §5.1 · §5.5 · Roadmap Sprint 1 · ADR-0001 · Ledger 0190 |

## Contexto

Sprint 1 exige DDL completo (tenants, series por sucursal, sales con plazos fiscales,
sunat_daily_summaries, dinero en INTEGER cents) con migraciones up/down verificables
en CI contra D1 real. La fuente normativa vive en `Arquitectura §5.5`; el código no
puede divergir.

## Decisión

1. El DDL canónico de §5.5 se materializa en
   `packages/adapters-d1/migrations/0001_ddl_base_v8.sql` (más `0000_schema_meta.sql`
   de humo Sprint 0).
2. Los scripts de reversión viven en `packages/adapters-d1/migrations-down/` (fuera del
   directorio que consume `readD1Migrations`, para no aplicar downs como ups).
3. La suite `src/schema.integration.test.ts` (pool-workers) es el Quality Gate de
   esquema: humo `db.batch`, `ruc` nullable, 0 columnas monetarias REAL, correlativo
   único, down limpia tablas de negocio.
4. El router tenant→shard mínimo es `resolveShardId` en `@kipuspay/adapters-d1`
   (auth/DO quedan en Sprint 2).

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Mantener DDL solo en Markdown | No es ejecutable ni reversible en CI |
| Un solo monolito SQL sin 0000 | Pierde el humo aislado de Sprint 0 |
| Downs dentro de `migrations/` | `readD1Migrations` los aplicaría como ups |

## Consecuencias

- **Gana:** gate de Sprint 1 medible; V-06/V-05 alineados con runtime D1.
- **Paga:** todo cambio de esquema = migración numerada + test + entrada de ledger.
- **Invariantes:** DAT-12, dinero INTEGER cents, series por branch (no por caja).
- **Activación:** Sprint 1.

## Evidencia de cierre

- Tests: `schema.integration.test.ts`, `index.test.ts` (resolveShardId).
- Ledger: `id: 0190`.
- Firmas RACI: `R` Staff Backend Datos · `A` Staff Principal · `V` Staff Security + Staff Fiscal.
