const { chromium } = require("./playwright-runtime.cjs");

const BASE = "http://127.0.0.1:4173/index.html";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const pageErrors = [], httpErrors = [], externalRequests = [];
  page.on("pageerror", error => pageErrors.push(String(error)));
  page.on("response", response => { if (response.status() >= 400 && !response.url().includes("favicon")) httpErrors.push({ url: response.url(), status: response.status() }); });
  page.on("request", request => { if (!request.url().startsWith("http://127.0.0.1:4173")) externalRequests.push(request.url()); });

  try {
    await page.goto(`${BASE}#/home`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#schema-version")?.textContent === "42", null, { timeout: 60000 });
    await page.waitForTimeout(700);
    const baseline = await page.evaluate(async () => {
      const store = await import("./js/core/store.js");
      const health = await import("./js/systems/health.js");
      return {
        health: health.runHealthCheck(),
        records: Object.keys(store.getState().items).length,
        episodes: Object.values(store.getState().items).flatMap(item => Object.values(item.episodes || {})).length,
        navGroups: document.querySelectorAll(".nav-group").length,
        navButtons: document.querySelectorAll(".nav-button").length
      };
    });

    await page.goto(`${BASE}#/movies`);
    await page.waitForTimeout(450);
    const movies = await page.evaluate(() => ({
      cards: document.querySelectorAll(".collection-card").length,
      nodes: document.querySelectorAll("*").length,
      buttons: document.querySelectorAll("button").length,
      pages: document.querySelector(".library-pager")?.textContent || ""
    }));
    await page.locator("[data-library-status=completed]").click();
    const filter = await page.evaluate(() => ({
      active: document.querySelector("[data-library-status].primary")?.dataset.libraryStatus,
      matches: document.querySelector(".library-controls>span")?.textContent
    }));
    await page.locator("[data-library-status=all]").click();
    await page.locator("[data-open-library-collection]").first().click();
    const collectionHash = await page.evaluate(() => location.hash);
    await page.locator("[data-open-library-item]").first().click();
    await page.waitForSelector(".record-dashboard [data-record-rating]");
    const item = {
      hash: await page.evaluate(() => location.hash),
      ratings: await page.locator(".record-dashboard [data-record-rating]").count()
    };
    const ratingMs = await page.evaluate(async () => {
      const start = performance.now();
       document.querySelectorAll(".record-dashboard [data-record-rating]")[5].click();
      await (await import("./js/core/store.js")).flushPersistence();
      return performance.now() - start;
    });

    await page.goto(`${BASE}#/tv`);
    await page.waitForTimeout(500);
    const tv = {
      genres: await page.locator(".tv-genre-overview button").count(),
      series: await page.locator(".series-row").count(),
      daily: await page.locator(".daily-tv-card").count()
    };
    await page.goto(`${BASE}#/tv/tv_legacy_the_simpsons`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".series-header");
    const durableSeries = await page.evaluate(() => ({ hash: location.hash, title: document.querySelector(".series-header h2")?.textContent }));
    const episodeId = await page.evaluate(async () => {
      const store = await import("./js/core/store.js");
      const show = store.getState().items.tv_legacy_the_simpsons;
      const episode = Object.values(show.episodes)[0];
      store.update(save => { save.items[show.id].episodes[episode.id].note = `</textarea><img id="xss-probe" src="x" onerror="window.__xss=1">`; }, { persist: false });
      window.__xss = 0;
      return episode.id;
    });
    await page.locator(`[data-edit-episode="${episodeId}"]`).click();
    const security = await page.evaluate(() => ({ probe: Boolean(document.querySelector("#xss-probe")), executed: window.__xss, note: document.querySelector("[data-note]")?.value }));
    await page.keyboard.press("Escape");
    const escapeClosed = await page.locator(".modal").count() === 0;

    const database = await page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open("vault_reconstruction_archive");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const keys = request.result.transaction("state", "readonly").objectStore("state").getAllKeys();
        keys.onsuccess = () => resolve({
          core: keys.result.includes("core_v2"),
          events: keys.result.includes("events_v2"),
          items: keys.result.filter(key => String(key).startsWith("item:")).length
        });
      };
    }));

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`${BASE}#/tv`, { waitUntil: "domcontentloaded" });
    await mobilePage.waitForFunction(() => document.querySelector("#schema-version")?.textContent === "42", null, { timeout: 60000 });
    await mobilePage.waitForSelector(".nav-group>summary");
    const mobile = await mobilePage.evaluate(() => ({
      summaries: document.querySelectorAll(".nav-group>summary").length,
      visibleButtons: [...document.querySelectorAll(".nav-button")].filter(button => button.offsetParent !== null).length,
      searchVisible: document.querySelector("#global-search").offsetParent !== null,
      overflow: document.documentElement.scrollWidth > innerWidth
    }));
    await mobileContext.close();

    const output = { baseline, movies, filter, collectionHash, item, ratingMs, tv, durableSeries, security, escapeClosed, database, mobile, pageErrors, httpErrors, externalRequests };
    output.ok = baseline.health.ok && baseline.records === 3543 && baseline.episodes === 13055 && baseline.navGroups === 5 &&
      movies.cards <= 24 && movies.nodes < 2000 && movies.buttons < 500 && /PAGE 1 OF/.test(movies.pages) &&
      filter.active === "completed" && collectionHash.includes("/collection/") && item.hash.includes("/record/") && item.ratings === 10 && ratingMs < 200 &&
      tv.genres === 10 && tv.series <= 72 && tv.daily > 0 && durableSeries.hash.includes("tv_legacy_the_simpsons") &&
      !security.probe && security.executed === 0 && /xss-probe/.test(security.note) && escapeClosed &&
      database.core && database.events && database.items === 3543 && mobile.summaries === 5 && mobile.visibleButtons === 0 && mobile.searchVisible && !mobile.overflow &&
      pageErrors.length === 0 && httpErrors.length === 0 && externalRequests.length === 0;
    console.log(JSON.stringify(output, null, 2));
    if (!output.ok) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
