const { chromium } = require("./playwright-runtime.cjs");
const BASE = "http://127.0.0.1:4173/index.html#/games";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], http = [], external = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("response", response => { if (response.status() >= 400 && !response.url().includes("favicon")) http.push(`${response.status()} ${response.url()}`); });
  page.on("request", request => { if (!request.url().startsWith("http://127.0.0.1:4173")) external.push(request.url()); });
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#schema-version")?.textContent === "42", null, { timeout: 90000 });
    await page.waitForSelector(".games-wing");
    await page.locator("#boot:not(.dismissed)").click().catch(() => {});
    const result = await page.evaluate(() => {
      const root = document.querySelector(".games-wing");
      const fit = [...document.querySelectorAll('[data-game-card-kind="fit"]')].map(node => node.dataset.gameId);
      const suggestions = [...document.querySelectorAll('[data-game-card-kind="suggestion"]')].map(node => node.dataset.gameId);
      return {
        counts: [root.dataset.gamesCount, root.dataset.gamesOwned, root.dataset.gamesWorkshop, root.dataset.gamesCreative].map(Number),
        fit, suggestions, overflow: document.documentElement.scrollWidth > innerWidth
      };
    });
    assert(JSON.stringify(result.counts) === JSON.stringify([48, 6, 27, 5]), `Incorrect Games classification: ${result.counts}`);
    const ownership = await page.evaluate(async ({ fit, suggestions }) => {
      const { getState } = await import("./js/core/store.js"), state = getState();
      const ownedIds = new Set(state.collections.collection_legacy_gam_on_the_drive_steamlibrary.itemIds);
      return { fitOwned: fit.every(id => ownedIds.has(id)), suggestionsUnowned: suggestions.every(id => !ownedIds.has(id)) };
    }, result);
    assert(result.fit.length === 3 && ownership.fitOwned, "Owned session picks contain an unowned game.");
    assert(result.suggestions.length === 4 && ownership.suggestionsUnowned, "Worth adding contains an owned game.");
    await page.locator('[data-games-filter="owned"]').click();
    assert(await page.locator(".games-library .games-card").count() === 6, "Owned filter did not show exactly six games.");
    const target = result.fit[0];
    await page.locator(`[data-game-card-kind="fit"][data-game-id="${target}"] [data-record-status]`).click();
    const status = await page.evaluate(async id => (await import("./js/core/store.js")).getState().items[id].status, target);
    assert(status === "in_progress", "Quick start did not update the target game.");
    await page.locator('[data-life-pref="timeAvailable"][data-life-value="30"]').click();
    await page.locator('[data-life-pref="energy"][data-life-value="low"]').click();
    const prefs = await page.evaluate(async () => (await import("./js/core/store.js")).getState().metadata.lifeDashboard.preferences);
    assert(prefs.timeAvailable === 30 && prefs.energy === "low", "Games session controls did not sync to the Life Dashboard.");
    await page.screenshot({ path: "D:/Vault/tests/games-first-pass.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".games-wing");
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert(!mobileOverflow, "Games overflows the mobile viewport.");
    assert(!result.overflow && !errors.length && !http.length && !external.length, `Runtime issue: ${JSON.stringify({ errors, http, external })}`);
    console.log(JSON.stringify({ ok: true, counts: result.counts, fit: result.fit.length, suggestions: result.suggestions.length, status, prefs: { timeAvailable: prefs.timeAvailable, energy: prefs.energy }, mobileOverflow, errors, http, external }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
