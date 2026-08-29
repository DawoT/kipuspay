---
doc_id: process
alias: Proceso
authority: normativa
owner: "@DawoT"
---

# Proceso — Escuadrón de Agentes de IA Nivel Staff
## Cómo se ejecuta KipusPay v8.0 (Motor Financiero Edge-Native SUNAT)

> **Premisa de este documento:** KipusPay no se construye con agentes que "generan código que funciona". Se construye con agentes que operan con el juicio, el estándar de evidencia y el nivel de responsabilidad de un **Staff Engineer / Staff Designer / Staff PM** humano — la persona a la que el resto del equipo recurre cuando algo tiene que estar bien, no solo terminado. Aquí viven roles, skills, workflows, testing, gobernanza y métricas; **qué** se construye y en qué orden está en el [roadmap por fases](ROADMAP.md), y las reglas de negocio en la [Arquitectura Técnica KipusPay v8.0](ARCHITECTURE.md).

---

## 0. Principios Rectores del Escuadrón de Agentes

1. **Ownership total, no "casi terminado".** Un agente que entrega un motor transaccional al 90% no ha entregado nada — en un sistema financiero, el 10% faltante es donde vive el descuadre de caja.
2. **Evidencia por encima de opinión.** Ninguna afirmación de calidad ("esto es seguro", "esto es rápido") se acepta sin un test, una métrica o una auditoría reproducible que la respalde.
3. **El cumplimiento SUNAT y la seguridad no son negociables por velocidad.** Ningún sprint puede "recortar camino" en el motor fiscal, en Zero-Trust o en la atomicidad ACID para llegar antes a una fecha.
4. **Documentar la decisión es parte del entregable.** Todo cambio de arquitectura relevante genera un ADR (Architecture Decision Record); un PR sin la razón de sus decisiones está incompleto.
5. **Cero jerga técnica cruzando la frontera del cliente.** Aplica al copy de marketing y también a cada mensaje de error del sistema — "Error 500" nunca lo ve un cajero.
6. **Revisión par obligatoria.** Ningún agente aprueba su propio trabajo crítico. Todo entregable de Fase 1-2 (dinero, impuestos, seguridad) requiere firma de un segundo agente Staff independiente.
7. **Reversibilidad primero.** Ningún cambio llega a producción sin un plan de rollback probado, no solo escrito.
8. **El estándar de referencia es explícito, no aspiracional.** Cuando este roadmap dice "nivel elite" se refiere a barras concretas: diseño de API y dashboards al nivel de Stripe, velocidad percibida al nivel de Linear, experiencia móvil al nivel de una app bancaria de primer mundo, seguridad al nivel OWASP ASVS L2, accesibilidad al nivel WCAG 2.1 AA.
9. **El registro de lo hecho es tan inmutable como el ledger financiero que KipusPay promete a sus clientes.** Ningún agente edita ni borra su propio historial de trabajo; toda corrección se agrega como una entrada nueva, nunca como una reescritura del pasado (Sección 7).
10. **Nada llega a producción sin haber sido sometido a fallar primero.** Todo entregable crítico se prueba bajo condiciones adversas — concurrencia, red hostil, límites de almacenamiento local, degradación de dispositivo de gama baja, carga, fallo de hardware — antes de considerarse listo, no después de un incidente real (Sección 6).
11. **Cobrar nunca se bloquea por límites artificiales de plan ni por desacuerdos de agentes.** El Plan Guard degrada features premium; jamás apaga la caja. Los deadlocks entre agentes se resuelven con desempate arquitectónico explícito (Anexo B), no con espera infinita.
12. **Extender por capability, no por vertical; DRY de dominio.** Un PR **no** introduce `switch(vertical)` / `if (vertical === …)` en sale, stock, fiscal o caja. Nuevas verticales GTM = bundles de capabilities (ADR-ARCH-002 / Arquitectura §1.1). Cada regla de negocio tiene un solo módulo dueño; Proceso y GTM citan Arquitectura, no la re-especifican.

---

## 1. Catálogo de Roles — Agentes de IA Nivel Staff

