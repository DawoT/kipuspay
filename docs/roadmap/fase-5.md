---
doc_id: roadmap-fase-5
alias: Roadmap
authority: normativa
owner: "@DawoT"
fase: "5"
sprints: "14–16"
---

### FASE 5 — Hardening, Cumplimiento y Lanzamiento

> **Quality Gate referencia:** `Proceso §3 DoD` + `§8.1 RACI` — ver `docs/PROCESS.md` Anexo A (R/A/V) y `§4` Matriz. `SUITE GREEN` necesario pero no suficiente; requiere firma `A+V` independiente (sin `V` = `NO-GO`).

#### Sprint 14 — Pruebas de Carga, Caos (Red + Storage + Dispositivo) y Auditoría de Seguridad
**Agentes:** Staff QA/Chaos (owner), Staff Security (owner conjunto), Staff SRE (colaborador), Staff Frontend (colaborador)

**Entregables:** pruebas de carga a escala objetivo (comercios, sucursales, comprobantes/día); simulacro de caída de shard; suite de caos de almacenamiento local y perfil de gama baja; auditoría de seguridad (pentest interno o externo); escaneo de dependencias.

**Criterios de aceptación:** 0 vulnerabilidades críticas **o altas** abiertas; sistema sostiene el objetivo de tráfico contractual dentro del presupuesto Sub-50ms; recuperación ante caída de shard sin pérdida de datos verificada; suite de storage/dispositivo en verde según umbrales de la Sección 6. Un plan futuro nunca convierte una vulnerabilidad alta en mitigada.

**Quality Gate:** informe de auditoría con hallazgos cerrados, presentado y aprobado por Staff Principal.

---

#### Sprint 15 — Accesibilidad, Auditoría de Marca y Lanzamiento
**Agentes:** Staff Design (owner), Staff Content (colaborador), Staff PM (colaborador), Staff Principal (release manager)

**Entregables:** auditoría WCAG 2.1 AA completa sobre todas las pantallas críticas, checklist de coherencia de marca "Ledger Minimalism" en todos los touchpoints (POS, Modo Dueño, Modo Vitrina, landings), plan de rollback de lanzamiento ensayado, comunicación de lanzamiento.

**Criterios de aceptación:** 100% de pantallas críticas con contraste AA y targets táctiles ≥44×44px; 0 inconsistencias de marca detectadas en auditoría cruzada entre superficies; plan de rollback ensayado en staging con éxito.

**Quality Gate:** el **Staff Review Board completo** (un representante de cada rol con entregables en producción) firma la aprobación conjunta de Go/No-Go, con el changelog completo del proyecto (Sección 7) auditado sin entradas huérfanas. Una sola firma en contra bloquea el lanzamiento hasta resolver el hallazgo — **si el desacuerdo persiste tras el máximo de iteraciones del Anexo B §4, el Staff Principal ejecuta Desempate Arquitectónico documentado (ADR + changelog), nunca un deadlock indefinido**.

---

#### Sprint 16 (continuo, post-lanzamiento) — Estabilización y Mejora Continua
**Agentes:** rotativo, coordinado por Staff PM y Staff SRE

**Entregables:** postmortem de lanzamiento, primer informe real de las métricas de la Sección 9 (TTFS real, activación real, NRR real, K-factor real, P95 real), backlog de mejora priorizado por impacto medido.

**Criterios de aceptación:** informe de métricas de negocio e ingeniería entregado a los 30 días de operación real, con comparación explícita contra las metas declaradas en este roadmap y en el documento GTM.

**Quality Gate:** Staff PM + Staff SRE revisan el informe, el postmortem y el backlog priorizado; el sprint continuo no se considera cerrado sin decisión documentada.

---

