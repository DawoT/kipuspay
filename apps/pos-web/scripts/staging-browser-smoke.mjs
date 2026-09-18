import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Must match the Pages project deployed by deploy-staging.yml
// (apps/marketing-web -> project-name kipuspay-web).
const MKT = process.env.KIPUSPAY_MARKETING_URL ?? 'https://kipuspay-web.pages.dev/';
const POS = process.env.KIPUSPAY_POS_URL ?? 'https://kipuspay-app.pages.dev/';
const API = process.env.KIPUSPAY_API_URL ?? 'https://kipuspay-worker-api-staging.cristian-pcalderon.workers.dev/health';
const BLOCKED_MARKETING_CLAIMS =
  /100%\s*legal|factura\s+en\s+autom[aá]tico|factura(?:ción)?\s+autom[aá]tica|emisión\s+(?:sunat\s+)?autom[aá]tica|(?:en\s+)?tiempo\s+real|\ben\s+vivo\b|\b(?:5|15)\s+minutos\b|emite\s+comprobantes|certificado\s+digital\s+gratuito|enviamos\s+tus\s+comprobantes|se\s+encarga\s+del\s+envío|guiamos\s+el\s+envío|reintenta\s+el\s+envío/i;
const STAGING_EVIDENCE_DIR = process.env.STAGING_EVIDENCE_DIR;

if (STAGING_EVIDENCE_DIR) await mkdir(STAGING_EVIDENCE_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];
const EXPECTED_VERTICAL_COUNT = 6;
let marketingVerticalPaths = [];

function findBlockedMarketingClaims(bodyText) {
  const claimsText = bodyText.replace(/\bsin\s+promesas\s+de\s+tiempo\s+real\b/gi, '');
  const matches = [...claimsText.matchAll(new RegExp(BLOCKED_MARKETING_CLAIMS, 'gi'))].map((match) => match[0]);
  return [...new Set(matches)];
}

function assertNoBlockedMarketingClaims(bodyText) {
  const matches = findBlockedMarketingClaims(bodyText);
  if (matches.length) throw new Error(`blocked marketing claims: ${matches.join(' | ')}`);
}

