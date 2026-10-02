const { chromium } = require("./playwright-runtime.cjs");
const BASE = "http://127.0.0.1:4173/index.html";
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
    await page.goto(`${BASE}#/tv`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#schema-version")?.textContent === "42", null, { timeout: 90000 });
    await page.waitForFunction(() => document.querySelector(".tv-history-recovery")?.textContent.includes("568 ORIGINAL WATCHED EPISODES"));
    await page.locator("#boot:not(.dismissed)").click().catch(() => {});
    const result = await page.evaluate(async () => {
      const { getState } = await import("./js/core/store.js");
      const { importBundledLegacyTvHistory } = await import("./js/systems/legacyTvHistory.js");
      const state = getState(), tv = Object.values(state.items).filter(item => item.wing === "tv" && !item.id.startsWith("tv_drive_"));
      const episodes = tv.flatMap(show => Object.values(show.episodes || {}));
      const dailyIds = [...document.querySelectorAll(".tv-daily [data-open-series]")].map(node => node.dataset.openSeries);
      const recommendationIds = [...document.querySelectorAll(".tv-own-card")].map(node => node.dataset.openSeries);
      const firstImport = state.metadata.legacyTvHistory;
      const eventCount = state.events.length, secondReport = await importBundledLegacyTvHistory();
      return {
        report: firstImport.report,
        completed: episodes.filter(episode => episode.status === "completed").length,
        approximate: episodes.filter(episode => episode.completionDateApproximate).length,
        ratingReview: episodes.filter(episode => episode.ratingNeedsReview && episode.legacyFiveDiamondRating).length,
        notes: episodes.filter(episode => String(episode.note || "").trim()).length,
        owned: tv.filter(show => show.owned).length,
        daily: dailyIds.length,
        dailyAllOwned: dailyIds.every(id => state.items[id]?.owned),
        recommendations: recommendationIds.length,
        recommendationsAllUnowned: recommendationIds.every(id => !state.items[id]?.owned),
        recommendationLocked: document.querySelector(".tv-rec-locked")?.textContent.trim(),
        ownedDefault: document.querySelector('[data-tv-filter="scope"][data-tv-value="owned"]')?.classList.contains("primary"),
        idempotent: eventCount === state.events.length && secondReport.matched === firstImport.report.matched,
        overflow: document.documentElement.scrollWidth > innerWidth
      };
    });
    console.log("TV_RESULT", JSON.stringify(result));
    assert(result.report.requested === 568 && result.report.matched === 568 && result.report.unmatchedShows === 0 && result.report.unmatchedEpisodes === 0, "Original TV history did not match exactly.");
    assert(result.completed >= 568 && result.approximate === 568, "Watched episode state or provenance is incomplete.");
    assert(result.report.legacyRatingsFlagged === 43 && result.ratingReview === 43 && result.report.notesImported === 33 && result.notes >= 33, "Legacy reviews were not preserved for rerating.");
    assert(result.owned >= 142 && result.daily > 0 && result.dailyAllOwned && result.ownedDefault, "Owned television is not first.");
    assert(result.recommendations === 0 && result.recommendationsAllUnowned && result.recommendationLocked === "PROFILE WAITING", "Cold-start television exposed recommendations before a new watch event.");
    assert(result.idempotent && !result.overflow, "Import idempotence or desktop layout failed.");
    await page.screenshot({ path: "D:/Vault/tests/tv-owned-first.png", fullPage: true });

    assert(!errors.length && !http.length && !external.length, `Runtime errors: ${JSON.stringify({ errors, http, external })}`);
    console.log(JSON.stringify({ ok: true, result, errors, http, external }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