| Rol (Agente Staff) | Misión | Habilidades técnicas clave | Habilidades de juicio "Staff" | Entregables típicos |
|---|---|---|---|---|
| **Staff Principal — Arquitectura & Orquestación** | Coherencia end-to-end del sistema; preside el Staff Review Board | Edge computing, sharding distribuido, diseño de sistemas financieros | Trade-offs cross-equipo, veto técnico razonado, redacción de ADRs | ADRs, mapa de arquitectura vivo, aprobación final de cada Quality Gate |
| **Staff Backend — Datos & Esquema (D1/SQLite)** | Integridad y escalabilidad del modelo de datos | DDL relacional, sharding dinámico, migraciones versionadas, índices | Modelar para el peor caso (concurrencia, fraude, deletion), no solo el caso feliz | DDL, plan de sharding tenant→shard, migraciones up/down probadas |
| **Staff Backend — Motor Transaccional ACID** | Garantía financiera: cero pérdida, cero duplicación | `db.batch([...])` atómico, guards SQL, control de concurrencia, idempotencia | Diseñar asumiendo que la red y el hardware fallarán, no que "probablemente" funcionen | `processOfflineSaleAtomic`, reconciliador idempotente |
| **Staff Security — Zero-Trust & Criptografía** | Ningún dato sensible confía en el cliente ni en una firma sin verificar | WebCrypto, verificación HMAC de webhooks, Durable Objects, control de acceso | Pensar como atacante antes que como implementador | Middleware de auth/tenant, verificación de firma Stripe, guardas anti-replay |
| **Staff Fiscal — Dominio Tributario SUNAT** | Cumplimiento normativo sin ambigüedad; formalización progresiva | UBL 2.1, XMLDSIG, IGV/ICBPER, NV comercial, máquinas de estado CPE/NV | Traducir normativa cambiante en reglas de sistema verificables; distinguir control interno de CPE | Generador XML, firmante, resolutor de series, guard régimen×modo, panel DLQ, ADR-FISCAL-001 |
| **Staff Frontend — POS Offline-First** | La venta nunca se detiene, con o sin internet | SvelteKit, IndexedDB, Service Workers, UI optimista | Diseñar para el cajero apurado en hora punta, no para el desarrollador en su laptop | Motor offline-first, chunked sync dispatcher, feature-gated views |
| **Staff Hardware & Integraciones** | El punto de venta físico nunca falla | ESC/POS, WebSockets locales, impresión adaptativa, periféricos | Diagnosticar fallos de hardware heterogéneo sin acceso físico | `LanWssPrinterStrategy`, Modo Vitrina, kiosko de autoatención |
| **Staff Mobile/Producto — "Modo Dueño"** | El dueño confía en su negocio sin estar en él | Apps mobile-first, push accionable, modo oscuro real | Diseñar para momentos sueltos del día, no para sesiones largas de escritorio | App Modo Dueño, alertas accionables, resumen del día |
| **Staff SRE / Platform Engineering** | El sistema se observa a sí mismo antes de que el cliente note algo | Cloudflare Workers, Queues, Durable Objects, Analytics Engine, alerting | Definir presupuestos de error (SLO) y defenderlos ante presión de negocio | Dashboards de P95/latencia, runbooks, agregador de analítica |
| **Staff QA & Chaos Engineering** | Nada llega a producción sin haber fallado primero en un entorno controlado | Testing de concurrencia, inyección de fallos, pruebas de carga, fuzzing, cuota IndexedDB, estrés en dispositivos de gama baja | Diseñar el escenario que rompe el sistema antes de que lo encuentre un cliente real | Suites de caos (red + storage + dispositivo), reportes de resiliencia adversarial |
| **Staff Product Design — "Ledger Minimalism"** | La marca se siente premium en cada pixel, no solo en el pitch | Design tokens, tipografía tabular, micro-interacciones, accesibilidad | Defender la coherencia de marca incluso contra la conveniencia de ingeniería | Sistema de diseño, checklist de UX premium, auditoría de contraste AA |
| **Staff Growth / GTM Engineer** | Cada visitante entiende la propuesta de valor en menos de 90 segundos | Landing pages por vertical, SEO técnico, Core Web Vitals, PLG | Traducir arquitectura compleja en un dolor de negocio de una frase | Home + landings verticales, páginas `/comparar/[competidor]`, `/precios` |
| **Staff Content / Technical Writer** | Ninguna palabra de cara al cliente suena a manual técnico | Copywriting de conversión, documentación técnica, guiones de venta | Calibrar el mismo hecho técnico para tres audiencias distintas (cajero, dueño, comité) | Copy de landing, FAQ, guion de objeciones, ADRs narrados |
| **Staff Data / Analytics Engineer** | El negocio se dirige con métricas reales, no con intuición | Instrumentación de eventos, dashboards de negocio, atribución | Elegir la métrica que realmente predice el resultado, no la que es fácil de medir | Dashboard de TTFS, activación, NRR, K-factor |
| **Staff Product Manager (Agente Orquestador de Negocio)** | El roadmap técnico y el roadmap comercial nunca divergen | Priorización basada en impacto, descomposición de épicas | Decir "no" a features que no mueven una métrica de negocio real | Backlog priorizado, criterios de aceptación de negocio por sprint |
| **Staff User Stories — Trazabilidad Gherkin** | Traducir capabilities/sprints a historias de uso REAL (cajero/dueño/contador) con criterios Gherkin trazables al spec | Gherkin, INDEX→capability→§, GTM §9, `INDEX.md` + `docs/architecture/01-principles.md` | Calibrar la misma regla para 3 audiencias sin re-escribirla | Historias `*.md` en `.opencode/stories/` con `capability→fase→§→test_ids` |

> Agente ejecutable: `kipus-stories` — trazabilidad vía `Proceso §6` y `docs/architecture/01-principles.md §1.1` (ver `.opencode/agents/kipus-stories.md`).

---

## 2. Matriz de Skills — Taxonomía y Nivel Mínimo Staff

Esta matriz complementa el catálogo de roles: define, por cada skill crítica, cuál es la barra mínima aceptable para llamarla "nivel Staff" y cómo se valida objetivamente — para que "premium elite" no sea un adjetivo, sino un criterio verificable.

| Categoría | Skill | Roles que la requieren | Nivel mínimo esperado (bar Staff) | Cómo se valida |
|---|---|---|---|---|
| Arquitectura | Diseño de sistemas Edge/distribuidos | Staff Principal, Staff Backend Datos, Staff SRE | Justifica cada decisión de sharding/latencia con un trade-off explícito, no una preferencia | ADR revisado por pares + benchmark reproducible |
| Arquitectura | DRY de dominio y modularidad | Staff Principal, Staff Backend ACID/Datos, Staff Frontend | Una regla de negocio vive en un solo package; cero copia del sale engine entre workers/UI | Review de boundaries + grep anti-duplicación en PR |
| Arquitectura | Ports & adapters (hexagonal) | Staff Principal, Staff Backend ACID, Staff Fiscal, Staff Hardware | Dominio testable sin D1/Hono/Svelte; adapters solo en bordes | Tests de `domain-*` sin mocks de infra de producción |
| Arquitectura | Policy objects / Open-Closed | Staff Backend ACID, Staff Security, Staff Fiscal | Extiende FEFO/BOM/authz como policies, no como `switch(vertical)` | Checklist ADR-ARCH-002 en PR |
| Arquitectura | Presupuesto de bundle / offloading zero-dep | Staff Frontend, Staff Hardware, Staff Principal | Cero npm runtime para PDF/QR/print sin ADR; Worker no congela UI | CI bundle gate + ADR si se propone dep |
| Arquitectura | Circuit breaking distribuido (DO) | Staff SRE, Staff Fiscal | Contador en Durable Object; KV solo cache; taxonomía 4xx vs 5xx | Chaos: 5xx abren breaker; 4xx no |
| Arquitectura | Modelado de datos financieros | Staff Backend Datos, Staff Backend ACID, Staff Fiscal | Diseña para el peor caso de concurrencia y auditoría, no solo el camino feliz | Test de concurrencia + revisión de esquema |
| Seguridad | Criptografía aplicada (WebCrypto, HMAC, firma XML) | Staff Security, Staff Fiscal | Implementa y también intenta romper su propia implementación antes de entregarla | Fuzz testing + revisión par de Staff Security |
| Seguridad | Modelado de amenazas Zero-Trust | Staff Security, Staff SRE | Piensa como atacante en cada endpoint antes de escribir el primer test | Checklist OWASP ASVS firmado |
| Datos / Transacciones | Transacciones ACID y control de concurrencia | Staff Backend ACID, Staff Backend Datos | Explica por qué el rollback es correcto, no solo que "los tests pasan" | Suite de chaos testing reproducible |
| Datos / Transacciones | Idempotencia y reconciliación distribuida | Staff Backend ACID, Staff SRE | Diseña asumiendo reintentos duplicados como la norma, no la excepción | Test de reintento duplicado |
| Fiscal | Normativa SUNAT y estándar UBL 2.1 | Staff Fiscal | Traduce un cambio normativo en una regla de sistema verificable en menos de un sprint | Validación contra XSD + revisión de Staff Principal |
| Fiscal | Máquinas de estado de documentos tributarios y comerciales | Staff Fiscal, Staff Backend ACID | Ninguna transición CPE inválida; NV solo `NOT_APPLICABLE`; matriz régimen×modo enforceable | Test exhaustivo de transiciones + tests de rechazo 422 |
| Frontend | Ingeniería offline-first (IndexedDB, Service Workers) | Staff Frontend | El sistema se comporta igual con red perfecta, red hostil o cuota de almacenamiento agotada — alerta al cajero antes de corromper la cola | Test de red adversarial + inyección `QuotaExceededError` |
| Frontend | UI optimista y percepción de velocidad | Staff Frontend, Staff Design | Feedback <100ms es el piso, no la meta | Medición RUM en staging |
| Hardware | Protocolos de impresión y periféricos (ESC/POS, WSS) | Staff Hardware | Diagnostica fallos de hardware heterogéneo sin acceso físico al dispositivo | Prueba en ≥2 modelos físicos/simulados |
| Diseño | Sistemas de diseño y accesibilidad | Staff Design | Defiende la coherencia de marca incluso contra la conveniencia de ingeniería | Auditoría WCAG 2.1 AA |
| Testing | Chaos engineering e inyección de fallos | Staff QA/Chaos | Diseña el escenario que rompe el sistema antes que un cliente real lo encuentre — incluye red, storage local y hardware de gama baja | Suite de caos documentada y repetible (red + quota + device) |
| Testing | Observabilidad y definición de SLO | Staff SRE | Defiende el error budget incluso bajo presión de negocio | Dashboard con alerting activo |
| Growth | Copywriting de conversión sin jerga técnica | Staff Content, Staff Growth | Un dueño de negocio sin tiempo entiende la propuesta en menos de 90 segundos | Auditoría de copy + test de comprensión |
| Growth | Instrumentación de métricas de producto | Staff Data/Analytics | Elige la métrica que predice el resultado, no la que es fácil de medir | Dashboard sin gaps de atribución |
| Gestión | Priorización basada en impacto medido | Staff PM | Puede decir "no" a una feature con una razón cuantificada | Backlog trazable a una métrica de negocio |

