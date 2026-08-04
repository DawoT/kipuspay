/**
 * Genera las tarjetas sociales (PNG 1200x630) y el apple-touch-icon.
 *
 * Herramienta de autoria, no dependencia de runtime: rasteriza con el Chrome
 * del equipo y deja los PNG en `static/media/`. Se corre a mano cuando cambia
 * el copy de las tarjetas:
 *
 *   node scripts/render-social-assets.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = join(ROOT, 'static');
const OUT = join(STATIC, 'media');

const CHROME = process.env.CHROME_BIN ?? 'google-chrome';

const CORDS = {
  restaurantes: '#eeb765',
  farmacias: '#3fbf8f',
  retail: '#e0644f',
  servicios: '#e2c39d',
  cadenas: '#c98195',
};

const CARDS = [
  {
    file: 'og-kipuspay.png',
    eyebrow: 'POS y facturacion para comercios del Peru',
    headline: 'El unico POS que no se cae contigo.',
    sub: 'Vende, cobra y factura aunque se corte el internet.',
    cord: '#eeb765',
  },
  {
    file: 'og-restaurantes.png',
    eyebrow: 'Restaurantes y cafeterias',
    headline: 'Tu cocina y tu caja, en el mismo minuto.',
    sub: 'Cobra en hora punta sin que el salon se trabe.',
    cord: CORDS.restaurantes,
  },
  {
    file: 'og-farmacias.png',
    eyebrow: 'Farmacias y boticas',
    headline: 'Nadie se va sin su medicina por falta de stock.',
    sub: 'Vende y controla el inventario en el mostrador.',
    cord: CORDS.farmacias,
  },
  {
    file: 'og-retail.png',
    eyebrow: 'Retail y minimarkets',
    headline: 'Sabe que paso en cada tienda, hoy.',
    sub: 'Cierre de caja claro, sin planillas a mano.',
    cord: CORDS.retail,
  },
  {
    file: 'og-servicios.png',
    eyebrow: 'Servicios y talleres',
    headline: 'Cobra sin inventario, sin complicarte.',
    sub: 'Tu primera venta en menos de 5 minutos.',
    cord: CORDS.servicios,
  },
  {
    file: 'og-cadenas.png',
    eyebrow: 'Cadenas y multi-local',
    headline: 'Un panel para todas tus tiendas.',
    sub: 'Los datos llegan cuando tus cajas sincronizan.',
    cord: CORDS.cadenas,
  },
];

const fontFace = (family, file, weight) => `
  @font-face {
    font-family: '${family}';
    src: url('file://${join(STATIC, 'fonts', file)}') format('woff2');
    font-weight: ${weight};
    font-display: block;
  }`;

/** Aparejo de cordeles a la derecha: la misma firma del hero, en estatico. */
function rig(cord) {
  const cords = [
    { x: 940, len: 470, knots: [180, 300] },
    { x: 1010, len: 380, knots: [230] },
    { x: 1080, len: 440, knots: [200, 340, 420] },
  ];
  const paths = cords
    .map(
      (c) =>
        `<path d="M${c.x},70 C ${c.x - 14},${70 + c.len * 0.35} ${c.x + 12},${
          70 + c.len * 0.7
        } ${c.x - 6},${70 + c.len}" stroke="${cord}" stroke-width="4" fill="none" stroke-opacity="0.9"/>`,
    )
    .join('');
  const knots = cords
    .flatMap((c) =>
      c.knots.map(
        (y) =>
          `<rect x="${c.x - 9}" y="${y - 9}" width="18" height="18" transform="rotate(45 ${c.x} ${y})" fill="${cord}"/>`,
      ),
    )
    .join('');
  return `<svg class="rig" width="1200" height="630" viewBox="0 0 1200 630" fill="none">
    <line x1="900" y1="70" x2="1140" y2="70" stroke="#3a4150" stroke-width="9" />
    ${paths}${knots}
  </svg>`;
}

