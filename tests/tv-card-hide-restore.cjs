const { chromium } = require("./playwright-runtime.cjs");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = "http://127.0.0.1:4173/index.html#/tv";
const assert = (value, message) => { if (!value) throw new Error(message); };

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  let hiddenId = null;
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#schema-version")?.textContent === "42", null, { timeout: 90000 });
    await page.locator("#boot:not(.dismissed)").click().catch(() => {});
    await page.waitForSelector(".series-row");

    const firstCard = page.locator(".series-row").first();
    hiddenId = await firstCard.locator("[data-open-series]").getAttribute("data-open-series");
    const title = await firstCard.locator(".series-row__open span b").innerText();
    assert(await firstCard.locator(`[data-tv-card-hide="${hiddenId}"]`).count() === 1, "Hide control is missing beside the favorite button.");
    assert(await firstCard.locator(".series-card-controls .series-favorite").count() === 1, "Favorite and hide controls are not grouped together.");

    await firstCard.locator(`[data-tv-card-hide="${hiddenId}"]`).click();
    await page.waitForFunction(id => !document.querySelector(`[data-open-series="${CSS.escape(id)}"]`), hiddenId);
    assert(await page.locator('[data-tv-filter="scope"][data-tv-value="hidden"]').count() === 1, "Hidden shelf did not appear.");

    await page.locator('[data-tv-filter="scope"][data-tv-value="hidden"]').click();
    await page.waitForSelector(`[data-tv-card-restore="${hiddenId}"]`);
    assert(await page.locator(`[data-open-series="${hiddenId}"]`).count() === 1, "Hidden card is not recoverable.");
    assert((await page.locator(".tv-poster-wall h2").innerText()).includes("HIDDEN"), "Hidden shelf heading is unclear.");

    await page.locator(`[data-tv-card-restore="${hiddenId}"]`).click();
    await page.locator('[data-tv-filter="scope"][data-tv-value="owned"]').click();
    await page.waitForSelector(`[data-open-series="${hiddenId}"]`);
    assert((await page.locator(`[data-open-series="${hiddenId}"] span b`).innerText()) === title, "Restored card changed its archive record.");
    assert(!errors.length, `Runtime errors: ${JSON.stringify(errors)}`);
    console.log(JSON.stringify({ ok: true, hiddenId, title, errors }));
    hiddenId = null;
  } finally {
    if (hiddenId) {
      await page.goto(BASE, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.locator('[data-tv-filter="scope"][data-tv-value="hidden"]').click().catch(() => {});
      await page.locator(`[data-tv-card-restore="${hiddenId}"]`).click().catch(() => {});
    }
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
