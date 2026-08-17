import { chromium } from '@playwright/test';

const MKT = 'https://kipuspay-marketing-web-staging.pages.dev/';
const POS = 'https://kipuspay-pos-web-staging.pages.dev/';
const API = 'https://kipuspay-worker-api-staging.cristian-pcalderon.workers.dev/health';

const browser = await chromium.launch({ headless: true });
const results = [];

async function check(name, url, assertFn) {
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const status = resp?.status() ?? 0;
    await page.waitForTimeout(2000);
    const bodyText = await page.locator('body').innerText({ timeout: 15000 }).catch(() => '');
    const html = await page.content();
    const fatal = consoleErrors.filter(
      (e) => !/favicon|Download the React DevTools|net::ERR_BLOCKED|Failed to load resource/i.test(e),
    );
    const info = await assertFn({ page, status, bodyText, html, fatal, consoleErrors });
    results.push({ name, ok: true, status, ...info, fatal: fatal.slice(0, 5) });
  } catch (e) {
    results.push({ name, ok: false, error: String(e), consoleErrors: consoleErrors.slice(0, 8) });
  } finally {
    await page.close();
  }
}

await check('marketing', MKT, async ({ status, bodyText, html, fatal }) => {
  if (status !== 200) throw new Error(`status ${status}`);
  if (/Internal Error|{"message"/i.test(bodyText)) throw new Error('error page');
  const hasBrand = /KipusPay|kipus/i.test(html + bodyText);
  if (!hasBrand && bodyText.trim().length < 20) throw new Error('blank/empty shell');
  const hard = fatal.filter((e) => /TypeError|ReferenceError|SyntaxError/i.test(e));
  if (hard.length) throw new Error(`console fatals: ${hard.join(' | ')}`);
  return { snippet: bodyText.slice(0, 160).replace(/\s+/g, ' ') };
});

await check('pos', POS, async ({ page, status, bodyText, html, fatal }) => {
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