async function check(name, url, assertFn) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const consoleErrors = [];
  const assetFailures = [];
  const responses = [];
  let tracingStarted = false;
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  page.on('response', (response) => {
    const request = response.request();
    const url = response.url();
    let safeUrl = url;
    try {
      const parsedUrl = new URL(url);
      parsedUrl.search = '';
      parsedUrl.hash = '';
      safeUrl = parsedUrl.href;
    } catch {
      safeUrl = url.split(/[?#]/, 1)[0];
    }
    responses.push({
      method: request.method(),
      url: safeUrl,
      status: response.status(),
      resourceType: request.resourceType(),
      contentType: response.headers()['content-type'] ?? '',
    });
    const isStaticAsset = ['image', 'stylesheet', 'script', 'font'].includes(request.resourceType())
      || /\.(?:avif|css|gif|ico|jpe?g|js|png|svg|webp|woff2?)(?:[?#]|$)/i.test(url);
    if (isStaticAsset && response.status() >= 400) {
      assetFailures.push(`${response.status()} ${url}`);
    }
  });
  try {
    if (STAGING_EVIDENCE_DIR) {
      await page.context().tracing.start({ screenshots: true, snapshots: true, sources: false });
      tracingStarted = true;
    }
    const resp = await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    const status = resp?.status() ?? 0;
    const bodyText = await page.locator('body').innerText({ timeout: 15000 }).catch(() => '');
    const html = await page.content();
    const iconUrls = await page.locator('link[rel~="icon"]').evaluateAll((links) =>
      links.map((link) => link.href).filter(Boolean),
    );
    for (const iconUrl of iconUrls) {
      const iconResponse = await page.context().request.get(iconUrl, { timeout: 15000 });
      if (iconResponse.status() >= 400) assetFailures.push(`${iconResponse.status()} ${iconUrl}`);
    }
    const fatal = consoleErrors.filter(
      (e) => !/favicon|Download the React DevTools|net::ERR_BLOCKED|Failed to load resource/i.test(e),
    );
    const issues = [];
    let info = {};
    try {
      info = await assertFn({ page, status, bodyText, html, fatal, consoleErrors });
    } catch (e) {
      issues.push(e instanceof Error ? e.message : String(e));
    }
    if (assetFailures.length) issues.push(`static asset failures: ${assetFailures.slice(0, 8).join(' | ')}`);
    if (issues.length) throw new Error(issues.join('; '));
    results.push({ name, ok: true, status, responseCount: responses.length, ...info, fatal: fatal.slice(0, 5) });
  } catch (e) {
    results.push({
      name,
      ok: false,
      error: String(e),
      responseCount: responses.length,
      consoleErrors: consoleErrors.slice(0, 8),
    });
  } finally {
    if (STAGING_EVIDENCE_DIR) {
      const evidenceErrors = [];
      try {
        await page.screenshot({
          path: join(STAGING_EVIDENCE_DIR, `${name}.png`),
          fullPage: false,
          animations: 'disabled',
        });
      } catch (e) {
        evidenceErrors.push(`screenshot: ${String(e)}`);
      }
      if (tracingStarted) {
        try {
          await page.context().tracing.stop({ path: join(STAGING_EVIDENCE_DIR, `${name}.trace.zip`) });
        } catch (e) {
          evidenceErrors.push(`trace: ${String(e)}`);
        }
      }
      try {
        await writeFile(
          join(STAGING_EVIDENCE_DIR, `${name}.network.json`),
          `${JSON.stringify({ page: url, responses }, null, 2)}\n`,
          'utf8',
        );
      } catch (e) {
        evidenceErrors.push(`network log: ${String(e)}`);
      }
      if (evidenceErrors.length) {
        results.push({ name: `${name}-evidence`, ok: false, error: evidenceErrors.join('; ') });
      }
    }
    await page.close();
  }
}

await check('marketing', MKT, async ({ page, status, bodyText, html, fatal }) => {
  if (status !== 200) throw new Error(`status ${status}`);
  if (/Internal Error|{"message"/i.test(bodyText)) throw new Error('error page');
  const hasBrand = /KipusPay|kipus/i.test(html + bodyText);
  if (!hasBrand && bodyText.trim().length < 20) throw new Error('blank/empty shell');
  const issues = [];
  const blockedClaims = findBlockedMarketingClaims(bodyText);
  if (blockedClaims.length) issues.push(`blocked marketing claims: ${blockedClaims.join(' | ')}`);
  const loginHrefs = await page.locator('a[href*="/login"]').evaluateAll((links) =>
    links.map((link) => link.href),
  );
  const linkedVerticalPaths = await page.locator('a[href*="/para/"]').evaluateAll((links) =>
    links
      .map((link) => new URL(link.href).pathname)
      .filter((pathname) => /^\/para\/[^/]+\/?$/.test(pathname)),
  );
  marketingVerticalPaths = [...new Set(linkedVerticalPaths)].sort();
  if (marketingVerticalPaths.length !== EXPECTED_VERTICAL_COUNT) {
    issues.push(
      `expected ${EXPECTED_VERTICAL_COUNT} linked verticals, found ${marketingVerticalPaths.length}`,
    );
  }
  const expectedPosOrigin = new URL(POS).origin;
  if (!loginHrefs.some((href) => new URL(href).origin === expectedPosOrigin)) {
    issues.push(`marketing login links do not target deployed POS ${expectedPosOrigin}`);
  }
  if (issues.length) throw new Error(issues.join('; '));
  const hard = fatal.filter((e) => /TypeError|ReferenceError|SyntaxError/i.test(e));
  if (hard.length) throw new Error(`console fatals: ${hard.join(' | ')}`);
  return { snippet: bodyText.slice(0, 160).replace(/\s+/g, ' ') };
});

await check('marketing-onboarding', new URL('empezar', MKT).href, async ({ status, bodyText }) => {
  if (status !== 200) throw new Error(`status ${status}`);
  assertNoBlockedMarketingClaims(bodyText);
  if (!/KipusPay|paso/i.test(bodyText)) throw new Error('onboarding content missing');
  return { snippet: bodyText.slice(0, 160).replace(/\s+/g, ' ') };
});

if (marketingVerticalPaths.length !== EXPECTED_VERTICAL_COUNT) {
  results.push({
    name: 'marketing-vertical-discovery',
    ok: false,
    error: `expected ${EXPECTED_VERTICAL_COUNT} linked verticals, found ${marketingVerticalPaths.length}`,
  });
} else {
  for (const path of marketingVerticalPaths) {
    const slug = path.split('/').filter(Boolean).at(-1);
    await check(`marketing-vertical-${slug}`, new URL(path, MKT).href, async ({ page, status, bodyText, html }) => {
      if (status !== 200) throw new Error(`status ${status}`);
      if (/Internal Error|{"message"/i.test(bodyText)) throw new Error('error page');
      if (!/KipusPay|restaurante|farmacia|retail|servicio|cadena|grifos|gasolin/i.test(html + bodyText)) {
        throw new Error('vertical page content missing');
      }
      assertNoBlockedMarketingClaims(bodyText);
      const heading = await page.getByRole('heading', { level: 1 }).first().innerText().catch(() => '');
      if (!heading.trim()) throw new Error('vertical heading missing');
      return { title: await page.title(), heading, snippet: bodyText.slice(0, 120).replace(/\s+/g, ' ') };
    });
  }
}

await check('pos-login', new URL('login', POS).href, async ({ page, status, bodyText, html, fatal }) => {
  if (status !== 200) throw new Error(`status ${status}`);
  if (/Internal Error|{"message"/i.test(bodyText)) throw new Error('error page');
  if (bodyText.trim().length < 5 && html.length < 200) throw new Error('no POS shell');
  const api = await page.evaluate(async (apiUrl) => {
    try {
      const r = await fetch(apiUrl, { credentials: 'omit' });
      return { ok: r.ok, status: r.status, body: await r.text(), corsOk: true };
    } catch (e) {
      return { ok: false, status: 0, body: String(e), corsOk: false };
    }
  }, API);
  if (!api.corsOk || api.status !== 200 || !String(api.body).includes('ok')) {
    throw new Error(`API from browser failed: ${JSON.stringify(api)}`);
  }
  const hard = fatal.filter((e) => /TypeError|ReferenceError|SyntaxError/i.test(e));
  if (hard.length) throw new Error(`console hard: ${hard.join(' | ')}`);
  return { snippet: bodyText.slice(0, 160).replace(/\s+/g, ' '), api };
});

await browser.close();
console.log(JSON.stringify(results, null, 2));
if (results.some((r) => !r.ok)) process.exit(1);
