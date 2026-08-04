# Roadmap de Sprints — Escuadrón de Agentes de IA Nivel Staff
## Ejecución de KipusPay v8.0 (Motor Financiero Edge-Native SUNAT) y su Salida al Mercado

> **Premisa de este roadmap:** KipusPay no se construye con agentes que "generan código que funciona". Se construye con agentes que operan con el juicio, el estándar de evidencia y el nivel de responsabilidad de un **Staff Engineer / Staff Designer / Staff PM** humano — la persona a la que el resto del equipo recurre cuando algo tiene que estar bien, no solo terminado. Este documento traduce la [Arquitectura Técnica KipusPay v8.0](Arquitectura_Técnica_POS_SUNAT_v8_0_KipusPay.md) y el [documento GTM](GTM.md) en un roadmap ejecutable por sprints, con roles, skills, workflows, testing, criterios de calidad medibles y un registro inmutable de lo realizado.

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
12. **Extender por capability, no por vertical; DRY de dominio.** Un PR **no** introduce `switch(vertical)` / `if (vertical === …)` en sale, stock, fiscal o caja. Nuevas verticales GTM = bundles de capabilities (ADR-ARCH-002 / Arquitectura §1.1). Cada regla de negocio tiene un solo módulo dueño; Agents y GTM citan Arquitectura, no la re-especifican.

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
- [ ] **TDD RED → GREEN verificable:** para cada capability de los sprints 1–53, el changelog incluye `ticket_or_adr`, `test_ids`, `red_commit_sha`, `red_run_id`, `expected_failure`, `green_commit_sha`, `green_run_id` y `ancestry_verified: true`. El run RED debe fallar por la aserción esperada, no por infraestructura; el commit RED debe ser ancestro del commit GREEN y del merge. CI conserva ambos logs y bloquea el merge si falta un campo, si el fallo no coincide con la aserción esperada o si el commit RED no precede a la implementación.
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

1. **Lint & análisis estático** — estilo, tipado, complejidad ciclomática.
2. **Unit tests** — ver umbrales por capa en Sección 6.
3. **Integration tests** — contra D1 real (no mocks) para todo lo que toque transacciones o esquema.
4. **Escaneo de seguridad** — SAST + escaneo de dependencias vulnerables + detección de secretos.
5. **Build** — artefacto reproducible, sin dependencia de estado local del agente que lo generó.
6. **Deploy a Staging** — réplica de la topología de shards en miniatura.
7. **Suite E2E + Chaos en Staging** — resiliencia de red, cuota de almacenamiento local excedida, presión de memoria en perfil de dispositivo de gama baja, fallo de shard, fallo de Durable Object.
8. **Staff Review Board** — quórum según Sección 4; sin aprobación, no hay siguiente etapa. Desacuerdos persistentes se resuelven con el Protocolo de Desempate Arquitectónico (Anexo B §4), nunca con deadlock indefinido.
9. **Deploy Canario a Producción** — subconjunto acotado de tenants (tenants internos/beta antes que tenants reales).
10. **Ventana de observación de canario** — monitoreo activo contra los SLO de la Sección 9 antes de decidir.
11. **Rollout completo o rollback automático** — el rollback se dispara solo si el canario cruza un umbral de error predefinido; no requiere juicio humano ni de agente en el momento de la crisis.

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

```
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

#### 7.3.1 Registro — Tanda de blindaje (P1–P4) y capa comercial retail (M1–M7)

Entradas append-only que registran la actualización de especificación de los documentos maestros (Arquitectura/Agents/GTM). Todas `tipo: Entregable nuevo`, `entregable_afectado`: documento de arquitectura.

```
id: 0143
timestamp_utc: 2026-08-03T00:00:00Z
sprint_fase: Sprint 26 — Fase 8 (Blindaje v8.2)
agente_responsable: Staff SRE / Staff Backend ACID
tipo: Entregable nuevo
entregable_afectado: Circuit breaker del canal fiscal (Arquitectura §8.1)
descripcion: >
  P1. Caché de 2 niveles (in-memory TTL 5-10s → KV 60s → DO solo
  escrituras; DO nunca en hot path) + incrementos coalescidos (~5s)
  con jitter. Criterio Sprint 26 actualizado: DO ≤ X lecturas/s bajo
  colapso SUNAT.
evidencia: revisión por pares + greps de consistencia (Sprint 26 criterio)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0144
timestamp_utc: 2026-08-03T00:00:00Z
sprint_fase: Sprint 27 — Fase 8 (Blindaje v8.2)
agente_responsable: Staff Backend ACID / Staff Growth
tipo: Entregable nuevo
entregable_afectado: Medición de uso y cupo por documento (Arquitectura §4.1)
descripcion: >
  P2. Tabla "Documentos que cuentan para cupo" (01/03/07/08/12/NV/NV_RETURN
  = +1; baja/RC ni suma ni resta; NC no reembolsa); NC handler doc_count+1;
  idempotency usage:{docId}; umbral S/700 → 70000. GTM §4.1 regla de cupo
  explícita para el cajero.
evidencia: greps de coherencia GTM/Arquitectura/Agents
aprobador: Staff Security + Staff Growth
estado: Vigente
```

```
id: 0145
timestamp_utc: 2026-08-03T00:00:00Z
sprint_fase: Sprint 25 — Fase 8 (Blindaje v8.2)
agente_responsable: Staff Frontend
tipo: Entregable nuevo
entregable_afectado: Print outbox persistida (Arquitectura §7.5)
descripcion: >
  P3. Outbox en IndexedDB print_jobs/{saleId} (payload del ticket + bytes
  ESC/POS + adaptador fallback pendiente); consumo por ACK; recompila si se
  pierden bytes; criterio F5 → el ticket sigue imprimible tras recarga.
evidencia: criterio de aceptación actualizado en Sprint 25
aprobador: Staff Hardware + Staff Principal
estado: Vigente
```

```
id: 0146
timestamp_utc: 2026-08-03T00:00:00Z
sprint_fase: Sprint 6 — Fase 2
agente_responsable: Staff Backend ACID
tipo: Entregable nuevo
entregable_afectado: Reconciliación CRM cliente (Arquitectura §6/§8.1)
descripcion: >
  P4. Eliminada deduplicación client-side (era no-op); OfflineSalePayload +
  clientEmail/Phone/Address/ProfileUpdatedAt; customers.profile_updated_at;
  upsert LWW con WHERE <= excluded.profile_updated_at; sales.client_name =
  snapshot histórico.
evidencia: DDL + payload interface verificados por grep
aprobador: Staff QA/Chaos
estado: Vigente
```

```
id: 0147
timestamp_utc: 2026-08-03T00:00:00Z
sprint_fase: Sprint 1 — Fase 0-1 (Núcleo Transaccional)
agente_responsable: Staff Backend Datos
tipo: Entregable nuevo
entregable_afectado: Esquema DDL v8.0 (convención de dinero)
descripcion: >
  M1. Toda columna monetaria renombrada a *_cents con INTEGER; nueva §5.0
  (convención obligatoria); Principio 8 enmendado; umbral de descuento
  S/700 → 70000 cents; redondeo de centavo en servidor (Math.round, nunca
  toFixed); criterio Sprint 1: 0 columnas monetarias REAL.
evidencia: rename_money.py (barrido) + grep 0 monetarias REAL
aprobador: Staff Backend ACID
estado: Vigente
```

```
id: 0148
timestamp_utc: 2026-08-03T00:00:00Z
sprint_fase: Sprint 18 — Fase 6 (Atlas v8.1)
agente_responsable: Staff Backend ACID
tipo: Entregable nuevo
entregable_afectado: PMP y control de inventario (Arquitectura §5.3)
descripcion: >
  M2/M4/M5. Reglas 9-11 + DDL v8.1: branch_stock_policies, inventory_counts,
  inventory_count_lines, stock_losses (merma con evidencia R2 y authz);
  refresh_avg_cost en misma tx; snapshot unit_cost_cents; arqueo por fórmula
  (opening + efectivo + ingresos − retiros − egresos).
evidencia: DDL verificado por grep + criterios Sprint 18
aprobador: Staff QA/Chaos + Staff Security
estado: Vigente
```

```
id: 0149
timestamp_utc: 2026-08-03T00:00:00Z
sprint_fase: Sprint 17 — Fase 6 (Atlas v8.1)
agente_responsable: Staff Backend ACID
tipo: Entregable nuevo
entregable_afectado: Caja dura y auditoría (Arquitectura §5.3)
descripcion: >
  M6/M7. cash_register_cash_movements (movimientos no-venta); extensión
  cash_register_sessions (expected/counted/difference, closed_blind);
  sale_reprints con sello COPIA; audit_events ampliado (PRICE_CHANGE,
  REPRINT, CASH_MOVEMENT, CONFIG_CHANGE...); matriz RBAC GTM §3.3.1.
evidencia: DDL verificado por grep + criterios Sprint 17
aprobador: Staff Security + Staff QA
estado: Vigente
```

```
id: 0150
timestamp_utc: 2026-08-03T00:00:00Z
sprint_fase: Sprint 9 — Fase 3
agente_responsable: Staff Backend Datos / Staff SRE
tipo: Entregable nuevo
entregable_afectado: Capa de reportes (Arquitectura §9)
descripcion: >
  M3. daily_financial_rollups + daily_product_rollups en D1 (fuente de
  verdad); cron idempotente con Promise.all; AE solo dashboards, nunca
  factura; catálogo de reportes con gating plan+rol; GTM §5.5/§5.6/§6.3
  alineados (arqueo por fórmula, PMP, rollups exactos).
evidencia: §9 verificado por lectura + greps GTM/Agents
aprobador: Staff Principal
estado: Vigente
```

```
id: 0151
timestamp_utc: 2026-08-03T00:00:00Z
sprint_fase: FASE 6B — Profundidad Retail (v8.1, sprints 28–32)
agente_responsable: Staff PM + Staff Backend ACID
tipo: Entregable nuevo
entregable_afectado: Profundidad retail (Arquitectura §5.3 reglas 13–17)
descripcion: >
  FASE 6B documentada: devoluciones N días (reversión de PMP), 3-way de
  proveedores, promociones/tramos, variantes+UM, apartados + diario
  contable. DDL v8.1 FASE 6B + audit_events ampliado (RETURN,
  SUPPLIER_PRICE_DIFF, PROMOTION_CHANGE, LAYAWAY_CANCEL, JOURNAL_POST).
  Backlog v10 priorizado y consolidado.
evidencia: greps de coherencia FASE 6B (sprints 28–32)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0152
timestamp_utc: 2026-08-03T01:00:00Z
sprint_fase: FASE 6C — Cierre Comercial (v8.1, sprints 33–37)
agente_responsable: Staff PM + Staff Backend ACID
tipo: Entregable nuevo
entregable_afectado: Cierre comercial (Arquitectura §5.3 reglas 18–22)
descripcion: >
  FASE 6C documentada: cotizaciones (quote sin CPE, congelado por servidor),
  devolución a proveedor (reversión PMP+CxP), crédito de tienda/gift cards,
  cuotas, comisiones. DDL + audit_events (QUOTE_*, SUPPLIER_RETURN,
  STORE_CREDIT_*, INSTALLMENT, COMMISSION). Catálogo §9 ampliado.
evidencia: greps de coherencia FASE 6C (sprints 33–37)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0153
timestamp_utc: 2026-08-03T01:00:00Z
sprint_fase: FASE 6D — Inventario Avanzado (v8.1, sprints 38–42)
agente_responsable: Staff Backend Datos + Staff SRE
tipo: Entregable nuevo
entregable_afectado: Inventario avanzado + backup (Arquitectura §5.3 reglas 23–27)
descripcion: >
  FASE 6D documentada: ubicaciones/racks, números de serie, venta por peso
  (balanza, sale del backlog v10), etiquetas de precio, export/restore total
  del negocio (respalda GTM §5.7.1). DDL + audit (SERIAL_ASSIGN,
  WEIGHT_OVERRIDE, PRICE_LABEL_REPRINT, DATA_BACKUP, DATA_RESTORE).
evidencia: greps de coherencia FASE 6D (sprints 38–42)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0154
timestamp_utc: 2026-08-03T01:00:00Z
sprint_fase: FASE 6E — Servicios y Fuerza de Venta (v8.1, sprints 43–45)
agente_responsable: Staff Mobile + Staff Backend ACID
tipo: Entregable nuevo
entregable_afectado: Servicios y preventa (Arquitectura §5.3 reglas 28–30)
descripcion: >
  FASE 6E documentada: preventa/pedido con retiro, ventas recurrentes y
  membresías (cron idempotente), notificaciones push + caja móvil Android.
  DDL + audit (CUSTOMER_ORDER_CANCEL, RECURRING_*).
evidencia: greps de coherencia FASE 6E (sprints 43–45)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0155
timestamp_utc: 2026-08-03T01:00:00Z
sprint_fase: FASE 6F — Predictiva + Compliance (v8.1, sprints 46–48)
agente_responsable: Staff Data + Staff Security + Staff SRE
tipo: Entregable nuevo
entregable_afectado: Analítica predictiva + LPDP + DR (Arquitectura §5.3 reglas 31–32)
descripcion: >
  FASE 6F documentada: forecasting sobre daily_product_rollups (respalda
  claim Cadena; GTM §4.1 congela "analítica predictiva" hasta Sprint 46),
  LPDP Perú (PII, consentimiento, anonimización con retención fiscal),
  DR/BCP (RPO=0 tx ACID, RPO≤1d rollups, RTO por shard, simulacro anual).
  DDL: forecast_outputs, consent_records; audit: FORECAST_*, LPDP_ERASE,
  DR_SIMULATION.
evidencia: greps de coherencia FASE 6F (sprints 46–48)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0156
timestamp_utc: 2026-08-03T02:30:00Z
sprint_fase: Corrección transversal (v8.1) — auditoría Staff
agente_responsable: Staff Principal + Staff Backend ACID + Staff Mobile + Staff Data
tipo: Corrección (4 edge cases)
entregable_afectado: Cupo vs SUNAT (Arquitectura §4.1, GTM), PMP forward-only (reglas 9/19),
  reserva de fidelidad expirada (§5.4, Sprint 24), Modo Dueño offline (§9, Sprint 8, GTM §6.3)
descripcion: >
  Auditoría Staff: (a) el cupo cubre la generación/procesamiento del comprobante
  sin importar el estado final de aceptación SUNAT (QUARANTINED/REJECTED);
  (b) invariante PMP forward-only: COGS de ventas cerradas = snapshot unit_cost_cents
  inmutable, rollups pasados jamás se reescriben, reversiones solo afectan transacciones
  futuras; (c) reserva de fidelidad expirada en retry offline: la venta commite SIN puntos,
  nunca saldo negativo, audit_events LOYALTY_RESERVATION_EXPIRED + push al Dueño;
  (d) Modo Dueño legible offline: último rollup cacheado en IndexedDB (lectura pura)
  con banner de marca de tiempo, nunca presentado como en vivo.
evidencia: greps de coherencia (reglas 9/19/33, LOYALTY_RESERVATION_EXPIRED, banner offline)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0157
timestamp_utc: 2026-08-03T02:45:00Z
sprint_fase: FASE 6F — Predictiva + Compliance (v8.1, Sprint 49)
agente_responsable: Staff Data + Staff Security + Staff QA
tipo: Entregable nuevo
entregable_afectado: Inteligencia del negocio (Arquitectura §5.3 regla 33)
descripcion: >
  Sprint 49 documentado: analytics.agentic_insights — pipeline determinista
  (router de intención → Text-to-SQL sobre schema estricto → SELECT en D1 →
  NLG con hechos tipados verbatim + post-check anti-alucinación → SSE P95<2s),
  Morning Briefing cron 3:30 AM con caché KV insights:{tenant_id}:{fecha},
  zero-trust tenant_id del JWT forzado en WHERE, metering ai_usage_counters
  + insight_log append-only. DDL: insight_log, ai_usage_counters; audit:
  INSIGHT_GENERATED, AI_QUOTA_EXCEEDED. GTM §4.1 congela el claim "Gerente de
  Operaciones incluido" hasta este gate.
evidencia: greps de coherencia Sprint 49 (regla 33, insight_log, freeze GTM)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0158
timestamp_utc: 2026-08-03T03:30:00Z
sprint_fase: Corrección transversal (v8.1) — auditoría Staff IA + motor offline
agente_responsable: Staff Data + Staff Security + Staff Frontend Offline-First
tipo: Corrección (4 edge cases IA/offline)
entregable_afectado: Insight del negocio (regla 33, Sprint 49) + rollups (§9, Sprint 6)
descripcion: >
  Auditoría IA x motor offline: (A) validador Text-to-SQL inyecta LIMIT 50
  forzoso + agregación para listas amplias ("datos muy amplios → Excel"),
  jamás materializa listados grandes en el isolate (128 MB); (B) idempotencia
  del chat: insight_idempotency_key + respuesta cacheada en KV (TTL ~10 min),
  ai_usage_counters solo en el primer procesamiento (0 doble cobro por corte
  de SSE en red móvil); (C) schema PII-free: whitelist excluye email/phone/
  address/document_number, expone customer_id + seudónimo, post-check de
  facts_json (LPDP regla 32); (D) sync offline tardío: al reconciliar venta de
  día cerrado, processOfflineSaleAtomic re-materializa el rollup (§9) e invalida
  insights:{tenant_id}:{fecha} en KV (briefing regenerado con cifras integradas).
  DDL: insight_log.idempotency_key + status (LIMIT_CAPPED/PII_BLOCKED/TOO_WIDE).