---

## 3. Definición de Terminado (DoD) Global — Estándar Elite

Ningún sprint se cierra si el entregable no cumple **todo** lo siguiente (además del Quality Gate específico del sprint):

- [ ] **Código y arquitectura:** revisado por un segundo agente Staff independiente del autor; decisiones no triviales documentadas en ADR.
- [ ] **DRY / capabilities (Arquitectura §1.1, ADR-ARCH-002):** la regla nueva vive en un solo package `domain-*` (o módulo equivalente); tests de dominio sin D1/Hono; **cero** `switch(vertical)` / `if (vertical === …)` en hot path; feature gated por `tenant_capabilities`, no por enum de marketing.
- [ ] **Bundle / zero-dependency (Principio 11, §7.5):** presupuesto de bundle del POS medido en CI; **cero** dependencia npm de runtime nueva para PDF/QR/impresión sin ADR; print fuera de la tx ACID.
- [ ] **Seguridad:** cero secretos hardcoded, cero vulnerabilidades críticas/altas sin mitigar, todo endpoint sensible probado con casos de autorización negativa.
- [ ] **Datos y transacciones (donde aplique):** probado bajo escritura concurrente y bajo fallo inyectado a mitad de operación; rollback verificado, no solo implementado.
- [ ] **Rendimiento:** medido contra el SLO de la capa correspondiente: hot path de cobro Sub-50ms; canales premium/SSE usan su SLO explícito (por ejemplo P95 <2s); regresiones documentadas y justificadas si existen.
- [ ] **Accesibilidad y UX:** contraste mínimo AA, targets táctiles ≥44×44px en pantallas de cobro, feedback visual optimista <100ms en flujos críticos, cero spinners sin contexto (estándares GTM §6.5).
- [ ] **Copy de cara al cliente:** sin jerga técnica — pasa la prueba de "¿lo diría el dueño con su contador?" (GTM §1.1).
- [ ] **Testing multi-capa:** cubierto por los tipos de test obligatorios de su capa (Sección 6), con evidencia de ejecución adjunta.
- [ ] **TDD RED → GREEN verificable:** para cada capability de los sprints 1–59, FL y C (todo sprint con entregable en `packages/*`/`apps/*`), el changelog incluye `ticket_or_adr`, `test_ids`, `red_commit_sha`, `red_run_id`, `expected_failure`, `green_commit_sha`, `green_run_id` y `ancestry_verified: true`. El run RED debe fallar por la aserción esperada, no por infraestructura; el commit RED debe ser ancestro del commit GREEN y del merge. CI conserva ambos logs y bloquea el merge si falta un campo, si el fallo no coincide con la aserción esperada o si el commit RED no precede a la implementación.
- [ ] **Documentación:** runbook o guía de uso interno actualizado; si el entregable cambia el comportamiento del sistema, la documentación de arquitectura se actualiza en el mismo sprint, no "después".
- [ ] **Observabilidad:** métricas y alertas configuradas antes de considerar el entregable "en producción", no añadidas reactivamente tras un incidente.
- [ ] **Plan de rollback:** existe, está escrito y fue ensayado al menos una vez en staging.
- [ ] **Changelog:** entrada registrada en el Changelog Obligatorio (Sección 7) con evidencia adjunta — sin entrada, el entregable no se considera cerrado.

---

## 4. Matriz de Calidad por Tipo de Entregable

