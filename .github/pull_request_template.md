# Cambio

<!-- Qué cambia y por qué, en 1-3 líneas. Referencia el sprint (docs/ROADMAP.md). -->

**Sprint / capability:**
**Secciones tocadas:** <!-- p. ej. Arquitectura §5.3, Roadmap FASE 6B -->

## Contrato raíz (AGENTS.md §2)

- [ ] Ninguna invariante 1-10 violada. Si el cambio roza una, se explica cómo la respeta.
- [ ] Dinero solo en `INTEGER cents`; atomicidad con `db.batch([...])` (nunca `db.transaction`).
- [ ] Sin forks por vertical: la funcionalidad se habilita por capability (ADR-ARCH-002).
- [ ] DRY de dominio: la regla se define **una vez** en la especificación; los demás docs la referencian por `§`.

## Gate documental

- [ ] `scripts/verify.sh` en `RESULT SUITE GREEN` (pegar la salida abajo).
- [ ] Registry §0.4 actualizado si se creó o movió una regla (sin IDs huérfanos).
- [ ] `INDEX.md` regenerado con `scripts/index.sh` si cambiaron capabilities, DDL, reglas, puertos o packages.

```text
<!-- salida de scripts/verify.sh -->
```

## Ledger (invariante 4)

- [ ] Entrada nueva al final de `docs/LEDGER.md` con `prev_hash`/`entry_hash` reales (skill `kipus-changelog`).
- [ ] Ninguna entrada previa editada ni borrada.

**Entrada:** `id: ____`  ·  **entry_hash:** `____`

## Quality Gate (Proceso §8.1)

- [ ] `R` (ejecuta): ____
- [ ] `A` (aprueba el cierre): ____
- [ ] `V` (verifica de forma independiente, distinto de `R`): ____
- [ ] Evidencia adjunta. Para sprints de implementación: RED→GREEN, migración D1 y benchmarks; sin evidencia el gate es `NO-GO`.
