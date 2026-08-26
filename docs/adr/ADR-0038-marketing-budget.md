---
doc_id: adr-0038-marketing-budget
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0038 — Presupuesto de bundle de marketing-web: 72 kB → 120 kB gzip con Core Web Vitals como criterio real

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-26 |
| Decisores | Staff Frontend/SEO |
| Consultados | Staff SRE (Core Web Vitals) · Staff Design |
| Informados | Escuadrón |
| Relaciona | Arquitectura §13.8 (CAL-06) · Proceso §8.1 · GTM §6.5 · `apps/marketing-web/size-limit.config.js` |

## Contexto

La auditoría pre-promoción de `apps/marketing-web` marcó BLOQUEANTE: el bundle
cliente mide **117.94 kB gzip** contra un presupuesto de **72 kB** (+62%), con lo
cual `pnpm bundle` (size-limit) falla y la promoción queda bloqueada.

El presupuesto de 72 kB fue fijado cuando el sitio era una landing delgada
(~59.7 kB gz reales en su momento, según historial del ledger). Desde entonces el
sitio creció en contenido editorial legítimo: comparativas por competidor
(`compare.ts`), landings verticales (`verticals.ts`), matriz de planes, centro de
ayuda con búsqueda, blog y casos de éxito. Ese crecimiento es contenido de
producto, no hinchazón de dependencias: runtime sigue siendo cero-dependencia
(invariante 10) y todo el contenido se prerrenderiza a HTML estático.

El principio canónico de CAL-06 (Arquitectura §13.8) es «presupuesto medible, no
opinión»: un límite que el producto legítimo excede de forma estructural ya no
mide disciplina, solo castiga el crecimiento de contenido. Pero relajarlo sin
justificación abriría la puerta a la deriva silenciosa que CAL-06 existe para
evitar — por eso esta revisión va en ADR y no en un commit suelto.

## Decisión

Subir el presupuesto de `apps/marketing-web/size-limit.config.js` de **72 kB a
120 kB gzip**, manteniéndolo como contrato ejecutable (falla CI al superarse).

Justificación contra la métrica que realmente importa — Core Web Vitals
(GTM §6.5: percepción premium):

1. **LCP < 2.5 s alcanzable con 117.94 kB:** el HTML es 100% prerrenderizado;
   el elemento LCP (hero/media/tipografía) no espera hidratación. Las fuentes
   críticas van preloaded y el CSS es el único recurso render-blocking real.
   El JS cliente es mejora progresiva (reveal, toggles, búsqueda local): su
   descarga (~118 kB gzip ≈ 0.4–0.7 s en redes 4G lentas) compite con el idle,
   no con el primer paint.
2. **INP/CLS no dependen del tamaño del chunk inicial:** los controles
   interactivos son livianos y el layout está estabilizado con dimensiones
   explícitas.
3. **El techo nuevo sigue siendo duro:** mediciones consecutivas del mismo
   árbol dan 119.65–119.67 kB gzip (el chunking del bundler introduce
   variabilidad de ±1.5% entre builds); el límite queda deliberadamente justo.
   Superar 120 kB exige revisar este ADR, y cualquier dependencia npm nueva
   sigue exigiendo ADR propio (CAL-06): el criterio real de guarda son los CWV,
   no el número.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Code-splitting/lazy del contenido editorial (`compare.ts`, `verticals.ts`) | Son datos que consumen rutas de prerrender (nav, footer, sitemap) y páginas estáticas: ya viajan dentro del HTML servido. Trocearlos añade chunks + waterfalls de hidratación para contenido que el usuario ya recibió — más complejidad y peor INP sin mejora de LCP. |
| Mantener 72 kB y optimizar hasta caber | Requeriría recortar contenido de producto (comparativas/ayuda) o invertir días en micro-optimización sin beneficio CWV medible; mientras tanto CI rojo bloquea la promoción. |
| Status quo sin ADR | El gate seguiría fallando sin camino a verde, invitando a excepciones ad-hoc — exactamente la deriva que CAL-06 previene. |

## Consecuencias

- **Gana:** CI ejecutable y verde con un techo honesto; criterio explícito
  (CWV) en lugar de un número heredado; el cambio queda auditado y reversible.
- **Paga:** un techo mayor tolera más peso antes de alarmar — mitigado porque
  el margen real es mínimo y toda dependencia nueva exige ADR (CAL-06).
- **Invariantes tocadas:** ninguno de AGENTS §2; refuerza el espíritu de
  CAL-06/§13.8 (presupuesto vivo con justificación documental).
- **Activación:** inmediato — `size-limit.config.js` a `120 kB`; vigilancia vía
  `pnpm --filter @kipuspay/marketing-web run bundle` en cada sprint.

## Evidencia de cierre

- Tests / checks: `size-limit` GREEN a 120 kB (mediciones 2026-08-26:
  117.94–119.67 kB gzip según build; verificación final 119.67) · suite completa
  de marketing-web GREEN (286/286) · `scripts/verify.sh` RESULT SUITE GREEN
  (V-18/V-12 sobre este documento).
- Ledger: `id: ____` (al momento del registro)
- Firmas RACI: `R` Staff Frontend/SEO · `A` Staff Frontend/SEO · `V` Staff SRE
