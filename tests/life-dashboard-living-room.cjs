const { chromium } = require("./playwright-runtime.cjs");
const BASE = "http://127.0.0.1:4173/index.html";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const errors = [], http = [], external = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("response", response => { if (response.status() >= 400 && !response.url().includes("favicon")) http.push(`${response.status()} ${response.url()}`); });
  page.on("request", request => { if (!request.url().startsWith("http://127.0.0.1:4173")) external.push(request.url()); });
  await page.route("**/__vault/inventory", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ scanned: true, root: "D:\\TV Shows", scannedAt: new Date().toISOString(), durationMs: 12, fileCount: 2, files: [
      { path: "D:\\TV Shows\\Known\\S01E01.mkv", name: "S01E01.mkv", bytes: 100 },
      { path: "D:\\TV Shows\\DVD Rips\\Disc 1.mkv", name: "Disc 1.mkv", bytes: 200 }
    ] })
  }));
  const open = async route => {
    await page.goto(`${BASE}#/${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#schema-version")?.textContent === "42", null, { timeout: 90000 });
    await page.locator("#boot:not(.dismissed)").click().catch(() => {});
    await page.waitForFunction(expected => document.querySelector("#view-code")?.textContent === `VAULT://${expected.toUpperCase()}`, route.split("/")[0]);
  };
  try {
    await open("dashboard");
    const baseline = await page.evaluate(async () => {
      const { getState } = await import("./js/core/store.js");
      return JSON.stringify(Object.entries(getState().items).sort(([a],[b]) => a.localeCompare(b)));
    });
    const dashboard = await page.evaluate(() => ({
      title: document.querySelector("#view-title")?.textContent,
      domains: document.querySelectorAll(".life-domain-card").length,
      focused: document.querySelectorAll(".life-domain-card.is-focus").length,
      hero: !!document.querySelector(".life-hero"),
      tonight: !!document.querySelector('[data-route="tonight"]'),
      overflow: document.documentElement.scrollWidth > innerWidth
    }));
    assert(dashboard.title === "Life Dashboard" && dashboard.hero && dashboard.tonight, "Life Dashboard did not become the front door.");
    assert(dashboard.domains === 11 && dashboard.focused >= 1 && !dashboard.overflow, "The complete interest map is not usable.");
    await page.locator("[data-life-focus]").first().click();
    await page.waitForTimeout(80);
    const afterFocus = await page.evaluate(async () => {
      const { getState } = await import("./js/core/store.js");
      return { focus: getState().metadata.lifeDashboard.preferences.focusDomains, items: JSON.stringify(Object.entries(getState().items).sort(([a],[b]) => a.localeCompare(b))) };
    });
    assert(afterFocus.items === baseline && afterFocus.focus.length <= 6, "Dashboard focus changed library records.");
    await page.screenshot({ path: "D:/Vault/tests/life-dashboard.png", fullPage: true });

    await open("tonight");
    const tonight = await page.evaluate(() => ({
      title: document.querySelector("#view-title")?.textContent,
      deck: document.querySelectorAll(".tonight-choice").length,
      lanes: [...document.querySelectorAll(".tonight-choice .eyebrow")].map(node => node.textContent.split("//")[0].trim()),
      wings: [...document.querySelectorAll(".tonight-choice .eyebrow")].map(node => node.textContent.split("//")[1]?.trim()),
      playable: document.querySelectorAll("[data-living-play]").length,
      controls: document.querySelectorAll("[data-life-pref]").length,
      foundation: document.querySelectorAll(".living-foundation-grid>.panel").length,
      overflow: document.documentElement.scrollWidth > innerWidth
    }));
    assert(tonight.title === "Tonight" && tonight.deck === 5, "Tonight did not produce five choices.");
    assert(new Set(tonight.lanes).size === 5 && new Set(tonight.wings).size >= 3 && tonight.playable > 0 && tonight.controls === 10 && tonight.foundation === 4 && !tonight.overflow, "Tonight's decision surface is incomplete.");
    await page.locator('[data-life-pref="timeAvailable"][data-life-value="30"]').click();
    await page.waitForFunction(() => document.querySelector('[data-life-pref="timeAvailable"][data-life-value="30"]')?.classList.contains("active"));
    await page.locator("[data-life-library-check]").click();
    await page.waitForFunction(() => document.querySelector(".living-foundation-grid")?.textContent.includes("2 FILES OBSERVED"));
    const library = await page.evaluate(async () => {
      const { getState } = await import("./js/core/store.js");
      return getState().metadata.lifeDashboard.libraryPulse;
    });
    assert(library.fileCount === 2 && library.informationalCount >= 1 && library.note.includes("DVD"), "Read-only library awareness failed.");
    await page.locator(".couch-action").first().focus();
    const beforeArrow = await page.evaluate(() => document.activeElement?.outerHTML);
    await page.keyboard.press("ArrowRight");
    const afterArrow = await page.evaluate(() => document.activeElement?.outerHTML);
    assert(beforeArrow !== afterArrow, "Couch keyboard navigation failed.");
    await page.screenshot({ path: "D:/Vault/tests/living-room-tonight.png", fullPage: true });

    const lifecycle = await page.evaluate(async () => {
      const { getState } = await import("./js/core/store.js");
      const { beginPlaybackSession, markPlaybackReturn, ratePlaybackSession, resolvePlaybackSession } = await import("./js/systems/playbackLifecycle.js");
      const show = Object.values(getState().items).find(item => item.wing === "tv" && Object.values(item.episodes || {}).some(episode => episode.sourcePath && episode.status !== "completed"));
      const episode = show && Object.values(show.episodes).find(entry => entry.sourcePath && entry.status !== "completed");
      if (!show || !episode) return null;
      const prior = episode.status, session = beginPlaybackSession(show.id, episode.id, episode.sourcePath);
      markPlaybackReturn(); ratePlaybackSession(session.id, 9);
      const unresolved = getState().items[show.id].episodes[episode.id].status;
      resolvePlaybackSession(session.id, "not_yet");
      return { prior, unresolved, rating: getState().items[show.id].episodes[episode.id].rating, decision: getState().metadata.lifeDashboard.playbackSessions.find(entry => entry.id === session.id).status };
    });
    assert(lifecycle && lifecycle.unresolved === lifecycle.prior && lifecycle.rating === 9 && lifecycle.decision === "not_yet", "Explicit playback follow-up changed completion without consent.");

    await page.setViewportSize({ width: 390, height: 844 });
    await open("dashboard");
    const mobileDashboard = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, dock: document.querySelectorAll("#mobile-dock button").length, domains: document.querySelectorAll(".life-domain-card").length }));
    assert(!mobileDashboard.overflow && mobileDashboard.dock === 5 && mobileDashboard.domains === 11, "Mobile Life Dashboard failed.");
    await open("tonight");
    const mobileTonight = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, deck: document.querySelectorAll(".tonight-choice").length, minButton: Math.min(...[...document.querySelectorAll(".couch-action")].map(button => button.getBoundingClientRect().height).filter(Boolean)) }));
    assert(!mobileTonight.overflow && mobileTonight.deck === 5 && mobileTonight.minButton >= 29, "Mobile Tonight failed.");
    await page.screenshot({ path: "D:/Vault/tests/living-room-tonight-mobile.png", fullPage: true });
    assert(!errors.length && !http.length && !external.length, `Runtime errors: ${JSON.stringify({ errors, http, external })}`);
    console.log(JSON.stringify({ ok: true, dashboard, tonight, library, lifecycle, mobileDashboard, mobileTonight, errors, http, external }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
