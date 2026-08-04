---
doc_id: roadmap-fase-4
alias: Roadmap
authority: normativa
owner: "@DawoT"
fase: "4"
sprints: "10–13"
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