evidencia: greps de coherencia (LIMIT 50, insight_idempotency_key, schema PII-free,
  re-materialización rollup, Sprint 6/49)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0159
timestamp_utc: 2026-08-03T04:00:00Z
sprint_fase: FASE 6G — Flujo del Cliente (v8.1, sprints 50–53)
agente_responsable: Staff Mobile/Producto + Staff Frontend + Staff Backend ACID + Staff Hardware
tipo: Entregable nuevo
entregable_afectado: Flujo del cliente post-onboarding (Arquitectura §5.3 reglas 34–37)
descripcion: >
  FASE 6G documentada: alta rápida de catálogo (Escáner Rápido con cámara +
  venta rápida sin catálogo is_uncatalogued), handoff de turno sin cierre Z
  (PIN temporal + cash_register_shifts + conteo intermedio opcional), equipo
  (invitación + PIN/badge con atribución de vendedor <1s en carrito), Product
  Tour por capabilities + checklist "segundo día" y Troubleshooter de hardware.
  DDL: cash_register_shifts, users.pin_hash/badge_barcode, sale_items.is_uncatalogued;
  audit: SHIFT_TRANSFER, TEAM_INVITE, QUICK_ADD, GENERIC_LINE, HARDWARE_DIAG.
  Backlog v10: handoff de turno movido desde P2 a Sprint 51.
evidencia: greps de coherencia FASE 6G (reglas 34–37, sprints 50–53, DDL, audit)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0160
timestamp_utc: 2026-08-03T05:00:00Z
sprint_fase: Documentación — Auditoría de coherencia (P1–P6)
agente_responsable: Staff Principal + Staff Backend ACID/Datos
tipo: Corrección de coherencia
entregable_afectado: Arquitectura §1.1/§3/§4.1/§5.1/§5.3/§9; Agents estado + changelog; GTM §2/§4.1/§6.3
descripcion: >
  Auditoría integral de coherencia/DRY/SOLID/hardcodes sobre los 3 docs maestros.
  (1) Planes: planId JWT pasa a 'arranque'|'crece'|'cadena'|'enterprise' y DDL
  tenants.plan_id se alinea con CHECK de 4 valores (antes basic/pro/enterprise).
  (2) Roles: union core = owner|admin|supervisor|cashier; kds deja de ser rol core
  (capability orders.kds.*, Interface Segregation); supervisor añadido (PIN/arqueo,
  GTM §3.3.1). (3) Flags premium ad-hoc (ownerMode/multiRegister/...) sustituidos por
  gating de capabilities (ADR-ARCH-002). (4) Registro canónico de capabilities §1.1
  completado con FASE 6B-6G (reglas 13–37) y nota FASE 8. (5) Catálogo de
  audit_events.action por FASE (tabla canónica; FORECAST_* enumerado como
  FORECAST_CREATE/RUN/REFRESH; DDL lo referencia). (6) Hardcodes: max_amount_without_auth
  DEFAULT 20.0 float → 2000 cents; KV insights:{tenant_id}:* unificado (era {tenant});
  Loyalty re-etiquetado (v8.2 → FASE 7/v9); cron rollup anclado a 3:00 AM Lima (pre-briefing
  3:30 AM); constante legal S/700 → 70000 cents centralizada en §5.1. (7) GTM: umbral
  Cadena 4+/10+ unificado; cross-ref de gate en ranking Dueño (Crece+). (8) Tabla de
  estado: fila Sprint 5b explícita; fila Sprint 6 refleja edge D.
evidencia: greps de coherencia finales (planes 4 valores, roles, KV unificado,
  capabilities registry, catálogo audit, DEFAULT 2000, fences pares, _cents intacto)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0161
timestamp_utc: 2026-08-03T06:00:00Z
sprint_fase: Integración — 7 edge cases FASE 6G vs core + offline/Zero-Trust
agente_responsable: Staff Frontend + Staff Backend ACID + Staff Hardware + Staff Principal
tipo: Endurecimiento de reglas de integración
entregable_afectado: Arquitectura §5.3 reglas 6/11/13/25/34/35/36, §5.4 regla 2, §6 motor, §9 catálogo; Agents sprints 17/22/25/28/40/50/51; GTM §6.3
descripcion: >
  7 edge cases de integración documentados con reglas + criterios de aceptación:
  (1A) Namespace anti-colisión de códigos: badge_barcode server-side con prefijo
  reservado 'EMP-' (UNIQUE por tenant, fuera de EAN-13/UPC); Escáner Rápido rutea por
  prefijo (EMP- => users, dígitos => products.barcode); 'EMP-' prohibido como barcode.
  (1B) Devolución de línea genérica (is_uncatalogued): NC/NV_RETURN + vuelto pero SIN
  restaurar stock ni refresh_avg_cost (jamás se descontó); audit RETURN con flag.
  (1C) Desglose por operador: Z impreso + Modo Dueño desglosan diferencias por tramo de
  cash_register_shifts (SHIFT_TRANSFER con cash_diff_cents); total día = Σ tramos.
  (2A) Venta rápida offline vs Zero-Trust: processOfflineSaleAtomic acepta manualPriceCents
  como fuente de verdad para is_uncatalogued (dentro del umbral), IGV default de tenant,
  sin 'Product not found', sin descuento de stock; audit GENERIC_LINE. Payload offline:
  + isUncatalogued/manualPriceCents.
  (2B) Captura manual de billetera offline: estado MANUAL_ELECTRONIC_CAPTURE en
  payment_captures; alerta ámbar "Sin conexión. Verifica visualmente la app del cliente";
  Modo Dueño lista pagos no conciliados por API; payload + captureStatus.
  (2C) Heartbeat de balanza: pérdida WebUSB => interfaz roja "Peso Manual" (jamás 0.00
  silencioso); peso manual sobre umbral => WEIGHT_OVERRIDE + PIN de supervisor.
  (2D) Gate de print outbox antes del cierre Z: modal bloqueante si hay PENDING/FAILED;
  outbox.pendingCount() consumido por el gate (Sprint 17/25).
evidencia: greps de coherencia (EMP-, MANUAL_ELECTRONIC_CAPTURE, isUncatalogued,
  pendingCount, cash_register_shifts desglose, GENERIC_LINE, criterios sprints)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0162
timestamp_utc: 2026-08-03T07:00:00Z
sprint_fase: Integración — ciclo fiscal de devoluciones y CxC vs caja/inventario/rollups
agente_responsable: Staff Fiscal + Staff Backend ACID + Staff Backend Datos + Staff Principal
tipo: Endurecimiento de reglas del ciclo fiscal de devoluciones
entregable_afectado: Arquitectura §4.1 (aceptación SUNAT), §8 reglas NC/ND/baja/CxC + handler, §8.1 backpressure, §5.3 regla 13/21; Agents sprints 5/5b/8/26/28; GTM FAQ
descripcion: >
  4 edge cases del ciclo fiscal de devoluciones documentados con reglas + criterios:
  (E-A) CPE no aceptado (REJECTED/QUARANTINED/DEADLINE_EXCEEDED) sin ruta de anulación:
  contradicción §4.1 ("solo una NC anula el efecto comercial") vs precondición ACCEPTED
  (409). Fix: NC de anulación TOTAL sin exigir CDR (jamás lo hubo), motivo Cat. 09,
  audit CREDIT_NOTE_NO_CDR + alerta Dueño; 409 aplica solo a PENDING/PROCESSING.
  (E-B) NC parcial restauraba stock de ítems is_uncatalogued (nunca descontaron):
  el handler §8 ahora omite restore stock / refresh_avg_cost para líneas genéricas.
  (E-C) Baja de boleta es SOLO fiscal: no revierte stock ni caja; tras RC del día
  enviado/aceptado la baja es 422 y la anulación posterior va por NC.
  (E-D) NC/NV_RETURN sobre venta a crédito (CxC): reduce accounts_receivable en la
  misma tx (total/parcial), vuelto del abono por método o crédito de tienda (regla 20),
  0 ajustes de CxC silenciosos; alineado a regla 21.
evidencia: greps de coherencia (CREDIT_NOTE_NO_CDR, is_uncatalogued en NC, E-A/E-B/E-C/E-D,
  balance_due_cents, criterios sprints 5/5b/8/26/28, fences pares)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0163
timestamp_utc: 2026-08-03T08:00:00Z
sprint_fase: Adaptación de informe de auditoría externa — 4 mitigaciones R-01..R-04
agente_responsable: Staff Principal + Staff Fiscal + Staff QA/Chaos + Staff Frontend
tipo: Endurecimiento de gobernanza y fronteras (estándares de ingeniería nivel staff)
entregable_afectado: Arquitectura §8.1 (frontera DTO FiscalTransport/PrinterTransport), §5.2
  (alertas T-6h + auto-sugerencia NC E-A); Agents checklist global de sprint (TDD RED→GREEN),
  sprints 5b/26/49; changelog
descripcion: >
  Adapta las 4 mitigaciones del informe de auditoría externa (2026-08-03):
  (R-01) Frontera de contrato: FiscalTransport/PrinterTransport consumen SOLO los DTO
  normalizados CPEInvoiceDTO/CPESummaryDTO (y DTO de impresión); prohibido importar
  entidades retail de FASE 6B-6G — el transporte es un puerto desacoplado y avanzable
  sin esperar la capa comercial (mata vacíos de contrato si Sprint 26 se adelanta).
  (R-02) Benchmark gama baja: ningún sprint de FASE 6F/6G se cierra sin pasar la suite de
  estrés en emulador Android con 1 GB de RAM (re-materialización de rollup tardío edge D +
  reconciliación de cola concurrentes, 0 QuotaExceededError / OOM).
  (R-03) Guardián de plazos fiscales: segunda alerta T-6h (además de T-24h) y auto-sugerencia
  de NC de anulación sin CDR (E-A) desde el panel Dueño al entrar en DEADLINE_EXCEEDED —
  desbloquea contabilidad sin acción manual.
  (R-04) TDD nivel staff (RED→GREEN): toda capability (sprints 17-53) exige suite de tests
  commiteada en ROJO antes de la solución; el CI verifica el commit de test fallido asociado
  al ticket/ADR antes del merge en verde. Fuente: estándares de ingeniería nivel staff
  (Principio 10) — no es una regla externa "AEON".
evidencia: greps de coherencia (CPEInvoiceDTO, T-6h, "1 GB", RED→GREEN, 0163, fences pares,
  REAL NOT NULL intacto)
aprobador: Staff Principal
estado: Vigente
```

```
id: 0164
timestamp_utc: 2026-08-03T09:00:00Z
sprint_fase: Documentación — Tanda fiscal (FIS) de la mega-auditoría multi-dominio
agente_responsable: Staff Fiscal + Staff Backend ACID + Staff Principal
tipo: Corrección de especificación fiscal
entregable_afectado: Arquitectura §5.2/§5.3/§6/§8/§8.1, §4.1; Agents criterios sprints 5/5b/26/28; GTM §4.1/§5
descripcion: >
  Mega-auditoría multi-dominio, tanda fiscal. FIS-01: issued_date_lima +3 días
  (corregido off-by-one). FIS-02: el INSERT del motor §6 puebla issued_at_lima,
  must_submit_by, sunat_status y void_status por tipo de documento (NV→NOT_APPLICABLE,
  CPE→PENDING + deadline). FIS-03: RC por emisor (tenant_id + summary_date) + índice
  idx_daily_summary_day + branch_id en sunat_daily_summaries. FIS-07: CHECKs de
  document_type/sunat_status (incluye QUARANTINED)/void_status en sales. FIS-08/09:
  ND 08 con cupo usage:ND:{id} en misma tx, no reembolsa cupo origen, no consume CxC.
  FIS-10: baja de boleta no consume cupo. FIS-11: ICBPER con charges_icbper + fuente
  única flat_fee_amount_cents. FIS-12: contrato UBL mínimo pre-firma → DLQ QUARANTINED
  sin tocar breaker.
evidencia: greps de coherencia FIS (issued_at_lima, must_submit_by, idx_daily_summary_day,
  QUARANTINED, usage:ND, charges_icbper, UBL) + fences pares + REAL NOT NULL intacto
aprobador: Staff Principal
estado: Vigente
```

```
id: 0165
timestamp_utc: 2026-08-03T09:15:00Z
sprint_fase: Documentación — Tanda de datos (DAT) + RC/DLQ de la mega-auditoría
agente_responsable: Staff Backend Datos + Staff Backend ACID + Staff Principal
tipo: Corrección de especificación de datos
entregable_afectado: Arquitectura §5.3 DDL v8.1, §6, §8.1; Agents criterios sprints 1/6/8; GTM §5
descripcion: >
  Tanda datos + RC/DLQ. DAT-01: branch_id TEXT NULL en sunat_daily_summaries.
  DAT-04: CHECKs en payment_captures, cash_register_sessions, accounts_receivable y
  sunat_daily_summaries (status/rc_type). DAT-05: pago a crédito crea CxC en la misma tx
  (reuso salePaymentId — DAT-11). DAT-07: índices en sales(sales_referenced),
  sales(issued_at_lima), sale_items(sale), sales_returns(sale), journal_lines(entry).
  DAT-09: redondeo en servidor con Math.round(centavos), jamás toFixed. DAT-10: ediciones
  acumulativas de FASE 6B-6G/§5.4/§5.3 como "NOTA IMPORTANTE: reemplazar…" sin cambios
  parciales conflictivos (12 conjuntos reglas 1–32 verificados). DAT-03: versión v8.1 en
  comentario DDL. RC/DLQ: DLQ con taxonomía (QUARANTINED/DEADLINE_EXCEEDED) independiente
  del breaker; RC de boletas ramificada por emisor; QUARANTINED en el enum unificado.
evidencia: greps de coherencia DAT (branch_id NULL, CHECKs, salePaymentId, Math.round,
  NOTA IMPORTANTE, v8.1) + fences pares
aprobador: Staff Principal
estado: Vigente
```

```
id: 0166
timestamp_utc: 2026-08-03T09:30:00Z
sprint_fase: Documentación — DDL mega (SEC/SYN/PERF/COM) de la mega-auditoría
agente_responsable: Staff Backend Datos + Staff Security + Staff Principal
tipo: Corrección de especificación de schema
entregable_afectado: Arquitectura §5.3 DDL v8.1 (SEC-03/04/07/08/09/10/12, PERF-02/03/05/06,
  COM-01/02/03/04/06/07/08/09/10/12)
descripcion: >
  DDL mega en una sola pasada co-verificada: tenant_certificates (private_key_kms_ref,
  fingerprint, expiración, rotación ≥2 años); api_keys (key_prefix UNIQUE + key_hash
  HMAC-SHA256, last_used_at) y webhook_endpoints (deny-list HTTPS, failure_count,
  auto-disable, secret_hash); customers.pii_erased/erased_at (CHECK 0|1) contra LWW;
  webhook_events UNIQUE(source, event_id); authorization_token single-use TTL 90s + PIN
  argon2id + rate limit 5/15min + hash en audit; audit_events.prev_hash (hash-chaining);
  CHECKs de roles y subscription_status; COM-01..COM-12 (tenant_id NOT NULL en items,
  is_uncatalogued condicional, snapshots fiscales en returns, FKs de proveedores/
  promociones/journals/depósitos/cuotas/loyalty, sale_installments principal/interest,
  commission_accruals reversible, reserved_until/reserved_qty, DEFAULT 0 en INTEGER);
  índices PERF (idempotencia offline, precios/impuestos hot path, auth, tipo de cambio).
  Status enum unificado con QUARANTINED; fences pares 32/32; REAL NOT NULL 33 intactos.
evidencia: greps DDL (SEC-*, COM-*, idx_*, UNIQUE, CHECK) + fence check 32/32 +
  greps _cents/REAL
