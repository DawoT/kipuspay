---
doc_id: runbook-marketing-site-launch
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Runbook — Marketing site launch (Sprint 10)

| Campo | Valor |
|---|---|
| App | `apps/marketing-web` |
| Soft-launch | `PUBLIC_FEATURE_MARKETING_SITE` default `0` (build-time; el sitio es prerender estático) |
| Owner | Staff Growth + Staff Content |
| Relaciona | GTM §1–3 / §5 · Roadmap FASE 4 Sprint 10 |

## Rutas

- `/` home
- `/para/{restaurantes,farmacias,retail,servicios,cadenas}`
- `/comparar/{bsale,alegra,siigo}`
- Stubs: `/precios` (S11), `/empezar` (S11), `/casos-de-exito` `/blog` (S12), `/seguridad` `/ayuda` (S13)

## Claim-gate

Feature destacada por vertical solo `live` si el QG GTM §2 del sprint correspondiente esta cerrado; si no → badge `En el roadmap (Sprint N)`.

## Copy audit

```bash
python3 scripts/checks/marketing_copy.py
```

0 terminos: Edge, D1, Workers, ACID, sharding, Durable Object, Cloudflare, CDR, UBL, PSE.

## Fuentes y assets (zero-dependency runtime)

- Tipografia vendida en `static/fonts/*.woff2` (Fraunces, Schibsted Grotesk, Spline Sans Mono) con `@font-face` local (`font-display: swap`); preload de Fraunces y Schibsted en `+layout.svelte`. Sin CDN externo ni libreria npm.
- `static/fonts/OFL-LICENSE.txt` con la atribucion OFL 1.1 de las tres familias.
- `og:image` en PNG por marca y por rubro (`/media/og-kipuspay.png`, `/media/og-*.png`); regenerar con `node apps/marketing-web/scripts/render-social-assets.mjs`.
- Hero: video cinematografico de evolucion (`/media/hero-quipu.mp4`, ~558 kB, una pasada + poster). Sin canvas ni SVG superpuesto: el quipu narrativo vive en las secciones (motivos SVG one-shot: loom/tension/reconnect/network/seal).
- Reduced-motion: el video no se reproduce; permanece el poster.

## SEO

- title / description / canonical por home, vertical y comparar
- `robots.txt` + `sitemap.xml` prerender
- Stubs con copy honesto de sprint (todos `noindex` hasta su sprint; ausentes del sitemap)

## Core Web Vitals (presupuesto)

Medicion con `PUBLIC_FEATURE_MARKETING_SITE=1` y `pnpm --filter @kipuspay/marketing-web build`:

| Metrica | Presupuesto | Nota |
|---|---|---|
| LCP | < 2.5 s | poster SVG `/media/hero-poster.svg` `fetchpriority=high`; video lazy si se anade |
| INP | < 200 ms | sin libs de animacion; CSS transitions |
| CLS | < 0.1 | dimensiones width/height en hero img |

Evidencia local (Sprint 10): LCP vía poster estatico en primer viewport; CLS 0 esperado (img dimensionada); INP sin handlers pesados. Re-medir con Lighthouse en preview antes de flip de flag en produccion.

## Soft-launch (build-time)

El sitio es prerender estático: el flag se decide en **build**, no en runtime.
Un cambio de variable en Pages en caliente no cambia el contenido ya emitido.

1. Dev preview: editar `apps/marketing-web/.env` → `PUBLIC_FEATURE_MARKETING_SITE=1` y **reiniciar** el dev server. NO usar variable de shell: en dev `import.meta.env` no se expone en SSR y `process.env` no carga `.env` → divergencia server/cliente y hydration mismatch. Restaurar a `0` al terminar.
2. Preview de produccion: `PUBLIC_FEATURE_MARKETING_SITE=1 pnpm --filter @kipuspay/marketing-web build` + `preview`.
3. Go-live: definir `PUBLIC_FEATURE_MARKETING_SITE=1` como variable de **build** del proyecto Pages y redeploy.
4. Rollback: redeploy con `PUBLIC_FEATURE_MARKETING_SITE=0` (o sin la variable) → pantalla "Sitio en preparacion".