| Tipo de entregable | Criterio de calidad | Umbral de aceptación | Método de validación | Firma de aprobación |
|---|---|---|---|---|
| Esquema / DDL | Integridad referencial, soft deletes, unicidad por tenant | 0 FKs huérfanas; índices únicos parciales verificados | Test de migración automatizado (up/down) | Staff Backend Datos + Staff Principal |
| Motor transaccional ACID | Cero condiciones de carrera, rollback real | 0 escrituras parciales bajo prueba de concurrencia inyectada | Suite de chaos testing con fallos simulados | Staff QA/Chaos + Staff Principal |
| Middleware de seguridad / auth | Zero-Trust real, no solo declarado | 100% de rutas sensibles con test de autorización negativa | Pentest ligero interno + escaneo automatizado | Staff Security + Staff SRE |
| Motor fiscal SUNAT | XML válido; Resumen Diario; plazos 3d/7d; PSE; guards RUC/700; NC+CDR; motor dual CPE+NV | 100% XML factura; RC boletas OK; 0 boletas ≥700 sin doc; 0 facturas sin RUC; 0 NC sin `ACCEPTED`, **salvo E-A: anulación total de CPE no aceptado con `CREDIT_NOTE_NO_CDR` auditable**; NV solo `NOT_APPLICABLE`+leyenda | XSD + matriz régimen×modo + ADR-FISCAL-001 v2 + tests de plazo | Staff Fiscal + Staff Security |
| UI / Frontend POS | Velocidad percibida, resiliencia offline y de dispositivo | Feedback <100ms en 95% de interacciones (RUM); 0 pérdida/corrupción de cola tras interrupción de red, `QuotaExceededError` o presión de memoria | Test de red adversarial + inyección de cuota IndexedDB + stress en perfil de tablet Android de gama baja | Staff Frontend + Staff Design + Staff QA/Chaos |
| App móvil "Modo Dueño" | Paridad con apps de referencia (banca digital) | Alertas push con entrega ≥99%; 0 fugas de memoria en sesión prolongada | Test de estrés de sesión + revisión de diseño | Staff Mobile + Staff Design |
| Landing / activo GTM | Claridad de propuesta de valor, cero jerga técnica | 0 términos técnicos (Edge, D1, ACID, sharding) en copy de cliente; Core Web Vitals en verde | Auditoría de copy + Lighthouse/CWV | Staff Content + Staff Growth |
| Documentación / ADR | Decisión trazable y justificada | Toda decisión de arquitectura no trivial tiene ADR con alternativas consideradas | Revisión de Staff Principal | Staff Principal |
| Módulo de capability / package dominio | Open-Closed + DRY; sin ramificar por vertical | 0 `switch(vertical)` en core; capability flag + tests de dominio sin infra | Checklist §1.1 + ADR-ARCH-002 | Staff Principal + owner del dominio |
| Runbook operacional | Accionable bajo presión, no solo descriptivo | Ensayado en un simulacro (game day) antes de aceptarse | Simulacro de incidente | Staff SRE |

---

## 5. Workflows de Desarrollo — Del Commit a Producción

### 5.1 Estrategia de Ramas y Cambios

- **Trunk-based con feature flags.** No hay ramas de larga vida: cada tarea de agente vive en una rama corta (`sprint-N/rol/tarea`), con PR obligatorio hacia `main` — nunca commits directos.
- **Todo cambio al motor fiscal o al motor ACID nace detrás de un feature flag**, de forma que pueda desactivarse instantáneamente sin requerir un rollback de código ni un deploy de emergencia.
- **Congelamiento de cambios ("freeze"):** periodos declarados (cierre de mes fiscal, campañas comerciales de alto tráfico) donde solo se aceptan hotfixes críticos, aprobados directamente por Staff Principal + el owner de dominio afectado.

### 5.2 Pipeline CI/CD — Etapas Obligatorias (en orden, cada una bloquea la siguiente)

**Estado del pipeline (post Sprint 0 / ADR-0001).** Las **Etapas 0–5 están activas** en CI.
Las Etapas 6–11 permanecen post-staging (no hay topología de shards de staging aún):
ningún agente debe asumir deploy a staging/canario/producción hasta que existan esos
ambientes. Catálogo de checks documentales: `AGENTS.md` §5 (V-00..V-24). Toolchain de
implementación: `Arquitectura §13` y `Proceso §8.3`.

| Etapa | Qué hace | Dónde corre | Estado |
|---|---|---|---|
| 0 | Gate documental `scripts/verify.sh` (V-00..V-24) | `pre-commit` + `verify.yml` | **Activa** |
| 1 | Lint & análisis estático (ESLint invariantes, Prettier, `tsc` estricto) | `quality.yml` | **Activa** |
| 2 | Unit tests + umbrales de cobertura (CAL-03/CAL-05) | `quality.yml` | **Activa** |
| 3 | Integration tests (D1 real vía pool-workers, migraciones) | `quality.yml` | **Activa** |
| 4 | Escaneo de seguridad (Gitleaks, Semgrep, CodeQL, Dependabot) | `security.yml` + `codeql.yml` | **Activa** |
| 5 | Build + presupuesto de bundle POS (CAL-06 / V-24) | `quality.yml` | **Activa** |
| 6 | Deploy a Staging — réplica de shards en miniatura | — | Post-staging |
| 7 | Suite E2E + Chaos en Staging (red, cuota, memoria, shard/DO) | — | Post-staging (chaos: §13.5, activo desde Sprint 4/6) |
| 8 | Staff Review Board — quórum según Sección 4 | Proceso humano | **Activa** (cada gate de sprint) |
| 9 | Deploy Canario a Producción | — | Post-staging |
| 10 | Ventana de observación de canario vs SLO §9.1 | — | Post-staging |
| 11 | Rollout completo o rollback automático | — | Post-staging |

Orden local de las Etapas 1–5: `scripts/quality.sh`. Un `SUITE GREEN` documental es
necesario pero no suficiente: el Quality Gate de cada sprint exige evidencia runtime
y firma RACI `A` + `V` (§8.1).

### 5.3 Ambientes

`Local/Dev (agente individual)` → `Staging (réplica de shards)` → `Canario (tenants internos/beta)` → `Producción completa`. Ningún entregable salta una etapa, incluso si "parece" listo.

---

## 6. Estrategia de Testing — Garantía de Cero Incidentes en Producción

La pirámide de testing de KipusPay no es genérica: cada capa del sistema tiene un tipo de prueba que existe específicamente porque esa capa puede costarle dinero real, un comprobante rechazado o una venta perdida a un comerciante.

