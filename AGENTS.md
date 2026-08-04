# KipusPay — Manual de Operación para Agentes IA (Staff)

> Biblia de trabajo del escuadrón. **Léelo completo antes de tocar cualquier documento.**
> Este archivo es auto-cargado por opencode al iniciar; los documentos maestros son la doctrina.

## 1. Identidad

- **Producto:** KipusPay — POS & Facturación Electrónica multitenant edge-native (SUNAT Perú).
- **Repo:** `github.com/DawoT/kipuspay`
- **Marca:** "KipusPay" en todo el contenido normativo. El **ledger histórico** (`Ledger.md`, entradas 0143–0176) conserva "Atlas" como término histórico — declarado en la entrada 0177. Nunca re-escribir el ledger.

## 2. Invariantes no negociables (violar uno = NO-GO)

1. **Dinero:** solo `INTEGER cents` (`*_cents`). Cero `REAL`/`float` para columnas monetarias; `REAL` solo ratios/cantidades.
2. **D1:** atomicidad con `db.batch([...])`. **No existe `db.transaction(callback)`** en la API D1. Prohibido `UPSERT INTO`.
3. **ADR-ARCH-002 (Capability Model):** prohibido `switch(vertical)` y forks por vertical; las capabilities se habilitan por flags.
4. **Ledger append-only:** nunca editar ni borrar entradas (0143+). Toda corrección = entrada nueva con `relacion: CORRIGE`.
5. **Revocación fail-closed:** sin verificación de revocación disponible → `503`, nunca acceso por omisión.
6. **Webhooks:** firma HMAC verificada + ventana anti-replay ≤ 300 s.
7. **Offline-first:** la venta nunca se cae; reconciliación autoritativa server-side (la UI nunca es fuente de verdad de montos).
8. **Fiscal SUNAT:** sin "contingencia" como atajo; `PSE KipusPay` default; nunca afirmar aceptación antes del CDR.
9. **DRY de dominio:** cada regla vive UNA vez en la especificación; sprints y GTM la **referencian** (§), no la re-escriben.
10. **Zero-dependency cliente:** el Edge no renderiza tickets/QR/PDF con librerías npm; Web Platform APIs + código vendorizado.

## 3. Contrato de documentos (autoridad)

| Documento | Rol | Autoridad sobre |
|---|---|---|
| `Arquitectura Técnica POS SUNAT v8.0 KipusPay.md` | Especificación | DDL, reglas de negocio, motor transaccional, seguridad, fiscal |
| `Agents.md` | Proceso | Roles, DoD, Quality Gates, CI/CD, gobernanza, roadmap de sprints |
| `Ledger.md` | Registro | Changelog append-only (0143+) — **inmutable** |
| `GTM.md` | Comercial | Claims, pricing, gates GTM-01..12 |
| `AGENTS.md` | Contrato raíz | Invariantes + autoridad (este archivo) |

Regla de oro: si una regla existe en la especificación, **no** se repite en Agents.md ni GTM; se referencia con `§`.

## 4. Registry de reglas

- Tabla canónica **ID → sección → doc** en `Arquitectura…KipusPay.md` §0.4 (SEC-, FIS-, COM-, DAT-, PERF-, SYN-, ADR-, LPDP).
- Toda referencia a una regla en cualquier doc debe existir en el registry con **un solo** puntero canónico.
- Crear una regla = actualizar el registry + definirla UNA vez en la especificación. Nunca IDs huérfanos.

## 5. Verificación

```bash
scripts/verify.sh   # fences pares, 0 UPSERT INTO, 0 literales http/ws,
                    # db.transaction prohibido en código, FKs tenant, cadena del ledger
```

Se invoca manualmente o vía el skill `atlas-verify` (`.opencode/skills/`). El hook `pre-commit` la ejecuta automáticamente.

## 6. Skills del proyecto

| Skill | Uso |
|---|---|
| `atlas-changelog` | Escribir una entrada nueva en `Ledger.md` (schema v2 + `prev_hash`/`entry_hash` reales) |
| `atlas-rules-registry` | Validar IDs huérfanos/duplicados y punteros canónicos de reglas |
| `atlas-verify` | Batería de verificaciones documentales (fences, greps, ledger chain) |

## 7. Estado de gobernanza

- **`GOV-APROBADO`** (milestone de especificación, entrada 0176; renombre en 0177).
- Los **Quality Gates de implementación** (Agents §8.1) cierran por sprint con evidencia runtime (RED→GREEN, migración D1, benchmarks) y firma RACI de `A` + `V` independiente; sin evidencia, el gate es `NO-GO`.
- `GOV-APROBADO` no exime los gates runtime.