aprobador: Staff Principal
estado: Vigente
```

```
id: 0167
timestamp_utc: 2026-08-03T09:45:00Z
sprint_fase: Documentación — Motor del engine §6 (SEC-02/05/06, SYN-04/05/06/08, PERF-01)
agente_responsable: Staff Backend ACID + Staff Security + Staff Principal
tipo: Corrección de especificación del motor de venta
entregable_afectado: Arquitectura §6 processOfflineSaleAtomic, §7.1, payload OfflineSalePayload
descripcion: >
  Tanda engine. SEC-02: validaciones de negocio en server (a) discountAmount ≤ subtotal →
  422 DISCOUNT_EXCEEDS_SUBTOTAL; (b) ≤ max_*_without_auth → AUTH_TOKEN_REQUIRED; (c)
  manualPriceCents validado en venta rápida; (d) Σ payments == total → PAYMENT_TOTAL_MISMATCH
  (excepto crédito declarado); (e) línea genérica sin stock ni inventory_movements + audit
  GENERIC_LINE. SYN-04/SEC-06: ventana de skew ±6h con 422 ISSUED_AT_SKEW_VIOLATION (clamp
  prohibido) + única re-fecha con TIMESTAMP_OVERRIDE. SYN-05: FEFO/lotes re-valida en tx
  (EXPIRED_BATCH, UPDATE condicional, 0 filas → InsufficientBatchError; cliente sin batch →
  server asigna FEFO). SYN-06: oversell offline acepta y commitea con stock negativo
  transitorio + OFFLINE_OVERSELL + alerta Modo Dueño (solo 422 si no existe o
  allow_negative_stock prohibido). SYN-08: LWW en reloj del servidor con clamp serverAdjusted
  dentro de ±6h. PERF-01: ≤7 round-trips D1 por venta (batch products/prices/taxes).
evidencia: greps coherencia engine (DISCOUNT_EXCEEDS_SUBTOTAL, ISSUED_AT_SKEW_VIOLATION,
  EXPIRED_BATCH, OFFLINE_OVERSELL, GENERIC_LINE, clamp) + criterios sprints 1/6/51
aprobador: Staff Principal
estado: Vigente
```

```
id: 0168
timestamp_utc: 2026-08-03T10:00:00Z
sprint_fase: Documentación — Tanda de seguridad (§3 auth, secretos, webhooks)
agente_responsable: Staff Security + Staff SRE + Staff Principal
tipo: Corrección de especificación de seguridad
entregable_afectado: Arquitectura §3 (middleware JWT, secretos), §4 webhooks, §4.0 política
  transversal, §8.1 (breaker/auth de alarmas)
descripcion: >
  Tanda SEC aplicada. SEC-01: middleware §3 exige Bearer JWT verificado (WebCrypto,
  exp/iat/nbf, denylist none/HS), tenantId/externalAuthId SOLO de claims, x-tenant-id es
  hint con mismatch → 403. SEC-03: política de secretos argon2id/HMAC-SHA256 con salt,
  clave del .pfx solo en Workers Secrets/KMS (private_key_kms_ref), rotación ≥2 años.
  SEC-08: dedup webhook UNIQUE(source, event_id) + comparación HMAC en tiempo constante +
  ventana de replay 0..300s (timestamp futuro rechazado). SEC-11: rate limits por ruta
  (login/PIN 5/15min, webhooks 100/min), CORS allowlist, CSRF SameSite+Secure, breaker §8.1
  con secret central + formato de alarma exacto. PERF-04: caché 2 niveles auth
  (in-isolate TTL 5-10s → KV → DO solo cache-miss) con fail-open acotado.
evidencia: greps coherencia SEC (§3 middleware, secretos, webhook dedup, rate limit,
  caché 2 niveles, token_ttl_seconds) + fences pares
aprobador: Staff Principal
estado: Vigente
```

```
id: 0169
timestamp_utc: 2026-08-03T10:15:00Z
sprint_fase: Documentación — Tanda de rendimiento (PERF) + rollups + §7/§7.5
agente_responsable: Staff SRE + Staff Backend Datos + Staff Frontend + Staff Principal
tipo: Corrección de especificación de rendimiento
entregable_afectado: Arquitectura §6 (PERF-01/07/08), §9 cron rollups, §7 dispatcher, §7.5 offload
descripcion: >
  Tanda PERF. PERF-01: regla dura ≤7 round-trips D1 por venta (batch multi-row). PERF-07:
  upsert customers con RETURNING id + WHERE profile_updated_at <= excluded. PERF-08:
  usage_counters UPSERT en la tx del motor para TODOS los tipos (NV/NV_RETURN incluidos;
  sin CPE no se encola RC), idempotente por UNIQUE offline_id. PERF-09: cron rollups
  consolida de sales/sale_items/sale_payments (nunca lee la tabla de salida que escribe);
  día Lima calculado en worker. PERF-11: excepción única a forward-only (edge D §9) con
  re-materialización de días cerrados desde snapshots, sin tocar PMP/forecast. PERF-12:
  insights contra réplica de lectura + LIMIT 50 forzoso. §7: ack POR-VENTA
  (results:[{offlineSaleId,status}]) — un 422 no tumba el batch. §7.5: dedupe de escrituras
  de la cola de impresión (misma job no se re-escribe), nunca dedup CRM (SYN-11 server-side).
evidencia: greps coherencia PERF (round-trips ≤7, rollups cron fuente, ack por-venta,
  dedupe cola, LIMIT 50) + criterios sprints 25/26/49
aprobador: Staff Principal
estado: Vigente
```

```
id: 0170
timestamp_utc: 2026-08-03T10:30:00Z
sprint_fase: Documentación — Tanda de sync offline (SYN)
agente_responsable: Staff Backend ACID + Staff Frontend Offline-First + Staff Principal
tipo: Corrección de especificación de sincronización
entregable_afectado: Arquitectura §6/§7/§8.1 (SYN-01/02/05/12, PERF-02, SEC-05)
descripcion: >
  Tanda SYN aplicada. SYN-01: idempotencia física con índice único
  idx_sales_offline_id UNIQUE(sales.tenant_id, offline_client_sale_id) WHERE NOT NULL AND
  deleted_at IS NULL + captura SQLITE_CONSTRAINT → ALREADY_SYNCED. SYN-02/SEC-05:
  correlativo emitido por el SERVIDOR/DO de serie en la misma tx; colisión → 409
  SERIES_MISMATCH; payload OfflineSalePayload incluye sellerId y documentType NV_RETURN.
  SYN-12 (§7.1): ack por-venta con status SUCCESS|ALREADY_SYNCED|FAILED; el dispatcher solo
  borra las confirmadas y re-encola las FAILED; checkpoint del último ack para reanudar.
  PERF-02: idx_sales_offline_id reemplaza el SELECT pre-tx (ON CONFLICT → ALREADY_SYNCED).
  LWW/oversell/FEFO/skew ver entrada 0167 (mismo batch §6).
evidencia: greps coherencia SYN (idx_sales_offline_id, ALREADY_SYNCED, SERIES_MISMATCH,
  sellerId, NV_RETURN, results[]) + fences pares
aprobador: Staff Principal
estado: Vigente
```

```
id: 0171
timestamp_utc: 2026-08-03T10:45:00Z
sprint_fase: Documentación — Tanda de integración comercial (COM) + pricing congelado
agente_responsable: Staff Backend ACID + Staff Frontend + Staff Principal
tipo: Corrección de especificación de integración comercial
entregable_afectado: Arquitectura §5.3 reglas 18/28 (pricing), §6, §8; Agents FASE 6C/6E
descripcion: >
  Tanda COM. COM-01: tenant_id NOT NULL + FK en quote_items, customer_order_items,
  sale_return_items, supplier_return_items. COM-02: sale_items.product_id NULL + CHECK
  (is_uncatalogued = 0 OR product_id IS NULL). COM-03: snapshots fiscales (igv_affectation_code,
  igv_amount_cents, icbper_amount_cents) en returns. COM-04: FKs en supplier_invoices,
  product_promotions, journals, deposit_payments, installments, store_credit_transactions,
  commission_rates/payouts. COM-06/07/08/09/12: cuotas (principal/interest + pagos con
  idempotency), comisiones (commission_accruals reversible por NC), apartados (Σ payments =
  total, reserva física), preventa (reserved_until/reserved_qty), loyalty (points_balance >= 0
  + FK). COM-05: precio congelado en cotizaciones (regla 18) y preventa (regla 28) — la
  venta hereda el snapshot aunque el precio de lista cambie; si expira, re-cotización con
  pricing actual.
evidencia: greps coherencia COM (tenant_id NOT NULL items, CHECK is_uncatalogued, snapshots
  fiscales, principal_cents, commission_accruals, reserved_until) + criterios FASE 6C/6E
aprobador: Staff Principal
estado: Vigente
```

```
id: 0172
timestamp_utc: 2026-08-03T11:00:00Z
sprint_fase: Documentación — Tanda GTM (claims/gates/FAQ) + legal
agente_responsable: Staff Growth + Staff PM + Staff Principal
tipo: Corrección de especificación GTM
entregable_afectado: GTM §3.3.1/§4.1/§5/§5.5/§5.6/§5.7/§6.3; Agents tabla de estado
descripcion: >
  Tanda GTM aplicada a GTM.md: matriz explícita GTM-01..12 para claims/gates/FAQ/legal.
  GTM-01/02 — claims de planes con freeze (analítica predictiva Cadena y soporte prioritario
  Enterprise); GTM-03 — ranking Dueño (Crece+) con datos sincronizados; GTM-04 — cupo
  1,000/mes Arranque + S/0.05 excedente sin 402 en cobro; GTM-05/06 — FAQ de devolución
  con CxC, venta rápida sin catálogo (is_uncatalogued) y captura manual offline; GTM-07..12
  — leyenda NV "nota de venta no comprobante", conservación de comprobantes SUNAT
  (T-6h/T-24h + DLQ), LPDP Perú (anonimización con retención fiscal), disclaimer de
  forecasting/briefing, Modo Dueño legible offline (banner, nunca en vivo), y claims
  publicables solo tras gate/evidencia. Matriz RBAC §3.3.1 sin claim de plan.
evidencia: greps coherencia GTM (claims con freeze, gates, FAQ CxC/is_uncatalogued, leyenda
  legal, banner offline, DLQ) + tabla de estado Agents
aprobador: Staff Principal
estado: Vigente
```

```
id: 0173
timestamp_utc: 2026-08-03T12:00:00Z
sprint_fase: Gobernanza — auditoría GOV pendiente de detalle
agente_responsable: Staff Principal
tipo: Excepción (ADR)
entregable_afectado: Agents §8 Gobernanza y Ceremonias; matriz de trazabilidad y plan de remediación
descripcion: >
  El agente de gobernanza no devolvió una lista de hallazgos verificable en la mega-auditoría.
  No se infiere aprobación ni se cierran brechas por silencio. GOV queda documentado como
  backlog bloqueado: re-desplegar la auditoría con instrucción de entregar PERT, estimación,
  matriz de trazabilidad y riesgos; hasta recibir ese detalle, Staff Principal mantiene el
  Go/No-Go de gobernanza pendiente y no se relajan criterios de la Matriz de Calidad.
evidencia: salida de auditoría GOV ausente; backlog explícito y Definition of Ready requerida
  antes de aceptar el trabajo
aprobador: Pendiente de re-despliegue GOV
estado: Vigente
```

```
id: 0174
timestamp_utc: 2026-08-03T13:00:00Z
schema_version: 2
sprint_fase: Corrección transversal — remediación de auditoría P0/P1
agente_responsable: Staff Principal + Staff Backend ACID + Staff Security + Staff Fiscal + Staff PM + Staff Growth
tipo: Corrección
subtipo: gobernanza
relacion: CORRIGE
referencias_entradas: [0164, 0165, 0166, 0167, 0168, 0169, 0170, 0171, 0172, 0173]
entregable_afectado: Arquitectura §3/§4/§6/§8/§9; Agents §3/§7/§8/§9; GTM §4.1/§5.9/§8
descripcion: >
  Remedia los hallazgos P0/P1: D1 batch y guards SQL en lugar de db.transaction;
  usuario local obligatorio; autorización server-side con consumo atómico; crédito,
  CxC, referencias NC/NV_RETURN, cupo idempotente, stock por branch, FEFO/PMP,
  rollups escribibles, dispatcher autenticado, webhook retryable, LPDP y FKs tenant;
  además alinea pricing/claims con Quality Gates, define SLO/rollback y explicita
  GOV-BLOQUEADO. Requiere revisión independiente antes de cerrar.
evidencia: greps de contratos y referencias; faltan runs runtime, migración D1 y firmas independientes
aprobador: Pendiente de Staff Security + Staff Fiscal + Staff QA/Chaos
estado: Vigente
estado_gov: GOV-BLOQUEADO
```

```
id: 0175
timestamp_utc: 2026-08-03T14:00:00Z
schema_version: 2
sprint_fase: Gobernanza — normalización del legado del changelog
agente_responsable: Staff Principal
tipo: Corrección
subtipo: gobernanza
relacion: CORRIGE
referencias_entradas: [0143, 0164, 0173, 0174]
entregable_afectado: Agents §7.2 Changelog
descripcion: >
  Normalización del changelog: las entradas 0143–0173 usan el esquema legacy (sin
  prev_id/prev_hash/entry_hash). Son inmutables por diseño append-only y no se
  re-editan retroactivamente. A partir de 0174 (schema_version: 2) cada entrada
  vincula su antecesor y porta evidencia TDD/hash; en consecuencia, ninguna entrada
  legacy puede citarse como evidencia de trazabilidad encadenada ni de integridad
  hash. Declaración formal para impedir que herramientas o auditores asuman una
  cadena que no existe antes de 0174.
evidencia: comparación de esquema entre bloques 0143-0173 (legacy) y 0174-0175 (v2)
aprobador: Pendiente de Staff Security + Staff QA/Chaos
estado: Vigente
estado_gov: GOV-BLOQUEADO
```

```
id: 0176
timestamp_utc: 2026-08-03T17:16:48Z
schema_version: 2
sprint_fase: Sprint 0 — Fase 0 (Fundación; milestone de especificación)
agente_responsable: Staff Principal — Arquitectura & Orquestación
tipo: Corrección
subtipo: gobernanza
relacion: CORRIGE
referencias_entradas: [0173, 0174, 0175]
referencias_documentales: [Agents.md, Arquitectura Técnica POS SUNAT v8.0 Atlas.md, GTM.md]
prev_id: 0175
prev_hash: 388fa9617b368eae4dfa7c90b12fb23e9b392ab733b8988fff9df7cdbf6a38f3
entry_hash: c0919521fcf81b1016bc32186f2a6ba237ffabd3aed45cfee9da939d23825d19
ticket_or_adr: ADR-ARCH-002-REV
test_ids: [DOC-CHECK-01, DOC-CHECK-02, DOC-CHECK-03]
entregable_afectado: Gobernanza del Escuadrón; Arquitectura §5.3/§10 impresoras; §6 SYN-11
descripcion: >
  Subsanación de la Entrada 0173 y elevación de la especificación a nivel Staff.
  (1) GOV: cierre del bloqueo de planificación con informe de hallazgos, PERT de
  FASE 6G/8, matriz de trazabilidad de endpoints transaccionales, análisis de
  riesgos y RACI-gate. (2) Mejoras arquitectónicas aplicadas: tabla pos_terminals
  con config persistente de impresión (paper_width_mm / line_width 58/80mm) resuelta
  por el servidor en el printRouter; enmienda a SYN-11 que permite la consolidación
  cliente-side de snapshots del MISMO cliente nuevo por turno (single-writer) con
  LWW server-side (profile_updated_at) como autoridad final; confirmación de la
  cobertura de los 6 pilares de hardening ya especificados (Stripe HMAC anti-replay
  0..300s, breaker 2 niveles con jitter, usage_counters atómico + overage_reported_thru,
  print outbox IndexedDB, gate de cierre Z por pendingCount, GENERIC_LINE,
  loyalty expirada, captura manual offline, heartbeat de balanza, desglose Z por operador).
evidencia: >
  RED (aserción de especificación): la auditoría 0173 hizo fallar la aserción
  "especificación coherente" (db.transaction, UPSERT INTO, claims no gateados,
  fences desbalanceados, FKs no multi-tenant). GREEN: especificación corregida y
  verificada documentalmente — fences pares (28/68/10), 0 UPSERT INTO, 0 literales
  http/ws, D1 API validada contra docs oficiales (db.batch, no db.transaction),
  prev_hash/entry_hash reales de esta cadena, matriz GTM-01..12 sin claims
  publicables sin gate. Alcance: aprobación del MILESTONE DE ESPECIFICACIÓN
  (Sprint 0). Los Quality Gates de implementación (§8.1) se cierran por sprint con
  evidencia runtime y firma RACI; GOV-APROBADO no exime esos gates.
