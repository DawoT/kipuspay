---
doc_id: roadmap-fase-0
alias: Roadmap
authority: normativa
owner: "@DawoT"
fase: "0"
sprints: "0"
---

### FASE 0 — Fundación y Gobernanza del Escuadrón

#### Sprint 0 — Charter, Roles, Tooling de Calidad y Changelog
**Duración:** 1 semana · **Agentes:** Staff Principal (owner), todos los roles reciben asignación

**Entregables**
- Charter del escuadrón (este documento, adoptado formalmente) y asignación de owner por rol.
- Plantilla de ADR, plantilla de runbook, estructura de repositorio.
- Pipeline de CI con linters, cobertura de tests, escaneo de secretos y de dependencias vulnerables (Sección 5).
- Pipeline de testing multi-capa configurado con los umbrales mínimos de la Sección 6 activos en CI.
- Esquema y tooling del Changelog Obligatorio inmutable (Sección 7), incluida la plantilla de entrada.
- Constitución del Staff Review Board (quórum mínimo por tipo de entregable, según Sección 4).

**Criterios de aceptación**
- CI en verde sobre un pipeline de referencia (hello-world) con los cuatro escaneos activos.
- ADR-0001 ("Adopción de este roadmap, del DoD global y del Changelog inmutable") aprobado por el Staff Review Board.
- Primera entrada de changelog registrada siguiendo el esquema de la Sección 7.2, con evidencia adjunta.

**Quality Gate:** ningún sprint de la Fase 1 puede iniciar sin este sprint cerrado.

---