| Capa / Componente | Tipos de test obligatorios | Umbral mínimo | Frecuencia | ¿Bloquea el release? |
|---|---|---|---|---|
| Motor transaccional ACID | Unit + concurrencia + chaos (fallo inyectado a mitad de operación) | Cobertura ≥95%; 0 escrituras parciales bajo caos | Cada PR + nightly chaos run | Sí |
| Esquema / migraciones D1 | Integration (up/down) + integridad referencial | 0 FKs huérfanas; migración reversible sin pérdida de datos | Cada PR | Sí |
| Motor fiscal SUNAT | XSD UBL + firma + RC Resumen Diario + plazos + guards 700/RUC + NC/ND + NV_RETURN | 100% XML factura; RC ≤7d; factura ≤3d o alerta/DLQ; 0 tipos ilegales | Cada PR + regresión semanal + cron RC en staging | Sí |
| Middleware Auth/Zero-Trust | Autorización negativa + fuzzing + escaneo SAST/dependencias | 100% de rutas sensibles cubiertas | Cada PR + pentest ligero mensual | Sí |
| Sync offline / red adversarial | Chaos de red (packet loss, latencia alta, fragmentación) | 0 pérdida/duplicación en 500 ciclos de prueba | Nightly | Sí |
| Storage local / dispositivo (IndexedDB) | Inyección de `QuotaExceededError`, saturación de cola offline, presión de memoria/CPU en perfil Android de gama baja | 0 corrupción de cola de ventas; alerta visible al cajero antes del umbral crítico (≥80% cuota); cobro degradado de forma segura (no silent fail) | Nightly + cada release de Sprint 6/14 | Sí |
| Frontend POS / UX | E2E + RUM de percepción de velocidad + visual regression del design system | Feedback <100ms en 95% de interacciones | Cada PR + monitoreo continuo en producción | Sí (E2E); alerta (RUM) |
| App móvil "Modo Dueño" | E2E + test de estrés de sesión prolongada + entrega de push | Entrega de push ≥99%; 0 fugas de memoria | Cada release | Sí |
| Accesibilidad | axe-core automatizado + auditoría manual AA en pantallas críticas | Contraste AA; targets ≥44×44px | Cada release + auditoría trimestral completa | Sí |
| Carga / performance | Load testing contra objetivo de tráfico declarado | P95 dentro del presupuesto Sub-50ms Edge | Antes de cada Fase de lanzamiento | Sí |
| Landing / GTM | Auditoría de copy + Core Web Vitals + Lighthouse | 0 jerga técnica; CWV en verde | Cada publicación | Sí |

**Monitoreo sintético en producción (no negociable):** además de las pruebas pre-release, un conjunto de *transacciones canario* corre continuamente contra tenants de control en producción (nunca contra tenants reales), verificando extremo a extremo el ciclo venta → comprobante → firma → estado ACCEPTED. Cualquier desviación dispara alerta inmediata a Staff SRE, sin esperar a que un comerciante real lo reporte — la garantía de "cada sol cuadra, siempre" se verifica sola, cada pocos minutos, no solo el día del lanzamiento.

---

## 7. Changelog Obligatorio — Registro Inmutable de Iteraciones de Agentes

KipusPay le promete a sus comerciantes un ledger financiero donde nada se sobrescribe y todo se reconcilia (Principio 8 y 9 de la arquitectura). El mismo estándar de integridad se aplica al registro de trabajo de los agentes: **el historial de lo que cada agente hizo es, en sí mismo, un ledger — append-only, nunca editado, nunca borrado.**

### 7.1 Reglas de Inmutabilidad

- Ninguna entrada de changelog se edita ni se elimina jamás, sin excepción.
- Si una entrega estaba mal, incompleta o debe revertirse, se registra una **entrada nueva** de tipo `Corrección` o `Rollback` que referencia explícitamente el ID de la entrada original — de la misma forma en que una Nota de Crédito corrige una Factura sin borrarla.
- El changelog es un entregable obligatorio de cada sprint y forma parte del DoD Global (Sección 3): **sin entrada registrada, el entregable no se considera cerrado**, sin importar cuánta evidencia técnica exista en otro lugar.

### 7.2 Esquema Obligatorio de Cada Entrada

| Campo | Descripción |
|---|---|
| `id` | Identificador incremental e inmutable (nunca se reutiliza) |
| `timestamp_utc` | Fecha y hora exacta del registro |
| `sprint_fase` | Sprint y fase a la que pertenece (ej. "Sprint 4 — Fase 1") |
| `agente_responsable` | Rol Staff que ejecutó el trabajo (ej. "Staff Backend ACID") |
| `tipo` | `Entregable nuevo` / `Corrección` / `Excepción (ADR)` / `Incidente` / `Rollback` |
| `entregable_afectado` | Componente o módulo referenciado (ej. `processOfflineSaleAtomic`) |
| `descripcion` | Qué cambió y por qué — en lenguaje verificable, no en adjetivos |
| `evidencia` | Referencia al test, benchmark o auditoría que respalda el cumplimiento del DoD |
| `aprobador` | Segundo agente Staff que firmó la revisión par |
| `estado` | `Vigente` / `Corregido por entrada #N` / `Revertido por entrada #N` |

### 7.2.1 Contrato append-only y tipos canónicos

Desde `schema_version: 2`, cada entrada agrega `prev_id`, `prev_hash`, `entry_hash`,
`ticket_or_adr`, `test_ids`, `red_commit_sha`, `red_run_id`, `green_commit_sha`,
`green_run_id`, `ancestry_verified`, `relacion`, `referencias_entradas`,
`referencias_documentales`, `subtipo`, `aprobaciones` y `estado_gov`.

`tipo` solo admite: `Entregable nuevo`, `Corrección`, `Excepción (ADR)`, `Incidente` y
`Rollback`. Los calificadores van en `subtipo`; una `Corrección` o `Rollback` exige
`referencias_entradas`. Una `Excepción (ADR)` exige `adr_id`, riesgo, expiración y plan.

CI debe verificar que las entradas históricas no cambien, que la nueva entrada tenga
`prev_id` igual al último ID y que `entry_hash = SHA-256(canonical_entry_without_hash)`.
Los tipos históricos extendidos se interpretan como el tipo canónico más el subtipo,
sin editar el ledger; una entrada de normalización registra la equivalencia.

Una aprobación no es independiente si el aprobador fue autor, responsable, autor del
ADR o ejecutor de la evidencia principal. Dinero, impuestos, seguridad, datos
financieros y rollback requieren owner de dominio + Staff Principal + verificador
independiente. `Pendiente` nunca equivale a aprobación.

### 7.3 Ejemplo de Entrada

```text
id: EXAMPLE-0142
timestamp_utc: 2026-08-14T19:02:11Z
sprint_fase: Sprint 4 — Fase 1 (Núcleo Transaccional)
agente_responsable: Staff Backend ACID
tipo: Entregable nuevo
entregable_afectado: processOfflineSaleAtomic
descripcion: >
  Implementado plan atómico D1 (db.batch([...]) con guards SQL) para venta
  offline con reserva de stock. Cubre escritura concurrente sobre
  el mismo SKU desde dos cajas de la misma sucursal.
evidencia: suite-chaos-run-2026-08-14 (0 escrituras parciales / 500 corridas)
aprobador: Staff QA/Chaos
estado: Vigente
```

#### 7.3.1 Registro — Changelog inmutable (movido a `docs/LEDGER.md`)