function cardHtml({ eyebrow, headline, sub, cord }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  ${fontFace('Fraunces', 'fraunces-latin.woff2', '400 700')}
  ${fontFace('Schibsted', 'schibsted-grotesk-latin.woff2', '400 700')}
  ${fontFace('SplineMono', 'spline-sans-mono-latin.woff2', '400 600')}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; }
  body {
    position: relative;
    background: #14161c;
    color: #f3efe6;
    font-family: 'Schibsted', sans-serif;
    overflow: hidden;
  }
  .glow {
    position: absolute; inset: 0;
    background: radial-gradient(60% 70% at 82% 34%, ${cord}22 0%, transparent 70%);
  }
  .rules { position: absolute; inset: 0; }
  .rules i {
    position: absolute; left: 0; right: 0; height: 1px;
    background: rgba(243, 239, 230, 0.05);
  }
  .rig { position: absolute; top: 0; right: 0; }
  .wrap { position: relative; padding: 58px 64px; height: 630px; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; gap: 14px; font-family: 'Fraunces', serif; font-size: 34px; font-weight: 700; }
  .knot { width: 15px; height: 15px; background: ${cord}; transform: rotate(45deg); }
  .body { margin-top: auto; max-width: 760px; }
  .eyebrow {
    font-family: 'SplineMono', monospace; font-size: 19px; font-weight: 600;
    letter-spacing: 0.16em; text-transform: uppercase; color: ${cord};
    display: flex; align-items: center; gap: 12px;
  }
  .eyebrow b { width: 9px; height: 9px; background: ${cord}; transform: rotate(45deg); }
  h1 {
    font-family: 'Fraunces', serif; font-size: 68px; font-weight: 700;
    line-height: 1.06; letter-spacing: -0.015em; margin: 22px 0 18px;
  }
  p.sub { font-size: 27px; color: #c9cfd6; }
  .foot { margin-top: 44px; padding-top: 22px; border-top: 1px solid rgba(243,239,230,0.14);
    font-family: 'SplineMono', monospace; font-size: 17px; letter-spacing: 0.1em;
    text-transform: uppercase; color: #8b93a1; }
</style></head>
<body>
  <div class="glow"></div>
  <div class="rules">${[140, 210, 280, 350, 420, 490, 560]
    .map((y) => `<i style="top:${y}px"></i>`)
    .join('')}</div>
  ${rig(cord)}
  <div class="wrap">
    <div class="brand"><span class="knot"></span>KipusPay</div>
    <div class="body">
      <div class="eyebrow"><b></b>${eyebrow}</div>
      <h1>${headline}</h1>
      <p class="sub">${sub}</p>
      <div class="foot">kipuspay.pe</div>
    </div>
  </div>
</body></html>`;
}

const ICON_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; }
  html, body { width: 180px; height: 180px; background: #1a1d23; }
  svg { display: block; }
</style></head>
<body>
<svg width="180" height="180" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#1a1d23"/>
  <line x1="14" y1="15" x2="50" y2="15" stroke="#3a4150" stroke-width="5" stroke-linecap="round"/>
  <path d="M32,15 C 30.5,26 33.5,34 32,49" stroke="#d99a3d" stroke-width="4" fill="none" stroke-linecap="round"/>
  <rect x="26.5" y="20" width="11" height="11" transform="rotate(45 32 25.5)" fill="#eeb765"/>
  <rect x="27" y="30" width="10" height="10" transform="rotate(45 32 35)" fill="#eeb765"/>
  <rect x="26.5" y="40" width="11" height="11" transform="rotate(45 32 45.5)" fill="#2e9e74"/>
</svg>
</body></html>`;

function shot(html, out, width, height) {
  const dir = mkdtempSync(join(tmpdir(), 'kipus-og-'));
  const page = join(dir, 'card.html');
  writeFileSync(page, html, 'utf-8');
  execFileSync(
    CHROME,
    [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--allow-file-access-from-files',
      `--window-size=${width},${height}`,
      `--screenshot=${out}`,
      `file://${page}`,
    ],
    { stdio: 'ignore' },
  );
  console.log('ok', out);
}

mkdirSync(OUT, { recursive: true });
for (const card of CARDS) {
  shot(cardHtml(card), join(OUT, card.file), 1200, 630);
}
shot(ICON_HTML, join(STATIC, 'apple-touch-icon.png'), 180, 180);
