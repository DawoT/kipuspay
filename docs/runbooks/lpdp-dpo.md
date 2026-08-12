---
doc_id: runbook-lpdp-dpo
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Runbook — Atención de solicitudes LPDP (export, borrado/anonimización)

| Campo | Valor |
|---|---|
| Severidad tipica | SEV-3 (obligación legal con plazo; sin impacto de caja) |
| Owner on-call | Staff Security (owner) / Staff Data |
| Ultima ensayada | 2026-08-12 (simulacro de cierre del Sprint 47) |
| Relaciona | Arquitectura §5.3 regla 32a (LPDP-01..04) · ADR-0031 · Ley N.º 29733 |

## Sintomas

Solicitud de un cliente (titular) o de la autoridad (INDECOPI): quiere una copia de
sus datos, o quiere que se borren/anonimicen. No es un incidente de sistema: es un
procedimiento legal con plazo de atención (la ley peruana exige responder con
prontitud; registrar la fecha de recepción).

## Impacto

- No atender en plazo = sanción LPDP y daño de confianza (claim GTM-09).
- Borrar mal = romper retención fiscal SUNAT (los comprobantes NO se destruyen).
- Ninguna venta ni caja se ve afectada: el proceso usa la API `/api/customers`.

## Diagnóstico rápido (<5 min)

1. Identificar al titular por su documento (RUC/DNI): `GET /api/customers` (listado sin PII) → navegar al detalle por `id`.
2. Verificar estado: si `piiErased = true`, el titular ya fue anonimizado: informar que
   solo se conserva el documento fiscal retenido (00000000) y que el export devuelve `CUSTOMER_ERASED`.
3. Verificar consentimientos por propósito en el detalle (GRANT/REVOKE por `purpose`).

## Procedimiento — Export (derecho de acceso, LPDP-02)

1. En el panel Admin → Clientes, abrir al titular y pulsar **"Descargar copia de sus datos"**.
2. Entregar el JSON descargado al titular (por el canal acordado; registrar fecha).
   El export incluye perfil (PII), consentimientos y el historial de comprobantes.
3. Anotar en el registro interno: fecha de recepción, fecha de entrega, canal.
4. Si el panel no está disponible, usar la API directamente con un token de
   owner/admin/supervisor: `GET /api/customers/{id}/export`.

## Procedimiento — Borrado/anonimización (LPDP-03)

> La anonimización es irreversible. Los comprobantes fiscales se conservan
> (SUNAT ~5 años) con el vínculo a persona anonimizado (`[ANONYMIZED]`/`00000000`).

1. Abrir al titular en el panel y pulsar **"Anonimizar sus datos"**.
2. Confirmación doble en el panel (checkbox de irreversibilidad + confirmación final).
3. Verificar el resultado: el detalle muestra "Anonimizado" y `pii_erased = true`;
   los consentimientos quedan revocados (`consentsRevoked`).
4. Informar al titular qué se conserva (documento fiscal) y qué se borró.
5. Auditoría: el evento `LPDP_ERASE` queda en `audit_events` con la cadena
   `prev_hash`/`row_hash` (una sola tx `db.batch`).

## Qué NO hacer

- NO borrar filas de `sales` ni destruir comprobantes: viola retención SUNAT.
- NO anonimizar con el flag apagado (`FEATURE_LPDP` off ⇒ 404 `FEATURE_OFF`): primero
  habilitar la capability y verificar que el entorno es el correcto.
- NO pasar `tenant_id` desde el cliente: el backend lo toma del JWT (LPDP-04).
- NO prometer borrado "cuando quieras" en copy comercial (claim GTM-09 congelada
  hasta el QG del Sprint 47).

## Simulacro

Antes de cerrar el Sprint 47 se ejecuta el simulacro completo (Panel UI + API):
export de un cliente con datos, borrado de un segundo cliente, verificación del
evento `LPDP_ERASE` en `audit_events` y de la retención de snapshots fiscales.
Evidencia: `docs/ops/s47-lpdp-qg.md`.

## Escalamiento

| Condición | Escalar a |
|---|---|
| Solicitud de INDECOPI o autoridad | Staff Principal + Staff Security |
| Error de integridad en erase (batch fallido) | Staff Backend ACID (owner D1) |
| Disputa sobre conservación fiscal | Staff Principal + asesor legal |

## Postmortem

- Entrada de ledger (tipo Corrección / incidente): `id: ____`
- Acción preventiva con sprint owner: revisar el simulacro anual (Sprint 48 DR/BCP).