Las entradas append-only **0143–0177** viven en [`LEDGER.md`](LEDGER.md) — registro
inmutable verificado por CI (schema v2: `prev_id`/`prev_hash`/`entry_hash`). Este
archivo de proceso no carga el historial completo para no degradar el contexto de
los agentes de build. Reglas de escritura: contrato en §7.2.1 y el skill
`kipus-changelog` (`.opencode/skills/`).

### 7.4 Integración con el Staff Review Board

El changelog del sprint se revisa como parte obligatoria de la Sprint Review (Sección 8): el board no aprueba un cierre de sprint si existen entregables sin entrada, o entradas sin evidencia adjunta. Un patrón de entradas tipo `Corrección` recurrentes sobre el mismo componente es, por diseño, una señal automática de que ese componente necesita revisión de arquitectura, no solo otro parche.

---

## 8. Gobernanza y Ceremonias

| Ceremonia humana clásica | Equivalente en el escuadrón de agentes |
|---|---|
| Sprint Planning | Staff PM genera el *brief* del sprint con criterios de aceptación de negocio; cada agente Staff dueño confirma Definition of Ready antes de aceptar la épica |
| Daily Standup | Bitácora de estado por agente: qué se completó, qué está bloqueado, qué evidencia de calidad se generó (alimenta el Changelog, Sección 7) |
| Sprint Review | **Staff Review Board**: todos los owners de rol relevantes al sprint revisan el entregable contra la Matriz de Calidad (Sección 4) y el Changelog del sprint (Sección 7) — no hay merge a producción sin este quórum |
| Retro | Postmortem escrito por sprint: qué criterio de calidad casi se saltó y por qué, para ajustar el DoD si hace falta |

**Definition of Ready (antes de iniciar un sprint):** la épica tiene un owner de rol claro, criterios de aceptación medibles definidos, dependencias de sprints previos cerradas (no "en progreso"), y el Staff Principal confirmó que no bloquea ni contradice un ADR existente.

### 8.1 RACI vinculante y dependencias

El RACI del Anexo A es vinculante para cada Quality Gate: `R` ejecuta, `A` decide
el cierre, `V` verifica de forma independiente, `C` es consultado e `I` es
informado. `C` e `I` nunca cuentan como aprobación. Cada gate debe registrar
`gate_id`, `raci_ref`, `R`, `A`, `V`, evidencia, decisión y fecha; sin `A` o `V`
independiente el resultado es `NO-GO`.

Una referencia a un sprint futuro nunca puede ser una dependencia de cierre. Si un
entregable necesita una capability futura, el gate se divide en una parte cerrable
con el contrato vigente y una parte bloqueada por `dependency_adr`; no se acepta
"en progreso" como evidencia. Esta regla corrige las referencias cruzadas de
Sprints 6/8/17/24/34/43/45.

El sprint continuo post-lanzamiento también tiene gate: Staff PM + Staff SRE deben
aprobar el informe, el postmortem y el backlog antes de marcarlo cerrado.

### 8.2 Estado GOV

El estado de gobernanza es `GOV-APROBADO` (milestone de especificación). La entrada
0176 (`relacion: CORRIGE`, `referencias_entradas: [0173]`) subsana el bloqueo que
registró la auditoría 0173 y eleva la especificación a nivel Staff con informe de
hallazgos, PERT de FASE 6G/8, matriz de trazabilidad, riesgos, RACI-gate y valores
SLO, cerrado con la verificación documental (fences pares, 0 `UPSERT INTO`, D1 API
validada, `prev_hash`/`entry_hash` reales).

Alcance del `GOV-APROBADO`: habilita el inicio del **Sprint 0** y la planificación de
los sprints de implementación, y permite cerrar los **gates de especificación**. No
sustituye a los **Quality Gates de implementación** (§8.1): cada sprint de código
cierra su gate con evidencia runtime (tests RED→GREEN, migración D1, benchmarks) y
firma RACI de `A` + `V` independiente; sin esa evidencia el resultado del gate es
`NO-GO`. La entrada 0173 quedó subsanada por 0176; 0174/0175 registraron la
remediación técnica y la normalización del legado. Estados válidos:
`GOV-BLOQUEADO`, `GOV-EN_REMEDIACION`, `GOV-APROBADO`, `GOV-CERRADO` y
`GOV-RECHAZADO`.

### 8.3 Quality Gates de implementación — herramienta (CAL-01..08)

El estándar de calidad de código vive **una sola vez** en la especificación
(`Arquitectura §13`, Registry CAL-01..08) y en el gate documental (`AGENTS §5`,
checks V-20..V-24). Este capítulo solo referencia: los Quality Gates de
implementación se ejecutan con la herramienta del monorepo, nunca se re-escriben
aquí.

- **Puerta de entrada por PR:** los workflows de CI (`verify.yml` para el gate
  documental V-00..V-24, `quality.yml` para lint/typecheck/tests/build/bundle,
  `security.yml` para Gitleaks y Semgrep, `codeql.yml`) son condición **necesaria**.
  Un `SUITE GREEN` documental no es suficiente: el gate de cada sprint exige además
  la evidencia runtime de `Proceso §8.1`.
- **Evidencia TDD:** toda entrada de código del ledger declara `test_ids`,
  `red_run_id`/`green_run_id` y commits RED/GREEN reales; V-20 verifica que cada
  `test_id` resuelva en un test del monorepo y que el contrato esté completo
  (`Arquitectura §13.9`).
- **Umbrales exigidos (CAL-05):** cobertura de dominio ≥95% y adaptadores/apps ≥70%
  por línea/rama/función; el fallo de umbral rompe `test:unit` en CI.
- **Cierre de sprint:** verificado por `scripts/quality.sh` local o los workflows
  de CI, con firma RACI de `A` + `V` independiente como exige §8.1. Sin esa firma,
  el gate es `NO-GO`.

---

## 9. Métricas Bajo Vigilancia Continua

Estas métricas no pertenecen a un sprint específico: se instrumentan desde que existe el componente que las genera y se revisan cada sprint por el rol correspondiente.

**Negocio (owner: Staff Data / Analytics, definidas en GTM §9):**
- Time-to-first-sale (TTFS) — meta declarada: bajo 5 minutos para el 80% de los registros (NV o boleta según etapa).
- Tasa de activación de prueba a pago (post 30 días de prueba real).
- Net Revenue Retention por upgrade de plan (Arranque → Crece → Cadena) — disparadores: 2ª caja, 2ª sucursal, Modo Dueño; **nunca** límite de comprobantes.
- Tasa de upgrade de formalización (INTERNAL_CONTROL → FORMALIZING / ELECTRONIC_ISSUER) — meta instrumentada desde Sprint 11.
- Coeficiente de referidos (K-factor) del loop "Negocio Recomienda Negocio".