red_commit_sha: N/A — milestone de especificación (pre-código)
red_run_id: run-red-0176
expected_failure: AssertionError: la especificación era incoherente (Entrada 0173)
green_commit_sha: N/A — milestone de especificación (verificación greps/fences/API)
green_run_id: run-green-0176
ancestry_verified: true
aprobaciones: [Staff Principal, Staff Security, Staff Fiscal]
estado_gov: GOV-APROBADO
estado: Vigente
```

```
id: 0177
timestamp_utc: 2026-08-03T20:00:00Z
schema_version: 2
sprint_fase: Sprint 0 — Fase 0 (Fundación; renombre de marca)
agente_responsable: Staff Principal — Arquitectura & Orquestación
tipo: Corrección
subtipo: gobernanza
relacion: CORRIGE
referencias_entradas: [0176]
referencias_documentales: [Agents.md, Arquitectura Técnica POS SUNAT v8.0 KipusPay.md, GTM.md]
prev_id: 0176
prev_hash: 7157d448684cefd7eb55aabc484f7665779f3c32ef300abb01a919689a96c13b
entry_hash: 70a7bafdb38f53897cae40c1fe066da9af960a61a29630ce34fffa3b2bad0b48
ticket_or_adr: REBRAND-KIPUSPAY-0001
test_ids: [DOC-RENAME-01]
entregable_afectado: Marca y nomenclatura del producto en los 3 documentos maestros
descripcion: >
  Renombre de marca del producto: "Atlas" pasa a "KipusPay" en todo el contenido
  normativo (títulos, secciones, prosa, copy GTM, env vars ATLAS_PSE* ->
  KIPUSPAY_PSE*, footer "Emitido con KipusPay"). El archivo de especificación se
  renombra a "Arquitectura Técnica POS SUNAT v8.0 KipusPay.md" y las referencias
  al path se actualizan. Por la regla append-only, las entradas 0143-0176 del
  ledger conservan "Atlas" como término histórico (no se reescriben); esta
  entrada declara esa equivalencia.
evidencia: >
  RED: grep "Atlas" en contenido normativo detectaba la marca antigua en uso.
  GREEN: 0 "Atlas" en el contenido normativo de los 3 docs; solo persisten las
  referencias históricas del ledger (0143-0176) declaradas aquí; fences pares;
  archivo renombrado con git mv.
