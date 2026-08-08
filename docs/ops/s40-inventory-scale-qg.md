---
doc_id: ops-s40-inventory-scale-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 40 — Venta por peso variable — Quality Gate

**Estado:** GOV-APROBADO (firma A+V)  
**Capability:** `inventory.scale`  
**Spec:** Arquitectura §5.7 regla 25 · ADR-0024 · GTM-17 · Roadmap FASE 6D

## Evidencia

| Check | Resultado |
|---|---|
| ADR-0024: INTEGER microunits, autoridad server-side y heartbeat fail-closed | GREEN |
| Mig 0033 DAT-12: políticas, dispositivos, sesiones y mediciones append-only | GREEN |
| Down 0033 protegido ante políticas, dispositivos, sesiones, mediciones o productos WEIGH activos | GREEN |
| Dominio: normalización HID/CDC/WebUSB y half-up exacto con BigInt/safe-integer | GREEN |
| ACID: línea + medición + stock agregado/ubicación/FEFO + token + audit en un `db.batch` | GREEN |
| Offline/sync: catálogo, UOM, política, terminal, peso y centavos revalidados por servidor | GREEN |
| Authz: token opaco SHA-256, one-shot, TTL 90 s y scope actor/terminal/operación/línea/medición | GREEN |
| Sesión de terminal registrada y heartbeat monotónico autenticado | GREEN |
| POS/Admin: estados accesibles, manual rojo, controles ≥44 px, `aria-live` y reduced motion | GREEN |
| Hardware virtual: WebHID, Web Serial CDC/ASCII y WebUSB vendor-specific | GREEN |
| Concurrencia D1: un ganador por medición/token; rollback sin drift ni fork de audit | GREEN |
| Security Review: 0 critical/high; dos hallazgos medium remediados | GREEN |
| Chaos `inventory-scale-heartbeat`: 500 ciclos, 0 stale/zero/replay/drift | GREEN |
| Cobertura adapters-d1: ramas 80.24%; scale atomic 98.98% | GREEN |
| `scripts/verify.sh` | SUITE GREEN |
| `scripts/quality.sh` | Quality Gate OK |

## Evidencia RED→GREEN

- RED `b3ac52d`: dominio, migración 0033, rutas, clientes de balanza y chaos no existían.
- GREEN `e4753df`: implementación vertical completa, 107 tests de integración D1 y gate integral.
- RED seguridad: sync comparaba token crudo contra hash y aceptaba terminal libre por cabecera.
- GREEN seguridad: hash SHA-256 uniforme y sesión activa ligada a tenant, usuario, sucursal y terminal.
- RED funcional: supervisor aprobador y cajero consumidor compartían un actor ambiguo.
- GREEN funcional: `approved_by` y actor consumidor quedan separados y dentro del scope one-shot.
- GREEN hardware: parsers acotados, allowlist, cleanup y reconnect explícito para los tres protocolos.
- GREEN chaos: 500 ciclos deterministas sin peso cero silencioso, stale aceptado, duplicado ni drift.

## Matriz certificada

| Protocolo | Fixture | Casos |
|---|---|---|
| WebHID | report ID allowlisted | estable/inestable, report desconocido, desconexión y stale |
| Web Serial | CDC/ASCII con checksum | frame parcial/corrupto, signo/unidad, cierre y reconnect |
| WebUSB | endpoint vendor-specific | endpoint inválido, suspensión/cable, cleanup y stale |

La certificación automatizada usa fixtures deterministas. La habilitación de un modelo
físico requiere registrar su fingerprint/perfil en el piloto; no se afirma compatibilidad
universal con cualquier balanza USB.

## Cutover por tenant

1. Aplicar 0033 con flags apagados y validar down sobre un tenant sin datos de balanza.
2. Registrar terminal, sesión, dispositivo y perfil allowlisted; ejecutar diagnóstico físico.
3. Configurar el umbral manual; el default `0` exige autorización para cualquier peso manual.
4. Observar ventas shadow y verificar paridad de microunidades, centavos, ubicación y FEFO.
5. Activar backend y UI por tenant; ante stale/drift, apagar UI y conservar el motor fail-closed.
6. El down aborta con estado activo; nunca elimina mediciones append-only.

## RACI

| Rol | Quién | Firma |
|---|---|---|
| R | Staff Frontend + Staff Hardware + Staff Backend | OK |
| A | Staff Principal + Staff Backend ACID | OK |
| V | Staff Hardware + Staff QA independiente + Staff Security | OK |
| Claim | Staff PM | OK — solo “venta por peso con balanza compatible o ingreso manual autorizado” |

## Residuales

- Certificación por modelo físico se realiza en rollout con fingerprint/perfil allowlisted.
- Etiquetas de precio → Sprint 41.
- Backup/restore → Sprint 42.
