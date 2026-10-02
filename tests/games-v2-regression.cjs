const { chromium } = require("./playwright-runtime.cjs");
const BASE = process.env.VAULT_TEST_URL || "http://127.0.0.1:4174/index.html#/games";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#schema-version")?.textContent === "43", null, { timeout: 90000 });
    await page.locator("#boot:not(.dismissed)").click().catch(() => {});
    await page.waitForSelector(".games-v2");
    const result = await page.evaluate(async () => {
      const store = await import("./js/core/store.js");
      const games = await import("./js/wings/gamesV2.js?v=20260901-v4");
      const now = new Date().toISOString();
      const meta = (relationship, playStatus) => ({ relationship, playStatus, explicitBacklog: false, recordedMinutes: null, trackedSeconds: 0, playthroughs: [], milestones: [], sources: [], manualFields: {}, history: [] });
      store.update(save => {
        save.items.game_test_owned = { id: "game_test_owned", wing: "games", type: "game", title: "Regression Owned", owned: true, favorite: false, status: "backlog", genres: [], artwork: "", addedAt: now, gameMeta: meta("owned", "completed") };
        save.items.game_test_wish = { id: "game_test_wish", wing: "games", type: "game", title: "Regression Wish", owned: false, favorite: false, status: "backlog", genres: [], artwork: "", addedAt: now, gameMeta: meta("wishlist", "unplayed") };
      });
      const guarded = games.setGameStatus("game_test_owned", "playing");
      games.setGameStatus("game_test_owned", "playing", "new_playthrough");
      games.toggleGameBacklog("game_test_owned");
      games.toggleGameFavorite("game_test_owned");
      games.setGameRating("game_test_owned", 9);
      games.setRecordedPlaytime("game_test_owned", 12.5);
      games.addGameMilestone("game_test_owned", "Regression milestone");
      games.beginGamePlaythrough("game_test_owned", "New Game+");
      games.startGameSession("game_test_owned");
      store.update(save => { save.items.game_test_owned.gameMeta.activeSession.startedAt = new Date(Date.now() - 125000).toISOString(); });
      const seconds = games.stopGameSession("game_test_owned");
      store.update(save => { save.metadata.games.importReview = [{ key: "steam:999", source: "steam", title: "Regression Owned", path: "test", status: "pending" }]; });
      const merged = games.resolveGameImport("steam:999", "add");
      const state = store.getState(), item = state.items.game_test_owned;
      return { guarded: guarded.needsChoice, status: item.gameMeta.playStatus, backlog: item.gameMeta.explicitBacklog, favorite: item.favorite, rating: item.rating, recorded: item.gameMeta.recordedMinutes, seconds, milestones: item.gameMeta.milestones.length, playthroughs: item.gameMeta.playthroughs.length, history: item.gameMeta.history.length, merged, duplicates: Object.values(state.items).filter(value => value.wing === "games" && value.title === "Regression Owned").length, importStatus: state.metadata.games.importReview[0].status };
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".games-v2");
    const nav = await page.locator(".games2-nav button").allTextContents();
    assert(nav.length === 6, "Games permanent navigation is incomplete.");
    assert(result.guarded && result.status === "playing", "Return classification guard failed.");
    assert(result.backlog && result.favorite && result.rating === 9, "Explicit game controls failed.");
    assert(result.recorded === 750 && result.seconds >= 120, "Dual playtime tracking failed.");
    assert(result.milestones === 1 && result.playthroughs === 1 && result.history >= 2, "Forward history or depth records failed.");
    assert(result.merged === "game_test_owned" && result.duplicates === 1 && result.importStatus === "merged", "Duplicate import merge failed.");
    assert(!errors.length, `Browser errors: ${errors.join(" | ")}`);
    await page.screenshot({ path: "D:/Vault/tests/games-v2-regression.png", fullPage: true });
    console.log(JSON.stringify({ ok: true, nav, ...result, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
