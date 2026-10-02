const { chromium } = require("./playwright-runtime.cjs");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.VAULT_TEST_URL || "http://127.0.0.1:4173/index.html#/tv";
const assert = (value, message) => { if (!value) throw new Error(message); };

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.vaultReady === "true", null, { timeout: 90000 });
    await page.waitForSelector(".series-row__open");
    await page.locator("#boot:not(.dismissed)").click().catch(() => {});
    const initialScale = await page.evaluate(() => document.body.dataset.uiScale);

    await page.locator('[data-tv-filter="scope"][data-tv-value="all"]').click();
    assert(await page.locator('[data-tv-filter="scope"][data-tv-value="all"]').evaluate(node => node.classList.contains("primary")), "TV scope filter click was swallowed.");
    assert(await page.evaluate(() => document.body.dataset.uiScale) === initialScale, "TV filter changed interface scale.");

    const firstId = await page.locator(".series-row__open").first().getAttribute("data-open-series");
    await page.locator(".series-row__open").first().click();
    await page.waitForSelector(".series-header");
    assert(locationSafe(await page.url()).includes(`/tv/${encodeURIComponent(firstId)}`), "TV series card did not open its dedicated page.");
    assert(await page.evaluate(() => document.body.dataset.uiScale) === initialScale, "TV series click changed interface scale.");

    await page.locator("[data-tv-back]").click();
    await page.waitForSelector(".series-row__open");
    await page.goto(`${new URL(BASE).origin}/index.html#/home`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("button[data-ui-scale='1']");
    await page.locator("button[data-ui-scale='1']").click();
    assert(await page.evaluate(scale => document.body.dataset.uiScale !== scale, initialScale), "Actual scale button did not change interface scale.");
    assert(!errors.length, `Runtime errors: ${JSON.stringify(errors)}`);
    console.log(JSON.stringify({ ok: true, initialScale, firstId, errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });

function locationSafe(url) {
  return decodeURIComponent(new URL(url).hash);
}