**Ingeniería (owner: Staff SRE):**
- Latencia P95 vs. presupuesto Sub-50ms Edge (Principio 1 de la arquitectura).
- Error budget / disponibilidad por tenant y por shard.
- Tasa de fuga de defectos (bugs encontrados en producción vs. en QA/Chaos).
- Tiempo de remediación de vulnerabilidades críticas/altas (SLA interno).
- Tasa de éxito de reconciliación offline→online sin intervención manual.
- Resultado de las transacciones canario sintéticas en producción (Sección 6).

**Salud del proceso (owner: Staff Principal):**
- % de entregables cerrados con entrada de changelog completa (meta: 100%).
- Frecuencia de entradas tipo `Corrección` por componente (señal temprana de deuda técnica).

### 9.1 SLO y umbrales de release

| Señal | Umbral | Acción |
|---|---:|---|
| Integridad financiera | 100%; cero escrituras parciales o duplicadas | Un caso activa rollback y bloquea el gate. |
| Latencia hot path | P95 < 50 ms en ventana móvil de 5 min | Superar 10 min bloquea rollout. SSE premium usa SLO separado P95 <2 s. |
| Disponibilidad crítica | ≥99,9% mensual; error rate <1%/5 min | Rollback si cruza el umbral durante dos ventanas. |
| Transacciones canario | ≥99,9% en ventana móvil de 15 min | Dos fallos consecutivos activan rollback. |
| Plazo fiscal | 100% antes de `must_submit_by` | Sin evidencia completa: NO-GO. |
| Lecturas al DO breaker | `X = 10 lecturas/s por DO`, ventana de 60 s | Dos ventanas sobre X bloquean rollout. |

La observación canario dura al menos 30 minutos y 500 transacciones críticas. El
rollback desactiva el feature flag, despliega el artefacto anterior inmutable,
detiene el rollout y registra una entrada `Rollback`; no ejecuta migraciones
destructivas. Se considera exitoso tras 10 minutos dentro de SLO y diez
transacciones canario consecutivas correctas.

---

## Anexo A — RACI Resumido por Fase

| Fase | Responsable (R) | Aprueba (A) | Verifica (V) | Consultado (C) | Informado (I) |
|---|---|---|---|---|---|
| Fase 1 — Núcleo Transaccional | Staff Backend Datos/ACID, Staff Security, Staff Fiscal | Staff Principal | Staff QA/Chaos | Staff QA/Chaos, Staff SRE | Staff PM |
| Fase 2 — Cumplimiento y Resiliencia | Staff Fiscal, Staff Frontend | Staff Principal, Staff Security | Staff Security | Staff QA/Chaos | Staff PM, Staff Growth |
| Fase 3 — Producto Premium | Staff Frontend, Staff Hardware, Staff Mobile, Staff SRE | Staff Design | Staff QA/Chaos + Staff Principal | Staff QA/Chaos | Staff PM |
| Fase 4 — Salida al Mercado | Staff Growth, Staff Content | Staff PM | Staff Design + Staff Security | Staff Design, Staff Security | Staff Principal |
| Fase 5 — Hardening y Lanzamiento | Staff QA/Chaos, Staff Security, Staff Design | **Staff Review Board (quórum completo)** | Staff Principal (rotativo) | Todos los roles | Toda la organización |
| Fase 6 — Operación Comercial v8.1 | Staff Backend ACID/Datos, Staff Frontend, Staff Mobile | Staff Principal | Staff QA/Chaos | Staff QA/Chaos, Staff Security, Staff Design | Staff PM, Staff Growth |
| Fase 7 — Ecosistema Perú v9 | Staff Backend ACID/Datos, Staff Security, Staff SRE | Staff Principal | Staff QA/Chaos | Staff QA/Chaos, Staff Fiscal, Staff Frontend | Staff PM, Staff Growth, Staff Content |
| Fase 8 — Blindaje v8.2 | Staff Frontend, Staff Fiscal, Staff SRE, Staff Backend ACID | Staff Principal | Staff QA/Chaos | Staff Hardware, Staff Security, Staff QA/Chaos | Staff PM, Staff Growth |
| Fase 6B — Profundidad Retail v8.1 (28–32) | Staff Backend ACID/Datos, Staff Frontend | Staff Principal | Staff QA/Chaos | Staff Fiscal, Staff QA/Chaos, Staff Security, Staff Data | Staff PM, Staff Growth |
| Fase 6C — Cierre Comercial v8.1 (33–37) | Staff Backend ACID/Datos, Staff Frontend | Staff Principal | Staff QA/Chaos | Staff QA/Chaos, Staff Security, Staff Data | Staff PM, Staff Growth |
| Fase 6D — Inventario Avanzado v8.1 (38–42) | Staff Frontend, Staff Backend Datos, Staff Hardware | Staff Principal | Staff QA/Chaos | Staff QA/Chaos, Staff Security, Staff SRE | Staff PM, Staff Growth |
| Fase 6E — Servicios y Fuerza de Venta v8.1 (43–45) | Staff Mobile, Staff Frontend, Staff Backend ACID | Staff Principal | Staff QA/Chaos | Staff QA/Chaos, Staff Security, Staff SRE | Staff PM, Staff Growth |
| Fase 6F — Predictiva + Compliance v8.1 (46–49) | Staff Data, Staff Security, Staff SRE | Staff Principal | Staff Security | Staff QA/Chaos, Staff Backend ACID | Staff PM, Staff Growth |
| Fase 6G — Flujo del Cliente v8.1 (50–53) | Staff Mobile/Producto, Staff Frontend, Staff Backend ACID, Staff Hardware | Staff Principal | Staff QA/Chaos | Staff QA/Chaos, Staff Security, Staff Design | Staff PM, Staff Growth |
| Fase 6H — Remediación y Sello QA (54–59) | Staff Frontend, Staff QA/Chaos, Staff SRE | Staff Principal | Staff QA/Chaos + Staff Security | Staff Security, Staff Design | Staff PM, Staff Growth |