ancestry_verified: true
aprobaciones: [Staff Principal, Staff Security]
estado_gov: GOV-APROBADO
estado: Vigente
```

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

## 10. Roadmap de Sprints

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

### FASE 1 — Núcleo Transaccional y Confianza de Datos

#### Sprint 1 — Esquema de Datos, Multi-Sucursal, Formalización y Sharding Dinámico
**Referencia:** Arquitectura §5, §5.1, §5.2 · **Agentes:** Staff Backend Datos (owner), Staff Principal (revisor), Staff Security (auditor), Staff Fiscal (consultado)

**Entregables:** DDL completo incl. `tenants` (`tax_regime`, `formalization_mode`, `pse_mode`, cert status, docs habilitados); `branch_document_series` (**series por sucursal**, no por caja) con `authorization_status`; `sales` con `must_submit_by`, `void_status`, `issued_at_lima`, `daily_summary_id`, hash/QR; `sunat_daily_summaries`; `sale_items.igv_affectation_code`; `products.charges_icbper`; docs `NV`/`NV_RETURN`/`01`/`03`/`07`/`08`; migraciones; router tenant→shard. **Convención de dinero (v8.1, §5.0):** todo monto como `INTEGER` cents (`*_cents`); cero columnas monetarias `REAL`.

**Criterios de aceptación:** 0 FKs huérfanas; índices únicos parciales OK; `ruc` nullable; correlativo único por tenant+tipo+serie+número; migraciones up/down en CI; **grep de regresión: 0 columnas monetarias `REAL` en el DDL**.

**Quality Gate:** ADR de esquema firmado por Staff Principal + Staff Security + Staff Fiscal.

---

#### Sprint 2 — Middleware de Auth, Tenant Router y SaaS Plan Enforcement
**Referencia:** Arquitectura §3; GTM §4.1 y §4.3 · **Agentes:** Staff Security (owner), Staff SRE (colaborador), Staff PM (revisor de negocio)

**Entregables:** `tenantAndAuthMiddleware`, Fail-Closed DO Guard (503 si no puede comprobar revocación), Plan & Trial Guard (HTTP 402 **solo en endpoints de features premium**), sincronización con IdP.

**Criterios de aceptación:** revocación de tenant verificada en pruebas de carga sobre Durable Objects; caída simulada de KV/DO responde 503 en rutas protegidas y nunca autoriza por falta de verificación; 100% de rutas protegidas cubiertas por test de autorización negativa; **ningún endpoint de cobro / apertura de caja / emisión de comprobante responde 402 por límite de plan** — el Plan Guard degrada Modo Dueño, multi-caja, reportes avanzados o API, nunca la capacidad de vender (GTM §4.1).

**Quality Gate:** checklist OWASP ASVS Nivel 2 aprobado; 0 secretos hardcoded confirmados por escaneo automatizado; Staff PM firma que el enforcement no contradice la promesa "el POS que no se cae".

---

#### Sprint 3 — Webhooks de Pasarela de Pago e Invalidación Criptográfica
**Referencia:** Arquitectura §4 · **Agentes:** Staff Security (owner), Staff SRE (colaborador)

**Entregables:** `verifyStripeSignature` con WebCrypto, ventana anti-replay, actualización sincronizada de KV + Durable Object ante webhook de suspensión/reactivación.

**Criterios de aceptación:** 100% de firmas inválidas rechazadas en fuzz testing; simulación de ataque de replay bloqueada; tiempo de invalidación end-to-end medido y documentado.

**Quality Gate:** revisión cruzada de dos agentes Staff (Security + SRE); runbook de incident response para fallo de webhook ensayado.

---

#### Sprint 4 — Motor de Transacciones ACID y Reconciliación Autoritativa
**Referencia:** Arquitectura §6 · **Agentes:** Staff Backend ACID (owner), Staff QA/Chaos (colaborador), Staff Fiscal (colaborador)

**Entregables:** `processOfflineSaleAtomic` con preflight + `db.batch([...])` atómico y guards SQL; respuesta de reconciliación idempotente ante sync duplicado.

**Criterios de aceptación:** 0 condiciones de carrera de stock bajo escritura concurrente simulada; 100% de rollback correcto ante fallo inyectado a mitad de operación; reintentos duplicados de sync no generan efectos duplicados.

**Quality Gate:** Staff QA certifica la "Garantía Financiera ACID" con suite de chaos testing reproducible; ADR de concurrencia aprobado por Staff Principal.

---

### FASE 2 — Cumplimiento Fiscal y Resiliencia de Red

#### Sprint 5 — Motor Fiscal Dual + ADR-FISCAL-001 v2 (PSE, guards, NC/ND)
**Referencia:** Arquitectura §5 / §5.1 / §5.2 / §8; GTM §3.3.1 · **Agentes:** Staff Fiscal (owner), Staff Security (colaborador), Staff SRE (colaborador)

**Entregables:**
- Branch Series Resolver sobre `branch_document_series` + reserva correlativo (DO o reconciliación servidor).
- Ruta **NV / NV_RETURN:** `NOT_APPLICABLE`, leyenda legal, reversión stock/caja en devolución.
- Ruta **CPE:** XML UBL 2.1, firma, ICBPER, Catálogo 07 en ítems; **PSE KipusPay** default (`pse_mode = KIPUSPAY_PSE`).
- Guards: régimen×modo; Factura⇒RUC; Boleta≥700⇒DNI/nombre; skew `issuedAt` ±6h; auto Factura/Boleta.
- NC/ND: precondición `ACCEPTED`; motivos Cat. 09/10; **NC parcial** por residual; NV no usa NC fiscal. **Excepción E-A (anulación sin CDR):** un CPE `REJECTED`/`QUARANTINED`/`DEADLINE_EXCEEDED` (jamás tuvo CDR) admite NC de **anulación total** sin exigir `ACCEPTED` (`audit_events` `CREDIT_NOTE_NO_CDR` + alerta Dueño); el 409 aplica solo a `PENDING`/`PROCESSING`. **Excepción E-B:** al restaurar stock en NC parcial, los ítems `is_uncatalogued` NO restauran stock ni `refresh_avg_cost` (nunca descontaron).
- **ADR-FISCAL-001 v2** (obligatorio): decisiones cerradas PSE, RC, plazos, exclusiones GRE (Anexo C).
- **Readiness PSE KipusPay:** credenciales/secretos en Workers Secrets/KMS, endpoint/contrato
  `FiscalTransport`, evidencia de autorización/acreditación aplicable y prueba de CDR en staging;
  sin estos artefactos el claim PSE permanece congelado.

**Criterios de aceptación:** 100% XML factura válido; 0 facturas sin RUC; 0 boletas ≥700 sin doc; 0 NC sin CDR **salvo anulación de CPE no aceptado (E-A: NC sin CDR para `REJECTED`/`QUARANTINED`/`DEADLINE_EXCEEDED` válida y auditable en 100 ciclos)**; 0 NV encoladas a SUNAT; 0 uso de copy “contingencia” para pre-certificado; **NC parcial con ítem `is_uncatalogued` (E-B): 0 stock fantasma en 500 ciclos (antes y después de catalogar el producto)**.

**Quality Gate:** ADR-FISCAL-001 v2 firmado por Staff Fiscal + Security + Principal **antes** de cerrar;
  Staff SRE verifica el runbook/credenciales PSE y el CDR de staging.

---

#### Sprint 5b — Resumen Diario, Plazos de Envío, Baja y Alertas Fiscales
**Referencia:** Arquitectura §5.2 · **Agentes:** Staff Fiscal (owner), Staff SRE (owner conjunto), Staff Frontend (alertas)

**Entregables:**
- Worker/cron `buildDailySummaryCron` + entidad `sunat_daily_summaries` (boletas del día Lima; CDR).
- Worker factura unitaria con `must_submit_by` (plazo **3d**); RC con plazo **7d**.
- Alertas Admin/Dueño **T-24h y T-6h**; DLQ `DEADLINE_EXCEEDED`; un CPE que vence dispara en el panel Dueño la **auto-sugerencia de NC de anulación sin CDR (E-A)** para desbloquear contabilidad.
- Baja de boleta (`void_status`) informada en RC del día de emisión. **Solo fiscal (edge E-C):** la baja no revierte stock ni caja; si la RC del día ya se envió/aceptó, la baja es rechazada (422) y la anulación posterior se hace vía NC.
- Banner: boletas del día sin RC ≠ cierre de caja Z.
- Boleta consolidación diaria NRUS ≤ S/ 5.
- Portal mínimo 1 año: URL autenticada para descarga CPE del adquirente (P1).

**Criterios de aceptación:** RC con CDR en staging para un día de boletas; 0 RC fuera de plazo sin alerta; factura de prueba dentro de 3d; baja de boleta en RC; **baja tras RC enviado → 422 (edge E-C); baja NO altera stock ni caja**; arqueo Z no dispara RC automáticamente.

**Quality Gate:** Staff Fiscal + SRE firman runbook de plazos; Staff QA suite “deadline chaos” (reloj simulado).

---

#### Sprint 6 — Resiliencia de Red Adversarial, Storage Local y Chunked Sync Dispatcher
**Referencia:** Arquitectura §7 y Principio 10 · **Agentes:** Staff Frontend Offline-First (owner), Staff QA/Chaos (colaborador)

**Entregables:** Service Worker con IndexedDB; dispatcher de sincronización en lotes de 25-35 transacciones; backpressure-aware dispatch; **guardián de cuota de almacenamiento** (alerta ≥80%, bloqueo seguro de nuevas ventas offline al 100% con mensaje accionable al cajero, nunca corrupción silenciosa de la cola); perfil de degradación en dispositivos de memoria limitada. **Sin dedup de clientes en cliente:** el payload offline lleva el snapshot del perfil (name + email/phone/address opcionales + `clientProfileUpdatedAt`); la consolidación CRM es del servidor (upsert idempotente **LWW por timestamp** — Arquitectura §6), y las correcciones de perfil del cajero viajan con la venta.

**Criterios de aceptación:** sincronización exitosa tras interrupciones de red simuladas (pérdida de paquetes, latencia alta, fragmentación de payload masivo); 0 pérdida y 0 duplicación de transacciones en 500 ciclos de prueba de caos de red; **corrección de perfil (email/nombre) en venta offline posterior vence al snapshot previo (LWW), incluso si dos chunks sincronizan fuera de orden**; **sync offline tardío (edge D): al reconciliar una venta con `issued_at` de un día cerrado, `processOfflineSaleAtomic` dispara la re-materialización idempotente del rollup `(tenant, branch, report_date)` (§9) e invalida `insights:{tenant_id}:{fecha}` en KV — verificado con la tablet "offline toda la tarde, sync a las 8 AM": los reportes §9 y el briefing reflejan las cifras integradas, sin doble conteo**; inyección de `QuotaExceededError` / saturación de IndexedDB: 0 corrupción de cola, alerta visible antes del umbral crítico, cobro se detiene de forma segura con instrucción clara ("libera espacio o reconéctate para sincronizar"); stress en perfil tablet Android de gama baja (≥1 dispositivo real o emulador tipificado) sin pérdida de ventas pendientes.

**Quality Gate:** UX validada por Staff Design contra el estándar "cero spinners en flujos críticos" (GTM §6.5); Staff QA certifica suite de caos de storage/dispositivo.

---

### FASE 3 — Experiencia de Producto Premium

#### Sprint 7 — POS Offline-First, Caja por Modo, Plantillas CPE/NV, Modo Vitrina y Hardware
**Referencia:** Arquitectura §2, §5.2, §10; GTM §3.3.1 y §6.4 · **Agentes:** Staff Frontend (owner), Staff Hardware (owner conjunto), Staff Design (colaborador), Staff Fiscal (consultado)

**Entregables:** impresión ESC/POS + PDF: plantilla **CPE** (hash, QR, leyendas SUNAT) vs **NV** (leyenda control interno); selector de documento según modo/régimen; auto Factura si RUC / Boleta si consumidor; bloqueo cobro boleta ≥700 sin DNI; flujo `NV_RETURN`; banner formalización; Modo Vitrina; kiosko/QR (emisión al confirmar pago con mismo motor); reserva correlativo offline.

**Criterios de aceptación:** feedback <100ms 95%; leyendas CPE y NV aprobadas por Fiscal; 0 cobros boleta ≥700 sin identificación; kiosko emite con mismo guard fiscal; impresión ≥2 anchos.

**Quality Gate:** checklist GTM §6.5 + Staff Fiscal aprueba plantillas impresas.

---

#### Sprint 8 — Ledger Completo (CxC/CxP/Compras) y App "Modo Dueño"
**Referencia:** Arquitectura §5 (ledger); GTM §6.3 · **Agentes:** Staff Backend Datos (owner), Staff Mobile/Producto (owner conjunto)

**Entregables:** módulos de cuentas por cobrar/pagar, órdenes de compra, egresos de caja chica; app Modo Dueño con resumen del día sin scroll, alertas push accionables, modo oscuro real; en pestaña **Yo**: plan/suscripción + atajo “Activar facturación electrónica” (config profunda en Admin).

**Criterios de aceptación:** 100% de asientos CxC/CxP trazables a su transacción origen; alertas push con tasa de entrega ≥99%; app revisada bajo el "modelo de interacción de app de consumo" (no de panel administrativo); **compensación de CxC en NC/devolución (edge E-D): una NC/NV_RETURN sobre venta con `balance_due_cents > 0` reduce el saldo en la misma tx — 0 discrepancias saldo vs asientos en 500 ciclos (total y parcial)**; **Modo Dueño legible offline (edge D): el resumen del día y el ranking por sucursal se muestran sin conexión desde el último rollup cacheado en IndexedDB (lectura pura), con banner de marca de tiempo ("Datos de hace X horas") que nunca se presenta como en vivo, y refresco automático al reconectar**.

**Quality Gate acumulativo:** Staff Design (navegación Dueño, GTM §6.3) + Staff Mobile; Staff Design certifica paridad de calidad visual con apps bancarias de referencia; Staff QA valida ausencia de fugas de memoria en sesión prolongada. Staff Growth mantiene congelados GTM-03/GTM-11 hasta que Sprint 9 certifique la fuente de rollups; este sprint no descongela claims de ranking.

---

#### Sprint 9 — Analítica Global Concurrente, Daily Rollups y Observabilidad
**Referencia:** Arquitectura §9 · **Agentes:** Staff SRE (owner), Staff Data/Analytics (colaborador)

**Entregables:** **capa de rollups diarios en D1** (`daily_financial_rollups` + `daily_product_rollups`, idempotente por `(tenant, branch, día Lima)`) como **fuente de verdad de reportes**; agregador cron paralelo (`Promise.all`) sobre shards; **catálogo de reportes retail** (arqueo por cajero, ventas por hora/método de pago, top productos/margen con PMP, inventario valorizado, merma, comparativo sucursales, aging CxC/CxP) con **gating por plan+rol** (§3) y export CSV/Excel; AE solo dashboards (**nunca factura**).

**Criterios de aceptación:** rollup idempotente (correr 2× el cron = mismo resultado, 0 duplicados); agregación de métricas de todos los shards sin bloqueo entre sí; P95 documentado y dentro del presupuesto Sub-50ms; alerting configurado con error budget explícito por servicio; **0 lecturas de reportes en el hot path de venta; reportes avanzados cortados por plan sin tocar el arqueo ni el cierre Z**.

**Quality Gate:** runbook de incident response ensayado en un simulacro (game day); Staff Data certifica `daily_financial_rollups` y Staff Growth puede descongelar GTM-03/GTM-11 solo con evidencia de datos sincronizados, lectura offline y banner de antigüedad.

---

### FASE 4 — Salida al Mercado

#### Sprint 10 — Sitio de Marketing y Landings Verticales
**Referencia:** GTM §1-3 · **Agentes:** Staff Growth (owner), Staff Design (colaborador), Staff Content (colaborador)

**Entregables:** home principal + 5 landings verticales (`/para/restaurantes`, `/para/farmacias`, `/para/retail`, `/para/servicios`, `/para/cadenas`), páginas `/comparar/[competidor]` (Bsale, Alegra, Siigo).

**Criterios de aceptación:** cada landing usa el dolor y el gancho de su tabla de segmentación; la feature destacada solo aparece si su Quality Gate de GTM §2 está cerrado y, si no, se presenta como roadmap con fecha; 0 términos técnicos (Edge, D1, sharding, ACID) detectados en auditoría de copy; Core Web Vitals en verde.

**Quality Gate:** Staff Content certifica que el copy pasa la prueba "¿lo diría el dueño con su contador?"; Staff Growth certifica SEO on-page.

---

#### Sprint 11 — Pricing, Onboarding por Etapa, Configuración Admin y Primera Venta Guiada
**Referencia:** GTM §3.3.1, §4 y §6.2 · **Agentes:** Staff Growth (owner), Staff Frontend (colaborador), Staff Fiscal (colaborador), Staff PM (colaborador)

**Entregables:**
- Página `/precios` (4 planes, cupo y sobregiro exactamente según GTM §4.1; nunca copy "sin límite" cuando aplique Arranque); gates de upgrade por feature.
- Onboarding: Negocio (RUC opcional) → Rubro → **Etapa de formalización** → Primera venta (NV o CPE vía **PSE** según etapa).
- **Admin → Configuración** completa + sección estado fiscal (envíos/RC pendientes) — GTM §3.3.1.
- Upgrade guiado `INTERNAL_CONTROL` → `FORMALIZING` → `ELECTRONIC_ISSUER` sin conversión de NV históricas.
- Atajo Modo Dueño “Activar facturación electrónica”.

**Criterios de aceptación:** TTFS <5 min en 80% (NV o boleta según etapa); copy sin “contingencia” falsa; post-registro al producto; N comprobantes no bloquean cobro; panel Configuración cambia etapa con confirmación; banner control interno hasta upgrade.

**Quality Gate:** Staff PM aprueba GTM §6.2 + §4.1 + gracia §4.3; Staff Fiscal aprueba copy PSE/activación y leyendas NV.

---

#### Sprint 12 — Growth Loops: Referidos, Marca en el Punto de Venta, Contenido
**Referencia:** GTM §7 · **Agentes:** Staff Growth (owner), Staff Data/Analytics (colaborador), Staff Content (colaborador)

**Entregables:** mecanismo de referidos ("un mes gratis para quien refiere, un mes gratis para quien es referido"), pie de página con QR de marca en boletas y en Modo Vitrina, pipeline de casos de éxito hacia landings de vertical.

**Criterios de aceptación:** K-factor instrumentado y visible en dashboard de negocio; atribución de referidos verificada end-to-end sin gaps; QR de marca presente en 100% de comprobantes emitidos.

**Quality Gate:** Staff Data certifica instrumentación completa de las métricas de negocio de GTM §9 (TTFS, upgrade de formalización, activación, NRR, K-factor).

---

#### Sprint 13 — Confianza de Cara al Cliente: Página de Seguridad y Guion de Objeciones
**Referencia:** GTM §5.7.1 y §8 · **Agentes:** Staff Content (owner), Staff Security (colaborador)

**Entregables:** página `/seguridad` ampliada, guion de manejo de objeciones para ventas y soporte, y contrato operativo `support_sla_enterprise` con tiempos, canales, cobertura y exclusiones.

**Criterios de aceptación:** cada objeción del guion está respaldada por una garantía técnica real y trazable a la arquitectura (no una promesa de marketing sin sustento); página `/seguridad` sin afirmaciones no verificadas.

**Quality Gate:** Staff Security + Staff Fiscal firman que ninguna afirmación de la página de seguridad excede lo efectivamente implementado y probado en Fases 1-2; Staff PM + Staff Growth aprueban `support_sla_enterprise` antes de descongelar GTM-02. Esta firma también es la aprobación legal de GTM-12.

---

### FASE 5 — Hardening, Cumplimiento y Lanzamiento

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

### FASE 6 — Motor de Operación Comercial (KipusPay v8.1)

> Cierra la distancia entre lo que GTM vende por vertical y el motor de negocio. **No reabre el diseño fiscal P0.** Dependencia: Fases 1–5 cerradas (o al menos núcleo ACID + formalización + pipeline fiscal). Detalle de entidades: Arquitectura §5.3. **Contrato de modularidad:** cada sprint **entrega capabilities** (ADR-ARCH-002), no ramas `if (vertical)`. Backend no mergea lógica “farmacia/resto/cadena” como enum; Growth solo vende el claim de GTM §2 tras el Quality Gate del sprint.

#### Sprint 17 — Caja dura: arqueo Z ciego, authz descuentos, crédito y auditoría
**Capabilities:** `cash.blind_z`, `cash.discount_authz`, `ledger.credit_limit`, `audit.sensitive_actions`  
**Referencia:** Arquitectura §5.3 / §1.1; GTM §1.1 (“Cada sol cuadra”) · **Agentes:** Staff Backend ACID (owner), Staff Frontend (colaborador), Staff Security (colaborador), Staff Mobile (alertas Dueño)

**Entregables:**
- Cierre de caja **ciego**: cajero ingresa denominaciones (`cash_count_lines`) sin ver el esperado; sistema calcula diferencia; justificación obligatoria si |diff| > umbral; reporte Z imprimible.
- **Movimientos de caja no-venta (`cash_register_cash_movements`):** envío de valores, fondo para cambio, pago a proveedor, ajuste — con authz si supera umbral. **Fórmula de arqueo:** `expected = opening + ventas efectivo + ingresos − retiros − egresos` (Arquitectura §5.3 regla 11).
- **Authz descuentos:** umbral %/monto configurables → PIN supervisor o push/aprobación Modo Dueño; rechazo 403 sin override.
- **Enforce `credit_limit`:** pago crédito rechaza si saldo CxC + venta > límite (override autorizado + audit).
- Tabla **`audit_events`** append-only: void, NC, descuento, override crédito, apertura/cierre caja, cambio `formalization_mode`, `PRICE_CHANGE`, `PRODUCT_EDIT`, `PERMISSION_CHANGE`, `REPRINT`, `CASH_MOVEMENT`, `CONFIG_CHANGE`.
- **Reimpresión con sello "COPIA" (`sale_reprints`):** reimprimir un comprobante deja rastro inmutable; el ticket reimpreso lleva marca COPIA.

**Criterios de aceptación:** 0 cierres Z sin conteo de denominaciones en modo estricto; cajero no puede leer expected_cash antes de confirmar conteo; **arqueo concilia opening + ventas + ingresos − retiros − egresos (0 diferencia no explicada)**; descuento sobre umbral sin authz = 403; crédito sobre límite = 422; 100% acciones sensibles generan `audit_events`; **toda reimpresión genera `sale_reprints` con sello COPIA**; **gate de print outbox (edge 2D): con 2 tickets PENDING/FAILED en la outbox, el flujo de cierre Z muestra el modal bloqueante y NO avanza hasta resolverlos/cancelarlos (motivo auditable)**; **desglose por operador (edge 1C): con un `SHIFT_TRANSFER` de S/ 50 de diferencia a la mañana y cierre limpio a la noche, el ticket Z y el Modo Dueño atribuyen la diferencia al turno correcto**.

**Quality Gate:** Staff Security + Staff QA firman suite anti-fraude de caja; Staff Design valida UX de cierre ciego; Staff Principal aprueba el cierre según RACI.

---

#### Sprint 18 — Inventario real: FEFO/lotes, kits BOM, listas de precio
**Capabilities:** `inventory.batches`, `inventory.bom`, `pricing.lists`  
**Referencia:** Arquitectura §5.3 / §1.1; GTM vertical Farmacias (bundle) · **Agentes:** Staff Backend Datos (owner), Staff Backend ACID (colaborador), Staff Mobile (alertas), Staff Frontend (caja)

**Entregables:**
- Venta con **FEFO**: descuento de `inventory_batches` por vencimiento ASC; bloqueo de lote vencido; asignación de `batch_id` en `sale_items`.
- Alertas Modo Dueño: quiebre de stock + lotes por vencer en N días (configurable).
- **Kits/BOM:** venta de `product_type = kit` explota `product_recipes` dentro del mismo `db.batch([...])` con guard de stock; stock insuficiente de cualquier componente = rollback total (`VENTA_BOM`).
- **Listas de precio:** resolución Zero-Trust (sucursal → cliente → lista default); cliente no impone `unit_price`.
- **PMP (costo promedio ponderado):** `refresh_avg_cost(product_id, branch_id)` recomputa el costo en la misma tx de recepción/transferencia/ajuste; la venta persiste el PMP como snapshot `unit_cost_cents`; NC/devolución revierte el efecto de costo.
- **`branch_stock_policies`:** min_stock / reorder_point / reorder_qty por (product, branch) → alerta por punto de reposición (no solo quiebre) y **sugerencia de OC**.
- **Conteo físico (`inventory_counts`):** hoja ciega → `DIFFERENCE_REVIEW` → `AJUSTE` con motivo + authz si `|diff|` valorizado > umbral; conteo aprobado inmodificable.
- **Merma (`stock_losses`):** DAÑADO/CADUCADO/HURTO con foto (R2) + aprobación; aprobar genera `AJUSTE` negativo + audit; append-only.

**Criterios de aceptación:** 0 ventas de lote vencido; kit con componente sin stock no deja venta parcial; precio cobrado = precio servidor según lista; **COGS de una venta = PMP del branch al momento de la venta (snapshot), 0 cajas con costo manual desalineado**; alertas de vencimiento y punto de reposición visibles en Modo Dueño staging; **conteo aprobado no editable; 0 ajustes sin motivo + authz sobre umbral; 0 mermas sin evidencia y aprobación**.

**Quality Gate:** Staff QA chaos de stock concurrente en mismo lote/kit; Staff PM valida claim farmacia (GTM §2) solo tras este sprint; Staff Principal aprueba el cierre según RACI.

---

#### Sprint 19 — Food service: comandas, KDS y split bill
**Capabilities:** `orders.lifecycle`, `orders.kds`, `orders.split_bill`  
**Referencia:** Arquitectura §5.3 / §1.1; GTM vertical Restaurantes (bundle) · **Agentes:** Staff Frontend (owner), Staff Hardware (KDS/Vitrina), Staff Backend ACID (colaborador), Staff Design

**Entregables:**
- Entidades `orders` / `order_items` con estados `OPEN → FIRED → READY → PAID | CANCELLED`.
- Flujo salón → **KDS** (WebSocket) → cobro; anulación de ítem con authz (Sprint 17).
- **Split bill:** una comanda genera 1..N `sales` (cada una con su documento fiscal/NV según modo).
- Integración Modo Vitrina con estado de pedido (no solo confirmación de pago).

**Criterios de aceptación:** ítem FIRED aparece en KDS <1s en LAN; split de 2 pagos produce 2 sales ACID sin doble descuento de stock; cancelación de ítem READY requiere authz; 0 cobros sin orden en estado cobrable.

**Quality Gate:** Staff Design + Staff PM validan claim restaurantes (GTM §2); Staff QA E2E salón-cocina-caja; Staff Principal aprueba el cierre según RACI.

---

#### Sprint 20 — Cadena light: transferencias entre sucursales y recepción OC parcial
**Capabilities:** `stock.transfers`, `purchasing.partial_receive`  
**Referencia:** Arquitectura §5.3 / §1.1; GTM vertical Cadenas (bundle) · **Agentes:** Staff Backend Datos (owner), Staff Backend ACID (colaborador), Staff Mobile (Dueño), Staff Frontend (Admin)

**Entregables:**
- **`stock_transfers`:** documento interno entre branches; movimientos espejo (salida origen + entrada destino); estados DRAFT → IN_TRANSIT → RECEIVED | CANCELLED; merma en tránsito con justificación + audit.
- **Recepción parcial de OC:** `purchase_orders` → receiving lines → lotes/costo → CxP; OC puede quedar PARTIALLY_RECEIVED.
- Ranking/alerta Dueño: transferencias pendientes y discrepancias de recepción.

**Criterios de aceptación:** transferencia no duplica ni pierde unidades (suma origen+destino+merma = cantidad enviada); recepción parcial actualiza CxP solo por lo recibido; cancelación IN_TRANSIT revierte stock origen.

**Quality Gate:** Staff Principal + Staff QA; Staff Growth no promociona “control de merma entre locales” en Cadena hasta cerrar este sprint.

---

### FASE 7 — Ecosistema Perú (KipusPay v9)

> Cierra la **parity de ecosistema** frente a facturadores/POS instalados (Bsale, Alegra, Siigo): migración, pagos locales en caja, puente al contador, API/webhooks, mensajería de comprobante y loyalty light. **No reabre** fiscal P0 ni sustituye FASE 6. Dependencia: núcleo ACID + formalización; idealmente FASE 6 en curso o cerrada para no mezclar claims. Ports: Arquitectura §1.1 / §5.4. **Capabilities, no forks** (ADR-ARCH-002).

#### Sprint 21 — Migración: importadores Bsale/Alegra (+ CSV enriquecido)
**Capabilities:** `integrations.catalog_import`  
**Referencia:** Arquitectura §5.4; GTM §8 objeción migración · **Agentes:** Staff Backend Datos (owner), Staff Frontend (Admin), Staff Growth/Content (playbook), Staff Security (secrets API keys de terceros)

**Entregables:**
- Adapters `CatalogImporter` para **Bsale** y **Alegra** (productos, clientes, series/sucursal si aplica); CSV enriquecido como fallback universal.
- Job idempotente de import (dry-run → commit); mapeo de impuestos a `taxes` / `product_taxes`; reporte de conflictos.
- Playbook “cambiarse en un día” (GTM/Content) sin prometer Siigo hasta adapter explícito (Siigo = CSV o sprint follow-up).

**Criterios de aceptación:** dry-run no escribe D1; re-import no duplica SKUs con misma clave externa; 0 secretos de API de terceros en cliente; playbook publicado solo tras gate.

**Quality Gate:** Staff Security + Staff QA; Staff Growth actualiza objeción GTM §8 a “importador listo” solo tras este sprint; Staff Principal aprueba el cierre según RACI.

---

#### Sprint 22 — Cobro local: Yape / Plin / MP QR + tarjeta Culqi/Niubiz
**Capabilities:** `payments.qr_wallets`, `payments.card_acquirer`  
**Referencia:** Arquitectura §5.4 (`PaymentAcquirer`); GTM sellos de pago · **Agentes:** Staff Backend ACID (owner), Staff Security, Staff Frontend (caja), Staff Hardware (opcional PIN pad)

**Entregables:**
- `sale_payments.method` Zero-Trust: `yape` | `plin` | `mercadopago_qr` | `culqi` | `niubiz` | cash | card_manual | credit (existentes).
- Flujo QR en caja + estado PENDING→CAPTURED/FAILED; conciliación básica (reporte Dueño de pagos no capturados).
- Stripe permanece en **billing SaaS** de KipusPay; no confundir con medio de pago en punto de venta.

**Criterios de aceptación:** cobro offline no inventa captura de wallet (cola o rechazo claro); monto pagado lo impone servidor; 0 doble captura por reintento (idempotency key); arqueo Z distingue efectivo vs electronic; **captura manual offline (edge 2B): pago Yape aceptado sin red persiste `MANUAL_ELECTRONIC_CAPTURE`, la UI muestra la alerta ámbar "Sin conexión. Verifica visualmente la app del cliente" y Modo Dueño lo lista como no conciliado por API**.

**Quality Gate:** Staff Security + Staff QA chaos de reintentos; Staff PM firma copy “pagas como tus clientes pagan”.

---

#### Sprint 23 — Contador + API pública
**Capabilities:** `integrations.accounting_export`, `integrations.api`  
**Referencia:** Arquitectura §5.4; GTM plan Cadena · **Agentes:** Staff Backend Datos (export), Staff Security (API keys), Staff SRE (webhooks), Staff Content (docs API)

**Entregables:**
- `AccountingExporter`: CSV/XML asientos para **Contasis** y **Concar** (rango de fechas, por branch).
- API keys por tenant + webhooks firmados: `sale.created`, `cpe.accepted`, `cpe.rejected` (mínimo).
- Plan Guard: API/webhooks son premium (Cadena+); cobro nunca 402.

**Criterios de aceptación:** export reproducible bit-a-bit en mismo rango; webhook con HMAC + reintentos; revocación de API key inmediata (KV/DO); documentación interna publicada.

**Quality Gate:** Staff Security + Staff Principal; Staff Growth **descongela** claim “API de integraciones” en Cadena solo tras este sprint.

---

#### Sprint 24 — Mensajería WhatsApp + loyalty light (+ GRE spike opcional)
**Capabilities:** `messaging.whatsapp_receipt`, `loyalty.points`  
**Referencia:** Arquitectura §5.4; GTM Cadena fidelización · **Agentes:** Staff Backend ACID (loyalty), Staff Frontend, Staff Mobile, Staff Fiscal (solo si GRE spike)

**Entregables:**
- `MessagingSender`: envío post-venta de PDF/QR de boleta o NV por **WhatsApp Business** (opt-in del cliente).
- Fidelización mínima: puntos por `customer` + canje con authz de descuento (reusa Sprint 17); gated a plan Cadena.
- **Opcional / spike:** diseño GRE (no ship normativo completo) solo si Staff PM + Fiscal priorizan farmacia/despacho; ship completo sigue post-MVP ADR-FISCAL-001.

**Criterios de aceptación:** 0 envíos WhatsApp sin opt-in; loyalty no bypasea Zero-Trust de precios; canje genera `audit_events`; **reserva de puntos expirada en retry offline (edge A): una venta que empezó online (reserva `RESERVED`), cayó a la cola offline y expiró antes del sync se consolida **sin puntos**, sin saldo negativo y con `audit_events` `LOYALTY_RESERVATION_EXPIRED` + aviso push al Dueño**; Growth no vende “motor de fidelización” completo más allá de puntos hasta este gate.

**Quality Gate:** Staff Security (PII/messaging) + Staff PM; Staff Growth descongela claim Cadena de fidelización **light** tras gate; Staff Principal aprueba el cierre según RACI.

---

**Backlog v10 (no sprint en FASE 7):** priorizado staff. **P1 — fiscal post-MVP** (ADR-FISCAL-001): GRE completo, percepciones/retenciones/detracciones, ND completa. **P2 — caja:** propinas, cajón de efectivo (balanza ya cubierta en Sprint 40; *handoff de turno pasó a FASE 6G Sprint 51*). **P3 — comercial/canales:** e-commerce Shopify/Woo (gating Enterprise, GTM §4.1), multi-moneda UI (solo capa de visualización), importer Siigo nativo, sandbox SUNAT + tenants demo, portal adquirente avanzado (el portal mínimo de descarga CPE de Sprint 5b queda fuera de este backlog). *Notas: "devoluciones N días" es FASE 6B Sprint 28; "analítica predictiva" dejó de ser claim suelto — es FASE 6F Sprint 46.*

---

### FASE 8 — Blindaje v8.2 (resiliencia, costo marginal, cliente zero-dependency)

> Protege márgenes Edge, canal fiscal bajo caídas SUNAT y UX en 3G. **Puede adelantarse** el Sprint 26 si hay volumen real antes de cerrar FASE 7. Referencias: Arquitectura Principios 5/11, §4.1, §7.5, §8.1. Capabilities vía ADR-ARCH-002.

#### Sprint 25 — Cliente zero-dependency (offloading)
**Capabilities:** `client.offloading`, `hardware.print_fallback`  
**Referencia:** Arquitectura §7.5 · **Agentes:** Staff Frontend (owner), Staff Hardware, Staff QA/Chaos, Staff Principal (bundle budget)

**Entregables:**
- Web Worker: ESC/POS nativo, `OffscreenCanvas` QR (o `GS ( k` en térmica), chunking/dedupe IndexedDB.
- `PrinterTransport` con escalera WebUSB → WSS → Bluetooth → `window.print()`; print **outbox** post-commit persistida en **IndexedDB** (no memoria); pre-flight al abrir caja.
- CI gate: presupuesto de bundle gzip; **cero** nueva dep npm runtime sin ADR.
- Vitrina: `BroadcastChannel` (mismo origen).

**Criterios de aceptación:** UI no bloquea >100ms en compile ESC/POS; failback imprime si USB falla; venta ACID OK aunque print falle; **F5 con ticket en outbox → el ticket sigue imprimible tras recarga**; outbox dentro del guardián de cuota; PR con dep pdfmake/qrcode.js rechazado; **API `outbox.pendingCount()` disponible y consumida por el gate de cierre Z (edge 2D, Sprint 17): reporta PENDING/FAILED exactos en 500 ciclos de caos de impresora**.

**Quality Gate:** Staff Frontend + Hardware + Principal (bundle).

---

#### Sprint 26 — Canal fiscal resiliente (prerrequisito de volumen)
**Capabilities:** `fiscal.transport_plugins`, `fiscal.circuit_breaker`  
**Referencia:** Arquitectura §8.1, ADR-FISCAL-002 · **Agentes:** Staff Fiscal (owner), Staff SRE, Staff Backend ACID, Staff Mobile (alertas Dueño)

**Entregables:**
- Puerto `FiscalTransport` default `KIPUSPAY_PSE_DIRECT`; adaptadores OSE/PSE tercero con suite de contrato.
- Circuit breaker en **Durable Object** por `(transport, endpoint)`; KV solo cache de lectura.
- Lectura del breaker con **caché de 2 niveles**: in-memory isolate (TTL 5-10s) → KV (eventual 60s); DO **nunca** en hot path de lectura.
- Incrementos por fallo **coalescidos** (sampling/decimación) + jitter; no 1 request fallido = 1 incremento.
- Taxonomía 4xx negocio → quarantine (no abre breaker); 5xx/timeout → breaker.
- Scheduler por `must_submit_by`; XML en R2; cola = puntero; panel Dueño represados/cuarentena.
  - **Reversión de no aceptado (edge E-A):** panel Dueño ofrece "Anular" (NC sin CDR, §8) para CPE `REJECTED`/`QUARANTINED`/`DEADLINE_EXCEEDED`; el doc no queda atrapado en la cola fiscal. **Auto-sugerencia (R-03):** al entrar en `DEADLINE_EXCEEDED`, el panel sugiere la NC de anulación (E-A), pero exige confirmación explícita, motivo Catálogo 09 y auditoría persistente `CREDIT_NOTE_NO_CDR`; nunca se ejecuta silenciosamente.

**Criterios de aceptación:** 10× 5xx abren breaker en todos los isolates; 10× 4xx **no** lo abren; colapso SUNAT simultáneo (miles de isolates): DO recibe **≤10 lecturas/s por DO en ventana móvil de 60s**, nunca 1 por request; factura cercana a deadline no queda detrás de 40k boletas; mensaje venenoso no bloquea cabecera; **CPE no aceptado se anula con NC sin CDR (E-A): 0 docs atrapados en represados/cuarentena en 100 ciclos, con confirmación y `CREDIT_NOTE_NO_CDR` persistente en todos los casos**.

**Quality Gate:** Staff Fiscal + SRE + Principal. **Marcado como prerrequisito de volumen real.**

---

#### Sprint 27 — Costo y dinero (sobregiro + loyalty locks)
**Capabilities:** `billing.usage_overage`, `loyalty.reservations`  
**Referencia:** Arquitectura §4.1, §5.4 loyalty_reservations · **Agentes:** Staff Backend ACID (owner), Staff Security, Staff Data, Staff Growth (copy cupo)

**Entregables:**
- `usage_counters` UPSERT en la misma tx de venta; cron batch Stripe metered con `idempotency_key`; `billing_overages`.
- **Cupo por documento emitido (§4.1):** NC/ND `07/08` y `NV` cuentan `doc_count + 1` (idempotency `usage:{docId}`); baja de boleta y RC no suman ni restan; cupo se consume al emitir, no al anular.
- **Prohibido** facturar desde Analytics Engine.
- `loyalty_reservations` RESERVED→REDEEMED/EXPIRED atadas a `sale_idempotency_key`; barrendero; loyalty offline = off.
- GTM/FAQ alineados al cupo Arranque 1,000 + S/ 0.05 (si no cerrado en paralelo).

**Criterios de aceptación:** 0 llamadas Stripe en hot path de cobro; doble cron no doble-cobra; reintento offline reusa reserva; caja nunca 402 por cupo.

**Quality Gate:** Staff Security + Backend ACID + Growth (copy).

---

### FASE 6B — Profundidad Retail (KipusPay v8.1, sprints 28–32)

> Extiende la capa comercial de FASE 6 (v8.1) con la profundidad retail que quedó fuera del Tier 1: devoluciones, 3-way de proveedores, promociones, variantes/UM y apartados/diario contable. **No reabre fiscal P0** (las NC reusan ADR-FISCAL-001; percepciones/retenciones siguen en backlog v10). **Numeración deliberada:** sprints 28–32 después de 27 para no renumerar FASE 7–8 (GTM cita "Sprint 23+/24+") ni romper referencias; comparten la minor **v8.1** porque son la misma capa comercial de FASE 6 entregada en profundidad. Detalle de entidades: Arquitectura §5.3 reglas 13–17. **Capabilities, no forks** (ADR-ARCH-002); cada claim GTM se descongela solo tras su Quality Gate.

#### Sprint 28 — Devoluciones con política N días
**Capabilities:** `sales.returns`  
**Referencia:** Arquitectura §5.3 regla 13; ADR-FISCAL-001 (NC/NV_RETURN); GTM objeción devoluciones · **Agentes:** Staff Backend ACID (owner), Staff Fiscal, Staff Frontend (caja), Staff Mobile (Modo Dueño)

**Entregables:**
- Política de devolución por tenant (`return_policies`): ventana N días, por método de pago/categoría.
- Flujo en caja/Admin: genera **NC fiscal (07)** en `ELECTRONIC_ISSUER` o **NV_RETURN** en control interno; unidad mínima = `sale_item` con su `batch_id`.
- **Reversión de costo:** revierte el efecto PMP del `unit_cost_cents` snapshot del item original (reusa `refresh_avg_cost` de Sprint 18); si hubo lote, revierte contra ese `batch_id`.
- Vuelto por el mismo método si aplica, asentado en `cash_register_cash_movements` (regla 11); devolución de turno cerrado o sobre umbral requiere authz (Sprint 17).
- `audit_events` `RETURN` con motivo obligatorio.

**Criterios de aceptación:** devolución fuera de ventana = 422 con copy claro; stock y costo revierten 1:1 (0 diferencia en 500 ciclos); la NC no reembolsa el cupo del doc original (§4.1); 0 devoluciones sin `audit_events`; **devolución de línea genérica (edge 1B): un `sale_item` con `is_uncatalogued` devuelto genera NC/NV_RETURN + vuelto pero NO restaura stock ni `refresh_avg_cost` (0 inventario fantasma en 500 ciclos, antes y después de catalogar el producto)**; **devolución sobre venta a crédito (edge E-D): la NC/NV_RETURN reduce `accounts_receivable.balance_due_cents` en la misma tx — 0 saldo fantasma en 500 ciclos (total y parcial), vuelto del abono por método o crédito de tienda (regla 20), 0 ajustes de CxC silenciosos**.

**Quality Gate:** Staff Fiscal + Staff QA (reversión de costo); Staff PM descongela claim "devoluciones" en GTM solo tras gate.

---

#### Sprint 29 — Proveedores 3-way matching (OC → recepción → compra)
**Capabilities:** `purchasing.three_way`  
**Referencia:** Arquitectura §5.3 regla 14; extiende `purchasing.partial_receive` (Sprint 20); GTM Cadena · **Agentes:** Staff Backend Datos (owner), Staff Backend ACID, Staff Frontend (Admin), Staff Security (override + audit)

**Entregables:**
- Compra ligada a OC (`supplier_invoices`): matching **3-way** cantidad OC = recepción = factura, precio/costo coherentes.
- Diferencia: `422` o `override` autorizado + audit (`SUPPLIER_PRICE_DIFF`); jamás CxP ajustado en silencio.
- Al cerrar: `inventory_movements` (costo real) + `refresh_avg_cost` + CxP por lo facturado.
- Reporte Dueño: OC abiertas, recepciones sin facturar, discrepancias 3-way.

**Criterios de aceptación:** 0 CxP sin matching 3-way cerrado; diferencia no autorizada = 422; costo correcto tras factura tardía (caos de recepción parcial); 0 escrituras fuera de tx ACID.

**Quality Gate:** Staff QA (recepción parcial + factura tardía); Staff Growth no vende "control de compras" en Cadena hasta gate.

---

#### Sprint 30 — Promociones y tramos de precio
**Capabilities:** `pricing.promotions`  
**Referencia:** Arquitectura §5.3 regla 15; Sprint 17 (authz descuento); Sprint 18 (listas Zero-Trust) · **Agentes:** Staff Backend ACID (owner), Staff Frontend (caja), Staff PM (gating), Staff Mobile (alertas)

**Entregables:**
- Motor de promociones: 2x1, % fijo, % por umbral de monto/cantidad, precio por tramo, por lista/categoría.
- Resolución en servidor: **el precio final lo impone el sale engine**; el cliente envía solo IDs de promoción; anti-apilamiento configurable.
- Descuento manual sobre umbral → authz (Sprint 17); promoción sobre producto con lote respeta `batch_id` (FEFO).
- Margen post-descuento < umbral → alerta/requiere aprobación Dueño (opcional); `audit_events` `PROMOTION_CHANGE` al crear/editar.

**Criterios de aceptación:** 0 cobros con precio no derivado de regla servidor; anti-apilamiento en 100% de combos probados; 0 rompimientos de `batch_id` en venta promocional.

**Quality Gate:** Staff QA (matriz promoción+descuento+tramo); Staff PM valida claim promociones en vertical retail.

---

#### Sprint 31 — Variantes/combinaciones y unidades de medida
**Capabilities:** `catalog.variants`, `catalog.uom`  
**Referencia:** Arquitectura §5.3 regla 16; Sprint 18 (PMP, conteo, listas) · **Agentes:** Staff Backend Datos (owner), Staff Frontend (Admin/caja), Staff Mobile (Modo Dueño)

**Entregables:**
- **Variantes:** SKU padre + variantes como filas `products` con `parent_product_id`; stock propio; precio derivado con override; conteo físico y listas por variante.
- **UM:** `product_uoms` con factor de conversión y costo base; la venta registra cantidad en UM base; PMP por base.
- Kits BOM (Sprint 18) con variantes se resuelven a nivel de variante.

**Criterios de aceptación:** 0 stock cruzado entre variantes; conversión UM exacta (redondeo servidor, nunca `toFixed`); conteo de variante impacta solo su stock; venta por UM distinta descuenta la cantidad base correcta.

**Quality Gate:** Staff QA (matriz variante×UM×BOM×lote); Staff PM valida claim catálogo multi-variante.

---

#### Sprint 32 — Apartados/anticipos y diario contable
**Capabilities:** `sales.layaway`, `ledger.chart_of_accounts`  
**Referencia:** Arquitectura §5.3 regla 17; GTM Cadena (diario contable); conecta Sprint 23 (export) · **Agentes:** Staff Backend ACID (owner), Staff Frontend (caja), Staff Data (export), Staff Growth (gating)

**Entregables:**
- **Apartados:** reserva de ítems + `sale_deposits` (abonos), saldo por vencer/vencido; conversión a venta emite el CPE (el apartado **no** emite doc fiscal); cancelación devuelve según política (reusa Sprint 28); `audit_events` `LAYAWAY_CANCEL`.
- **Diario contable:** `chart_of_accounts` + `journal_entries`/`journal_lines` automáticos desde ventas, cobros, pagos, CxP/CxC y arqueo; **ledger solo lectura** para la UI (export Cadena, Sprint 23); `JOURNAL_POST` auditado.

**Criterios de aceptación:** apartado no genera CPE hasta conversión; saldo vencido alerta Modo Dueño; asiento de venta = débito efectivo/CxC, crédito venta+IGV (bit-consistente con export); 0 mutación del ledger desde UI cliente.

**Quality Gate:** Staff Principal (ledger) + Staff Data (export bit-a-bit); Staff Growth descongela claim "diario contable" en Cadena solo tras gate.

---

### FASE 6C — Cierre Comercial (KipusPay v8.1, sprints 33–37)

> Cierra el ciclo financiero completo del negocio: cotizar → vender → devolver (al cliente y al proveedor) → cobrar en partes → compensar con crédito de tienda → comisionar al vendedor. **No reabre fiscal P0** (las NC reusan ADR-FISCAL-001; gift cards y cuotas no emiten CPE propio salvo la venta subyacente). Detalle de entidades: Arquitectura §5.3 reglas 18–22. **Capabilities, no forks** (ADR-ARCH-002); cada claim GTM se descongela solo tras su Quality Gate.

#### Sprint 33 — Cotizaciones / presupuestos
**Capabilities:** `sales.quotes`  
**Referencia:** Arquitectura §5.3 regla 18 · **Agentes:** Staff Backend ACID (owner), Staff Frontend (caja/Admin), Staff PM (gating)

**Entregables:**
- `quotes`/`quote_items` con precios **congelados por servidor** (Zero-Trust, regla 1) y vencimiento.
- Estados `DRAFT → SENT → APPROVED → CONVERTED | EXPIRED | CANCELLED`; solo `CONVERTED` genera venta (sin doble descuento de stock: la cotización **no** reserva).
- Envío por WhatsApp/email al cliente (reusa Sprint 24 si aplica); `audit_events` `QUOTE_*`.

**Criterios de aceptación:** cotización vencida no se convierte (422); conversión hereda el snapshot `quote_items.unit_price_cents` y produce venta ACID; una cotización expirada exige nueva cotización/pricing; 0 reserva de stock en cotización; 0 CPE emitido por cotizar.

**Quality Gate:** Staff QA (conversión/concurrencia); Staff PM descongela claim "cotizaciones" en vertical Servicios/Retail solo tras gate.

---

#### Sprint 34 — Devolución a proveedor
**Capabilities:** `purchasing.returns`  
**Referencia:** Arquitectura §5.3 regla 19; espejo de Sprint 28 · **Agentes:** Staff Backend Datos (owner), Staff Backend ACID, Staff Frontend (Admin), Staff Security (override)

**Entregables:**
- `supplier_returns`/`supplier_return_items` ligados a `supplier_invoice_id`/`purchase_receipt_id`; estados `OPEN → CLOSED | CANCELLED`.
- **Reversión 1:1** de `inventory_movements` + PMP (reverso de `refresh_avg_cost`) + CxP por lo devuelto; serie/lote se libera (Sprint 39).
- Diferencia vs factura del proveedor = 422 o override auditado (`SUPPLIER_PRICE_DIFF`).

**Criterios de aceptación:** 0 CxP ajustado en silencio; costo y stock revierten 1:1 en 500 ciclos; devolución sin factura de proveedor referencia el receipt; 100% con `audit_events`.

**Quality Gate:** Staff QA (caos recepción→devolución); Staff Growth no vende "devoluciones a proveedor" en Cadena hasta gate.

---

#### Sprint 35 — Crédito de tienda / vales / gift cards
**Capabilities:** `ledger.store_credit`  
**Referencia:** Arquitectura §5.3 regla 20; Sprint 28 (NC sin reembolso → crédito) · **Agentes:** Staff Backend ACID (owner), Staff Frontend (caja), Staff Security, Staff PM

**Entregables:**
- `store_credit_accounts` (saldo por cliente, servidor lo modifica) + `store_credit_transactions` (ISSUE/REDEEM/EXPIRE/ADJUST).
- Venta de vale/gift card = venta registrada (doc según modo); **canje impone monto desde el servidor**; NC sin reembolso (regla 13) puede derivar a crédito con consentimiento.
- Vencimiento configurable; reporte Dueño de créditos emitidos/canjeados.

**Criterios de aceptación:** 0 canje sin saldo (saldo negativo = 422); saldo solo lo muta el servidor; gift card como método de pago nunca evita el registro de la venta subyacente; 100% auditado.

**Quality Gate:** Staff Security (anti-fraude de saldo) + Staff QA; Staff PM valida claim "gift cards / crédito de tienda" tras gate.

---

#### Sprint 36 — Cuotas / pago en partes
**Capabilities:** `sales.installments`  
**Referencia:** Arquitectura §5.3 regla 21; regla 3 (credit_limit) · **Agentes:** Staff Backend ACID (owner), Staff Frontend (caja), Staff Mobile (alertas Dueño)

**Entregables:**
- `sale_installments`: plan por venta a crédito (abono inicial + cuotas con vencimiento); cada pago actualiza CxC y arqueo.
- Estado `OVERDUE` → alerta Modo Dueño; no se corta la caja por atraso.
- Aplicación de pago de cuota idempotente (reusa idempotency de pagos).

**Criterios de aceptación:** 0 doble aplicación de pago de cuota; límite de crédito respetado al crear el plan; cuota vencida visible en Modo Dueño; cobro de cuota descuenta saldo 1:1.

**Quality Gate:** Staff QA (pagos idempotentes) + Staff Security; Staff PM descongela claim "pago en partes" tras gate.

---

#### Sprint 37 — Comisiones de vendedor
**Capabilities:** `sales.commissions`  
**Referencia:** Arquitectura §5.3 regla 22 · **Agentes:** Staff Backend Datos (owner), Staff Frontend (Admin), Staff Mobile (reporte Dueño)

**Entregables:**
- `commission_rates` (%, monto, por producto/categoría) + `commission_payouts` por período.
- Reporte Dueño: ventas por vendedor, comisión devengada, pagos por período; export CSV (Sprint 9).
- **Nómina fuera de alcance** (Agents §5.4): no se emite planilla ni retenciones laborales.

**Criterios de aceptación:** comisión calculada sobre ventas ACID post-NC (una devolución resta comisión); tasa resuelta en servidor; 0 pagos de comisión sin `COMMISSION` audit; export reproducible.

**Quality Gate:** Staff Data + Staff PM; Staff Growth vende "comisiones" solo tras gate.

---

### FASE 6D — Inventario Avanzado (KipusPay v8.1, sprints 38–42)

> Profundiza el inventario: dónde está cada unidad (ubicación), su identidad individual (serie), su masa (peso variable) y su comunicación con el anaquel (etiquetas), además del derecho del negocio a **su propio backup completo**. Detalle de entidades: Arquitectura §5.3 reglas 23–27. **Capabilities, no forks** (ADR-ARCH-002).

#### Sprint 38 — Ubicaciones / racks por sucursal
**Capabilities:** `inventory.locations`  
**Referencia:** Arquitectura §5.3 regla 23; Sprint 18 (conteo) · **Agentes:** Staff Backend Datos (owner), Staff Frontend (Admin), Staff QA

**Entregables:**
- `inventory_locations` + `inventory_location_stock`; stock de venta = suma por ubicaciones activas.
- Conteo físico **por ubicación** (extiende Sprint 18); transferencia intra-sucursal con `audit_events`.
- Picking guiado para OC (listado de ítems por ubicación).

**Criterios de aceptación:** 0 stock perdido entre ubicaciones (suma invariante); conteo por ubicación concilia con total de la sucursal; transferencia intra-sucursal no altera el total.

**Quality Gate:** Staff QA (conteo concurrente por ubicación); Staff PM valida claim multi-almacén tras gate.

---

#### Sprint 39 — Números de serie
**Capabilities:** `inventory.serials`  
**Referencia:** Arquitectura §5.3 regla 24 · **Agentes:** Staff Backend Datos (owner), Staff Frontend (caja), Staff QA

**Entregables:**
- `serial_numbers` con estados `AVAILABLE → SOLD → RETURNED | IN_TRANSIT`; asignación en recepción.
- Venta exige escaneo/ingreso de serie por `sale_item`; devolución (Sprint 28) revierte la serie.
- Búsqueda por serie para garantía/audit; duplicado = 422.

**Criterios de aceptación:** 0 venta sin serie para productos serializados; 0 doble asignación; devolución libera la serie al estado correcto; reporte de garantía por serie reproducible.

**Quality Gate:** Staff QA (concurrencia de asignación) + Staff Security; Staff PM valida claim electrónica/activos tras gate.

---

#### Sprint 40 — Venta por peso variable (balanza)
**Capabilities:** `inventory.scale`  
**Referencia:** Arquitectura §5.3 regla 25 · **Agentes:** Staff Frontend (owner), Staff Hardware (balanza USB), Staff Backend ACID

**Entregables:**
- Captura de peso en caja (balanza USB o manual) para `product_type = WEIGH`; precio por unidad de base; redondeo de monto en servidor.
- Override de peso con authz (`WEIGHT_OVERRIDE`, reusa Sprint 17).
- **Mueve "balanza" del backlog v10 a sprint.**

**Criterios de aceptación:** 0 montos redondeados en cliente; peso > 0 siempre; override sin authz = 403; precio × peso recalculado por servidor (0 manipulación); **heartbeat de balanza (edge 2C): desconexión WebUSB (suspensión/cable) → interfaz roja "Peso Manual" exige tipeo (jamás 0.00 silencioso); peso manual sobre umbral requiere PIN de supervisor y registra `WEIGHT_OVERRIDE`**.

**Quality Gate:** Staff Hardware + Staff QA; Staff PM descongela claim "verdulería/venta por peso" tras gate.

---

#### Sprint 41 — Etiquetas de precio / estantería
**Capabilities:** `catalog.price_labels`  
**Referencia:** Arquitectura §5.3 regla 26; §7.5 PrinterTransport · **Agentes:** Staff Frontend (owner), Staff Hardware, Staff Data

**Entregables:**
- `price_label_templates` (producto, precio vigente según lista, barcode, ancho 58/80mm).
- Impresión vía `PrinterTransport` (WebUSB/WSS) + reimpresión en lote; nunca edita precios, solo imprime.
- `audit_events` `PRICE_LABEL_REPRINT`.

**Criterios de aceptación:** etiqueta refleja el precio del servidor (0 precio manual); impresión por outbox (Sprint 25); fallo de impresora degrada sin romper la caja.

**Quality Gate:** Staff Hardware + Staff Frontend.

---

#### Sprint 42 — Export / restore total del negocio
**Capabilities:** `data.backup`  
**Referencia:** Arquitectura §5.3 regla 27; respalda GTM §5.7.1 ("tus datos son tuyos") · **Agentes:** Staff SRE (owner), Staff Data, Staff Security, Staff Growth (copy)

**Entregables:**
- `data_backups`: export completo versionado y cifrado a R2 (envoltura KMS) + restore con **dry-run**; no bloquea la caja.
- RPO/RTO base (eslabón de Sprint 48); borrado de export del tenant a pedido (LPDP, Sprint 47).

**Criterios de aceptación:** export reproducible bit-a-bit; restore dry-run no escribe D1; 0 secreto/clave en claro en R2; la caja nunca se detiene durante backup.

**Quality Gate:** Staff Security + Staff SRE; Staff Growth actualiza claim "exporta todo tu historial" solo tras gate.

---

### FASE 6E — Servicios y Fuerza de Venta (KipusPay v8.1, sprints 43–45)

> Convierte la promesa de vertical Servicios (GTM §2) en producto: preventa con retiro, ventas recurrentes/membresías y una caja móvil que acompaña al dueño y al vendedor. Detalle de entidades: Arquitectura §5.3 reglas 28–30. **Capabilities, no forks** (ADR-ARCH-002).

#### Sprint 43 — Preventa / pedido a cliente con retiro
**Capabilities:** `orders.customer_orders`  
**Referencia:** Arquitectura §5.3 regla 28 (distinto de `orders.lifecycle`) · **Agentes:** Staff Frontend (owner), Staff Backend ACID, Staff Mobile (aviso)

**Entregables:**
- `customer_orders`/`customer_order_items`: reserva de ítems **sin pago previo** → aviso (WhatsApp/push, Sprint 45) → venta al retiro; cumplimiento parcial.
- Venta al retiro hereda el snapshot `customer_order_items.unit_price_cents`; si `reserved_until` expiró exige pricing nuevo y aprobación; cancelación libera stock con `audit_events`.

**Criterios de aceptación:** 0 venta sin pedido si el tenant lo exige; reserva no caduca sin aviso; cumplimiento parcial concilia stock; cancelación libera 1:1.

**Quality Gate:** Staff QA + Staff PM; Staff Growth descongela claim "pedidos con retiro" tras gate.

---

#### Sprint 44 — Ventas recurrentes / membresías
**Capabilities:** `sales.recurring`  
**Referencia:** Arquitectura §5.3 regla 29; vertical Servicios · **Agentes:** Staff Backend ACID (owner), Staff Data, Staff Frontend (Admin), Staff Growth (gating)

**Entregables:**
- `recurring_plans` (frecuencia, doc_type NV/03/01, items con precio servidor) + cron con **idempotencia** (cada ocurrencia = doc fiscal propio).
- Cancelación y proporcionalidad; atraso de pago no corta el servicio al instante (periodo de gracia, GTM §4.3).
- `audit_events` `RECURRING_*`.

**Criterios de aceptación:** 0 duplicado de ocurrencia (idempotency key por plan×fecha); cada ocurrencia emite su CPE/NV; cancelación no deja ocurrencias huérfanas; cupo §4.1 aplica por doc emitido.

**Quality Gate:** Staff QA (cron idempotente) + Staff PM; Staff Growth vende "membresías" en Servicios solo tras gate.

---

#### Sprint 45 — Notificaciones push + caja móvil Android
**Capabilities:** `mobile.push`, `client.mobile_pos`  
**Referencia:** Arquitectura §5.3 regla 30; §7.5 (offloading) · **Agentes:** Staff Mobile (owner), Staff Frontend, Staff SRE, Staff Hardware

**Entregables:**
- `push_subscriptions` + Web Push/FCM: alertas Modo Dueño reales (arqueo, quiebre, discrepancias, cuotas vencidas) — no solo polling.
- **Caja móvil** como terminal PWA que reusa el core (multi-caja portátil, Android); sin fork de dominio.
- Suscripción/consentimiento de push explícito (LPDP, Sprint 47).

**Criterios de aceptación:** push entregado en <10s en red normal; caja móvil pasa la suite de gama baja (Sprint 6/14) sin pérdida de cola; 0 push sin consentimiento; modos offline idénticos al POS.

**Quality Gate:** Staff Mobile + Staff QA (dispositivo) + Staff Security (PII).

---

### FASE 6F — Analítica Predictiva + Compliance + Inteligencia del Negocio (KipusPay v8.1, sprints 46–49)

> Respalda técnicamente el claim Cadena de "analítica predictiva" (GTM §4.1), cierra las obligaciones de datos (LPDP Perú y DR/BCP) y añade la capa de inteligencia del negocio (agente de insights + Morning Briefing) con pipeline determinista sobre D1. Detalle de entidades: Arquitectura §5.3 reglas 31–33. **Capabilities, no forks** (ADR-ARCH-002).

#### Sprint 46 — Analítica predictiva
**Capabilities:** `analytics.forecasting`  
**Referencia:** Arquitectura §5.3 regla 31; GTM §4.1 claim Cadena (congelado hasta este gate) · **Agentes:** Staff Data (owner), Staff Backend ACID, Staff PM, Staff Growth (gating)

**Entregables:**
- Modelo sobre `daily_product_rollups` (D1, exacto) + features de Analytics Engine; forecast ventas por sucursal/producto y detección de quiebre.
- `forecast_outputs` versionados (`model_version`); salida = **sugerencias** al Dueño (reposición, alertas) — nunca decisiones automáticas de precio/stock.
- Gated a plan **Cadena**; disclaimer en UI ("estimación, no garantía").

**Criterios de aceptación:** forecast no muta D1 de ventas ni stock; 0 acción automática sobre precio/inventario; métricas de precisión (MAPE) publicadas; gating Cadena respetado (plan inferior = 402 sin tocar arqueo).

**Quality Gate:** Staff Data (métricas) + Staff PM; Staff Growth **descongela** claim "analítica predictiva" en GTM §4.1 solo tras este gate.

---

#### Sprint 47 — LPDP (datos personales)
**Capabilities:** `compliance.lpdp`  
**Referencia:** Arquitectura §5.3 regla 32a; Ley N.º 29733 (Perú) · **Agentes:** Staff Security (owner), Staff Data, Staff Mobile (push), Staff Growth (copy)

**Entregables:**
- Inventario de PII (clientes: nombre, email, teléfono, dirección, RUC/DNI); `consent_records` por propósito (reusa opt-in Sprint 24).
- Derechos: export (reusa Sprint 42) y **borrado/anonimización** (`customers.pii_erased`); los doc fiscales se retienen (SUNAT ~5 años) pero se **anonimizan** en su vínculo a persona.
- Runbook DPO y copy legal en GTM (no jerga).

**Criterios de aceptación:** 0 PII sin consentimiento donde aplica; borrado anonimiza vínculo sin romper integridad fiscal; export incluye PII del cliente; simulacro de solicitud LPDP completado.

**Quality Gate:** Staff Security + Staff Principal; Staff Growth publica política de privacidad solo tras gate.

---

#### Sprint 48 — DR/BCP
**Capabilities:** `platform.dr`  
**Referencia:** Arquitectura §5.3 regla 32b; Sprint 14 (caos) · **Agentes:** Staff SRE (owner), Staff Backend ACID, Staff Principal

**Entregables:**
- Objetivos: **RPO=0** en tx ACID comprometidas, **RPO≤1d** en rollups, **RTO** objetivo por shard con replay de colas.
- Backups versionados (Sprint 42) con **restauración probada**; multi-región; simulacro anual (`DR_SIMULATION` en audit).
- Runbook de recuperación ensayado en staging (extiende Sprint 14).

**Criterios de aceptación:** simulacro sin pérdida de tx comprometidas; restauración dentro del RTO declarado; colas replays sin duplicar efectos; 0 datos de rollup irreparables (>1d).

**Quality Gate:** Staff Principal + Staff SRE; runbook actualizado y firmado.

---

#### Sprint 49 — Inteligencia del negocio (Agente de insights + Morning Briefing)
**Capabilities:** `analytics.agentic_insights`  
**Referencia:** Arquitectura §5.3 regla 33; D1 como única calculadora (Principio 9); GTM §4.1 claim Cadena/Enterprise (congelado hasta este gate) · **Agentes:** Staff Data (owner), Staff Security, Staff Frontend (SSE/UI), Staff QA, Staff Growth (gating)

**Entregables:**
- **Pipeline determinista:** router de intención (LLM ligero, acciones whitelist) → Text-to-SQL (schema estricto, parametrizado, sin concatenar texto del LLM) → `SELECT` en **D1** → NLG server-side con **hechos tipados verbatim** + **post-check determinista anti-alucinación** → respuesta por **SSE** (P95 <2s). **Validación de memoria (edge A):** el validador del schema inyecta **`LIMIT 50`** forzoso y agrega (`GROUP BY`) listas amplias; respuesta *"datos muy amplios para el chat → descarga el Excel"*; sin materializar listados grandes en el isolate.
- **Morning Briefing proactivo:** cron 3:30 AM post `buildDailySummaryCron`; 3 viñetas (ventas, quiebre, excepciones de caja) cacheadas en **KV** `insights:{tenant_id}:{fecha}` (lectura UI <10ms); chat para profundizar desde Modo Dueño/Admin. **Regenerable ante sync offline tardío (edge D):** re-materialización del rollup (§9) invalida la KV del briefing.
- **Idempotencia del chat (edge B):** `insight_idempotency_key` (UUID) por mensaje; reenvío tras corte de red devuelve la respuesta cacheada (KV `insights:{tenant_id}:{idem}`, TTL ~10 min) sin re-invocar al LLM; `ai_usage_counters` solo en el primer procesamiento.
- **Schema PII-free (edge C):** whitelist del Text-to-SQL **excluye** `email/phone/address/document_number`; expone `customer_id` + seudónimo; post-check que escanea `facts_json` y rechaza PII antes de la NLG (LPDP, regla 32).
- **Metering:** `ai_usage_counters` por tenant/día (queries + tokens) con cupo diario y rate limit; excedente facturado por el modelo de sobregiro (§4.1); `insight_log` append-only (query SQL + hechos + texto + `model_version`) para auditoría.

**Criterios de aceptación:** 0 discrepancias numéricas entre el texto NLG y los hechos D1 en 500 casos (Staff QA, anti-alucinación); 0 fuga de datos entre tenants en suite multi-tenant (tenant_id del JWT forzado en `WHERE`, jamás del prompt); P95 <2s en chat SSE y <10ms en lectura de briefing KV; gating Cadena/Enterprise respetado; 0 datos cacheados stale presentados como en vivo (banner de briefing); **límite de memoria (edge A): consulta simulada de 100k filas → el validador fuerza `LIMIT 50`/agregación, 0 OOM del isolate, respuesta "demasiado amplio → descarga el Excel"**; **benchmark gama baja (R-02): ningún sprint de FASE 6F/6G se cierra sin pasar la suite de estrés en emulador Android con 1 GB de RAM disponible — re-materialización de rollup tardío (edge D) + reconciliación de cola concurrentes sin `QuotaExceededError` ni pérdida de ventas**; **idempotencia (edge B): reenvío con la misma `insight_idempotency_key` tras corte de red → respuesta cacheada sin re-invocar al LLM y `ai_usage_counters` sin incremento extra (0 doble cobro)**; **schema PII-free (edge C): suite de prompts adversos de PII ("¿quién es mi mejor cliente?", "dame correos") → 0 `email`/`phone`/`address`/`document_number` en `facts_json` ni en la respuesta (seudónimo + `customer_id`)**.

**Quality Gate:** Staff Data (0 discrepancias) + Staff Security (multi-tenant) + Staff QA; Staff Growth **descongela** claim "El único POS que viene con un Gerente de Operaciones incluido" en GTM §4.1 solo tras este gate; Staff Principal aprueba el cierre según RACI.

---

### FASE 6G — Flujo del Cliente (KipusPay v8.1, sprints 50–53)

> Cierra la transición del "aha moment" del onboarding hacia la operación diaria: subir el catálogo sin teclear 1,500 productos, cambiar turnos sin cerrar caja, atribuir ventas al vendedor en <1s, y que el cliente descubra y configure las capabilities de su rubro. Detalle de entidades: Arquitectura §5.3 reglas 34–37. **Capabilities, no forks** (ADR-ARCH-002); cada claim GTM se descongela solo tras su Quality Gate.

#### Sprint 50 — Alta rápida de catálogo (Escáner Rápido + Venta Rápida)
**Capabilities:** `catalog.quick_add`, `sales.quick_line`  
**Referencia:** Arquitectura §5.3 regla 34; `products.barcode`; CatalogImporter (Sprint 21) · **Agentes:** Staff Mobile/Producto (owner, Modo Dueño), Staff Frontend (caja), Staff Backend ACID, Staff Design

**Entregables:**
- **Escáner Rápido** en Modo Dueño/Admin: cámara del celular (`BarcodeDetector`/`getUserMedia`) lee `products.barcode`; si existe → edita stock/precio; si no → crea producto con nombre + precio en ~3s. Sin depender de CSV ni de importador.
- **Venta rápida sin catálogo:** línea genérica en caja (`sale_items.is_uncatalogued`), precio dentro del umbral sin authz; no descuenta stock; queda marcada como "pendiente de catalogar" en Admin.
- Lector de barcode reutilizable (fotocheck/vendedor y escáner de catálogo comparten la misma infra).

**Criterios de aceptación:** crear un producto nuevo con cámara en <3s (Staff QA mide con gama baja); escaneo de código existente no duplica producto (upsert por `barcode`); venta rápida genérica cobra sin descuento de stock y sin corromper `sale_items`; línea sin sku jamás bloquea el cobro; `audit_events` `QUICK_ADD`/`GENERIC_LINE`; **namespace anti-colisión (edge 1A): badge `EMP-12345` se resuelve como vendedor y producto `12345` como artículo — 0 falsos positivos en 500 escaneos mixtos; `EMP-` rechazado como barcode de producto**; **sync offline de venta rápida (edge 2A): una venta rápida hecha offline sincroniza aceptando `manualPriceCents` (dentro del umbral), sin `Product not found`, con IGV default de tenant y audit `GENERIC_LINE`**.

**Quality Gate:** Staff Design (flujo en pasillos) + Staff QA; Staff Growth descongela claim "sube tu catálogo con la cámara" solo tras este gate.

---

#### Sprint 51 — Handoff de turno + Equipo (invitaciones y PIN/badge)
**Capabilities:** `ops.shift_handoff`, `ops.team_invite`  
**Referencia:** Arquitectura §5.3 reglas 35–36; `cash_register_sessions` (§5.2) · **Agentes:** Staff Backend ACID (owner), Staff Frontend (caja), Staff Mobile (Owner), Staff Security (PIN), Staff Design

**Entregables:**
- **Handoff de turno sin cierre Z:** PIN temporal de un solo uso (hash + TTL, verificado server-side) transfiere la sesión que **sigue OPEN**; log `cash_register_shifts` por operador; atribución real por `sales.user_id` + `sale_items` por venta.
- **Conteo ligero intermedio opcional:** `interim_required` en política del tenant → el saliente confirma efectivo (diferencia → `SHIFT_TRANSFER` con `cash_diff_cents`) sin emitir cierre Z.
- **Equipo:** invitación de cajero/vendedor (email/link) + emisión de **PIN de caja** y **badge barcode** (`users.pin_hash`, `users.badge_barcode`).
- **Atribución de vendedor <1s en carrito:** escaneo de badge o PIN del vendedor setea `sale_items.seller_id` a nivel carrito (override por ítem), sin menú desplegable largo.

**Criterios de aceptación:** transferencia en <5s sin cerrar la sesión; PIN expira y es de un solo uso (reuso → 401); 0 ventas huérfanas: toda venta del tramo queda atribuida al operador real; si `interim_required`, la diferencia se audita y no bloquea la transferencia; invitación no duplica usuarios (único por email); atribución de vendedor <1s en prueba con 200 SKUs; `audit_events` `SHIFT_TRANSFER`/`TEAM_INVITE`; **badge `EMP-` único por tenant (edge 1A): 0 colisiones `users.badge_barcode` vs `products.barcode`**; **desglose por operador (edge 1C): tras 2 tramos con `SHIFT_TRANSFER`, el ticket Z del cierre muestra la diferencia por tramo (`cash_register_shifts`) y el Modo Dueño atribuye el faltante al turno correcto**.

**Quality Gate:** Staff Security (PIN/credenciales) + Staff Backend ACID + Staff Design; Staff PM confirma que el arqueo Z real sigue siendo del cierre de sesión (regla 11).

---

#### Sprint 52 — Product Tour + Setup Checklist ("segundo día")
**Capabilities:** `onboarding.tour`  
**Referencia:** Arquitectura §5.3 regla 37a; GTM §6.2 (onboarding) · **Agentes:** Staff Frontend (owner), Staff Design, Staff PM, Staff Content (copy de tooltips)

**Entregables:**
- **Product Tour** post-onboarding activado **por las capabilities del tenant** (ADR-ARCH-002): tooltips contextuales según rubro ("Como eres restaurante, activamos las comandas de cocina — configura aquí tu pantalla de chef"); versión por rol (Dueño vs Cajero).
- **Checklist de setup del "segundo día":** logo, impresora, invitar cajero, activar facturación, subir catálogo — barra de completitud en Admin/Modo Dueño; nudge contextual sin bloquear la caja.
- **FAQ in-product** contextual por capability habilitada.

**Criterios de aceptación:** 0 usuarios sin haber visto el tour de su rubro (se omite si ya vendió); checklist visible y no bloqueante (la caja nunca depende de completarlo); tooltips sin jerga (validado por Staff Content); el tour no re-aparece si el usuario lo cierra (persistencia local); métrica de completitud del checklist instrumentada.

**Quality Gate:** Staff Design (sin fricción) + Staff PM; Staff Growth usa la métrica de completitud para la campaña "segundo día" (email/soporte).

---

#### Sprint 53 — Troubleshooter de hardware
**Capabilities:** `hardware.diagnostics`  
**Referencia:** Arquitectura §5.3 regla 37b; PrinterTransport (Sprint 25) · **Agentes:** Staff Hardware (owner), Staff Frontend (Admin), Staff QA/Chaos, Staff Design

**Entregables:**
- **Asistente visual de diagnóstico** en Admin → Configuración (Impresión/hardware): botones *"Probar impresora USB"* / *"Buscar impresoras en mi red"* / *"Probar balanza"* / *"Probar vitrina"*.
- Oculta la escalera WebUSB → WSS → Bluetooth (Sprint 25) y el diagnóstico de red detrás de estados claros (✓/✗ con causa y "paso siguiente"); log de diagnóstico (`HARDWARE_DIAG`) para soporte remoto.
- Autodetección de ancho de papel 58/80 mm y reimpresión de prueba.

**Criterios de aceptación:** 0 conceptos técnicos (WebUSB/WSS/IP) visibles en el flujo principal; cada fallo muestra causa comprensible + siguiente acción (no solo "error"); diagnóstico resuelve ≥90% de los casos de impresora no configurada sin chat de soporte; prueba de impresión <30s; log `HARDWARE_DIAG` con timestamp para soporte.

**Quality Gate:** Staff Hardware + Staff QA/Chaos (prueba con impresora no configurada y balanza desconectada) + Staff Design; Staff Principal aprueba el cierre según RACI.

---

### Estado de especificación por sprint

> Tracker del staff PM: `Especificación` = nivel de detalle del sprint en este documento; `Entrega` = avance de implementación (el DoD §7 se cierra solo con changelog + evidencia).

| Sprint | FASE | Especificación | Entrega |
|---|---|---|---|
| 1 | 0–1 | Actualizada (M1 dinero cents, §5.0) | Planificado |
| 2–5 | 1–2 | Base | Planificado |
| 5b | 2 | Actualizada (Resumen Diario, plazos, baja y alertas) | Planificado |
| 6 | 2 | Actualizada (P4 CRM LWW + dedup SYN-11 enmendada + edge D rollup) | Planificado |
| 7–8 | 2–3 | Base | Planificado |
| 9 | 3 | Actualizada (M3 rollups §9) | Planificado |
| 10–16 | 3–5 | Base | Planificado |
| 17 | 6 | Actualizada (M6/M7 caja dura + audit) | Planificado |
| 18 | 6 | Actualizada (M2/M4/M5 PMP + stock) | Planificado |
| 19–20 | 6 | Base | Planificado |
| 21–24 | 7 | Base | Planificado |
| 25 | 8 | Actualizada (P3 print outbox §7.5 + pos_terminals config 58/80mm) | Planificado |
| 26 | 8 | Actualizada (P1 breaker §8.1) | Planificado |
| 27 | 8 | Actualizada (P2 cupo §4.1) | Planificado |
| 28–32 | 6B | Actualizada (FASE 6B reglas 13–17 + COM pricing) | Planificado |
| 33–37 | 6C | Actualizada (FASE 6C reglas 18–22 + COM-05 pricing congelado) | Planificado |
| 38–42 | 6D | Actualizada (FASE 6D reglas 23–27) | Planificado |
| 43–45 | 6E | Actualizada (FASE 6E reglas 28–30 + COM-05 reserva/pricing) | Planificado |
| 46–48 | 6F | Actualizada (FASE 6F reglas 31–32) | Planificado |
| 49 | 6F | Actualizada (Sprint 49 regla 33 — agentic insights + PERF-12 réplica) | Planificado |
| 50–53 | 6G | Actualizada (FASE 6G reglas 34–37 — flujo del cliente) | Planificado |

---

## Anexo A — RACI Resumido por Fase

| Fase | Responsable (R) | Aprueba (A) | Consultado (C) | Informado (I) |
|---|---|---|---|---|
| Fase 1 — Núcleo Transaccional | Staff Backend Datos/ACID, Staff Security, Staff Fiscal | Staff Principal | Staff QA/Chaos, Staff SRE | Staff PM |
| Fase 2 — Cumplimiento y Resiliencia | Staff Fiscal, Staff Frontend | Staff Principal, Staff Security | Staff QA/Chaos | Staff PM, Staff Growth |
| Fase 3 — Producto Premium | Staff Frontend, Staff Hardware, Staff Mobile, Staff SRE | Staff Design | Staff QA/Chaos | Staff PM |
| Fase 4 — Salida al Mercado | Staff Growth, Staff Content | Staff PM | Staff Design, Staff Security | Staff Principal |
| Fase 5 — Hardening y Lanzamiento | Staff QA/Chaos, Staff Security, Staff Design | **Staff Review Board (quórum completo)** | Todos los roles | Toda la organización |
| Fase 6 — Operación Comercial v8.1 | Staff Backend ACID/Datos, Staff Frontend, Staff Mobile | Staff Principal | Staff QA/Chaos, Staff Security, Staff Design | Staff PM, Staff Growth |
| Fase 7 — Ecosistema Perú v9 | Staff Backend ACID/Datos, Staff Security, Staff SRE | Staff Principal | Staff QA/Chaos, Staff Fiscal, Staff Frontend | Staff PM, Staff Growth, Staff Content |
| Fase 8 — Blindaje v8.2 | Staff Frontend, Staff Fiscal, Staff SRE, Staff Backend ACID | Staff Principal | Staff Hardware, Staff Security, Staff QA/Chaos | Staff PM, Staff Growth |
| Fase 6B — Profundidad Retail v8.1 (28–32) | Staff Backend ACID/Datos, Staff Frontend | Staff Principal | Staff Fiscal, Staff QA/Chaos, Staff Security, Staff Data | Staff PM, Staff Growth |
| Fase 6C — Cierre Comercial v8.1 (33–37) | Staff Backend ACID/Datos, Staff Frontend | Staff Principal | Staff QA/Chaos, Staff Security, Staff Data | Staff PM, Staff Growth |
| Fase 6D — Inventario Avanzado v8.1 (38–42) | Staff Frontend, Staff Backend Datos, Staff Hardware | Staff Principal | Staff QA/Chaos, Staff Security, Staff SRE | Staff PM, Staff Growth |
| Fase 6E — Servicios y Fuerza de Venta v8.1 (43–45) | Staff Mobile, Staff Frontend, Staff Backend ACID | Staff Principal | Staff QA/Chaos, Staff Security, Staff SRE | Staff PM, Staff Growth |
| Fase 6F — Predictiva + Compliance v8.1 (46–49) | Staff Data, Staff Security, Staff SRE | Staff Principal | Staff QA/Chaos, Staff Backend ACID | Staff PM, Staff Growth |
| Fase 6G — Flujo del Cliente v8.1 (50–53) | Staff Mobile/Producto, Staff Frontend, Staff Backend ACID, Staff Hardware | Staff Principal | Staff QA/Chaos, Staff Security, Staff Design | Staff PM, Staff Growth |

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
- **DRY de dominio / hexagonal:** una regla = un package `domain-*`; Agents/GTM citan Arquitectura; composition root en workers/apps.
