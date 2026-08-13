---
doc_id: ops-launch-communication
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Comunicación de lanzamiento — Sprint 15 (FASE 5)

| Campo | Valor |
|---|---|
| Estado | Borrador aprobado en Go/No-Go (docs/ops/gonogo-sprint15.md) |
| Fecha | 2026-08-12 |
| Owner | Staff Content (redacción) · Staff Growth (canales) |
| Relaciona | GTM §1 (copy sin jerga, V-26) · GTM §7.1 (referidos) · Roadmap FASE 5 Sprint 15 |

## Mensaje principal (soft-launch)

"KipusPay es el POS y la facturación electrónica que funciona sin conexión:
vendes siempre, el sistema sincroniza y tu contador recibe todo en orden."

- Sin jerga técnica (Edge/D1/ACID/sharding/CDR/UBL/PSE — verificado por V-26).
- Sin "sin límite" (Arranque tiene cupo con sobregiro, GTM §4.1).
- Sin "contingencia" (el PSE KipusPay es el canal; ADR-FISCAL-001).

## Audiencias y canales

| Audiencia | Canal | Mensaje clave |
|---|---|---|
| Early adopters (lista de espera) | Email + WhatsApp | Acceso al soft-launch, cupo inicial, invitación a referidos (1+1 mes, GTM §7.1) |
| Dueños de negocio en espera | Blog + landings | "Tu primer comprobante en minutos" (TTFS) con claim-gate (GTM §2) |
| Contadores | Material de soporte | Plazos SUNAT (3d factura / 7d RC), portal CPE 1 año, export CSV |
| Equipo interno | Status page | Enlaces a runbooks (launch-rollback, reporting-rollups) |

## Mensajes prohibidos (checklist GTM §1 + V-26)

- [ ] Ningún término técnico interno (Edge, D1, Workers, ACID, sharding, CDR, UBL, PSE).
- [ ] Ningún claim de feature sin "(QG cerrado)" en GTM §2 (claim-gate).
- [ ] Ningún "ilimitado" para Arranque (cupo + sobregiro).
- [ ] Ningún sello de aprobación SUNAT sin evidencia (GTM-12).

## Activos

1. Post de blog "Primera venta en minutos" (ya publicado: `apps/marketing-web/src/lib/content/blog.ts`).
2. Post "Cómo funcionan los referidos" (ya publicado).
3. Social assets: `scripts/render-social-assets.mjs` (og-images por ruta).
4. Landing de vertical con claim-gate (live vs roadmap).

## Cronograma

| Día | Acción |
|---|---|
| T-3 | Redacción + revisión Staff Content (¿lo diría el dueño con su contador?) |
| T-2 | Aprobación copy + verificación V-26 |
| T-1 | Programación de correos + revisión de la status page |
| T-0 | Soft-launch + activación de referidos |

## Checklist de cierre

- [ ] Blog/copy sin jerga (V-26 GREEN).
- [ ] Claims de la comunicación trazables a GTM §2 con QG cerrado.
- [ ] Go/No-Go S15 firmado (docs/ops/gonogo-sprint15.md).
- [ ] Rollback ensayado (docs/runbooks/launch-rollback-sprint15.md).