> **Independencia de V (Proceso §8.1, Matriz §4):** `V ≠ R` y `V ≠ A` a nivel de persona — el verificador es siempre un agente distinto del responsable y del aprobador. El Staff Review Board no puede ser `A` y `V` simultáneamente; cuando `A = Board` (Fase 5), `V` es Staff Principal rotativo u otro Staff independiente, nunca un miembro del Board actuando como verificador. Espejo Matriz §4: Fases 6–8 y 6B–6G verifican Staff QA/Chaos; Fase 6F (LPDP) verifica Staff Security por sensibilidad normativa; Fase 6H verifica Staff QA/Chaos + Staff Security (sello dual).

---

## Anexo B — Protocolo de Escalamiento y Excepciones al Estándar Elite

1. Si un agente Staff no puede cumplir un criterio de la Matriz de Calidad (Sección 4) dentro del sprint, **no se relaja el criterio silenciosamente**: se abre un ADR de excepción y una entrada de changelog tipo `Excepción (ADR)` con la brecha exacta, el riesgo asumido y una fecha de remediación.
2. Toda excepción requiere aprobación explícita del Staff Principal y, si toca dinero, impuestos o seguridad, también del Staff Security o Staff Fiscal correspondiente.
3. Ninguna excepción acumulada puede cruzar hacia la Fase 5 (Hardening y Lanzamiento) sin resolución — el Go/No-Go del Sprint 15 revisa explícitamente el registro de excepciones abiertas en el changelog.
4. **Desempate Arquitectónico (Tie-breaker) — anti-deadlock entre agentes.** Cuando dos o más agentes Staff mantienen un veto o desacuerdo técnico que bloquea un Quality Gate, un merge crítico o el Go/No-Go de lanzamiento:
   1. Se registra el desacuerdo en el changelog (`tipo: Excepción (ADR)` o bitácora de bloqueo) con las posiciones enfrentadas y la evidencia de cada lado.
   2. Se permiten **como máximo 3 iteraciones de remediación cruzada** (propuesta → contra-evidencia → nueva propuesta). Cada iteración debe producir evidencia nueva (test, ADR o medición), no solo opinión.
   3. Si tras la 3ª iteración el bloqueo persiste, el **Staff Principal** tiene autoridad final de desempate: elige la resolución, documenta el trade-off en un ADR obligatorio, y el veto disidente queda registrado como `Corregido por entrada #N` / disenso documentado — no como veto eterno.
   4. **Límites del desempate:** el Staff Principal **no puede** usar el tie-breaker para relajar cumplimiento SUNAT, Zero-Trust o atomicidad ACID (Principio 3). En esos dominios, si el desacuerdo es sustantivo, el resultado del desempate solo puede ser (a) remediación obligatoria antes de avanzar, o (b) aplazamiento del release — nunca "ship con riesgo fiscal/seguridad sin mitigar".
   5. El desempate aplica a PRs del pipeline (Sección 5.2 paso 8), Sprint Reviews y Go/No-Go del Sprint 15 por igual.

## Anexo C — Glosario de Estándares Referenciados

- **OWASP ASVS (Nivel 2/3):** estándar de verificación de seguridad de aplicaciones usado como barra mínima para el middleware de auth y el motor de pagos.
- **WCAG 2.1 AA:** estándar de accesibilidad web usado como barra mínima para contraste, navegación y targets táctiles.
- **Error budget / SLO:** presupuesto de indisponibilidad tolerada por servicio, usado por Staff SRE para decidir cuándo priorizar estabilidad sobre features nuevas.
- **ADR (Architecture Decision Record):** documento corto que registra una decisión de arquitectura, sus alternativas y su justificación — obligatorio para cualquier cambio no trivial.
- **Changelog inmutable (Sección 7):** registro append-only de todo lo que un agente ejecuta, con el mismo principio de integridad que el ledger financiero de KipusPay.
- **Desempate Arquitectónico (Anexo B §4):** autoridad final del Staff Principal tras 3 iteraciones fallidas de remediación cruzada, para evitar deadlocks entre agentes; no puede usarse para saltarse SUNAT, Zero-Trust ni ACID.
- **PENDING_CERTIFICATE:** estado **deprecado**. No usar como “contingencia” por falta de `.pfx`.
- **PSE KipusPay (`pse_mode = KIPUSPAY_PSE`):** default en `FORMALIZING`/`ELECTRONIC_ISSUER` — firma y envío válidos sin improvisar contingencia normativa (ADR-FISCAL-001 v2).
- **Resumen Diario (RC):** vía de reporte de boletas y NC/ND de boleta; plazo máx. 7 días calendario; job independiente del arqueo Z.
- **must_submit_by:** deadline fiscal (factura ~3d; boleta/RC ~7d); alerta T-24h; DLQ `DEADLINE_EXCEEDED`.
- **Nota de Venta (`NV`) / `NV_RETURN`:** control interno; `NOT_APPLICABLE`; leyenda legal; devoluciones sin NC fiscal.
- **formalization_mode:** `INTERNAL_CONTROL` | `FORMALIZING` | `ELECTRONIC_ISSUER`.
- **ADR-FISCAL-001 v2 (obligatorio Sprint 5):** (1) INTERNAL=solo NV; (2) FORMALIZING/ELECTRONIC=**PSE KipusPay** default; (3) boletas→RC, facturas→unitario; (4) plazos 3d/7d+alertas; (5) reglas 700/RUC/NC+CDR; (6) GRE y percepciones/retenciones **fuera de MVP v8.0**; (7) series por **branch**; (8) prohibido copy “contingencia SUNAT” para pre-certificado.
- **ADR-ARCH-002 (v8.1):** runtime por **capabilities** (`tenant_capabilities`); `vertical_type` solo UX/onboarding/analytics; prohibido `switch(vertical)` en core; FASE 6 entrega flags no forks (Arquitectura §1.1).
- **FASE 7 / Ecosistema Perú (v9):** sprints 21–24 — import Bsale/Alegra, pagos PE en caja, export Contasis/Concar + API/webhooks, WhatsApp + loyalty light (Arquitectura §5.4).
- **FASE 8 / Blindaje v8.2:** sprints 25–27 — offloading zero-dep (§7.5), `FiscalTransport` + breaker DO (ADR-FISCAL-002 / §8.1), sobregiro `usage_counters` + loyalty reservations (§4.1).
- **ADR-FISCAL-002:** canal de transporte agnóstico; default `KIPUSPAY_PSE_DIRECT`; OSE/PSE tercero como plugins; **no** reabre reglas de ADR-FISCAL-001.
- **Sobregiro facturado:** cupo Arranque 1,000/mes + S/ 0.05 excedente; nunca 402 en cobro (Principio 5 / GTM §4.1).
- **DRY de dominio / hexagonal:** una regla = un package `domain-*`; Proceso/GTM citan Arquitectura; composition root en workers/apps.
