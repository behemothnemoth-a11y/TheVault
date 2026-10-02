const { chromium } = require("./playwright-runtime.cjs");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.VAULT_TEST_URL || "http://127.0.0.1:4173/index.html#/music";
const assert = (value, message) => { if (!value) throw new Error(message); };

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.vaultReady === "true", null, { timeout: 30000 });
    await page.evaluate(async () => {
      const store = await import("./js/core/store.js");
      store.update(save => {
        save.items = {};
        save.metadata.music = {};
        for (let index = 0; index < 10; index++) {
          save.items[`track_${index}`] = {
            id: `track_${index}`, wing: "music", type: "music",
            title: `Song ${index + 1}`, creator: index < 7 ? "Alpha Artist" : "Beta Artist",
            series: index < 5 ? "First Album" : index < 7 ? "Second Album" : "Beta Album",
            occurrences: index + 1,
            lastSourceAt: new Date(Date.UTC(2026, 7, 30, 12, index)).toISOString()
          };
        }
      }, { persist: false });
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await page.waitForSelector(".music-artist-grid");
    assert(await page.locator(".music-recent-grid>button").count() === 8, "Recently played did not stop at eight songs.");
    assert(await page.locator(".music-artist-card").count() === 2, "Listening history did not group into artist cards.");
    assert((await page.locator(".music-artist-card").first().textContent()).includes("Alpha Artist"), "Most-played artist was not first.");
    await page.locator('[data-open-music-artist="Alpha Artist"]').first().click();
    await page.waitForSelector(".music-artist-page");
    assert(await page.locator(".music-album").count() === 2, "Artist page did not group listened songs into albums.");
    assert(await page.locator(".music-album li").count() === 7, "Artist page did not retain listened songs.");
    await page.locator("[data-music-track]").click();
    assert((await page.locator("[data-music-track]").textContent()).includes("TRACKING"), "Artist tracking did not toggle.");
    await page.locator("[data-music-album-finished]").first().click();
    assert((await page.locator("[data-music-album-finished]").first().textContent()).includes("FINISHED"), "Album completion did not toggle.");
    const imported = await page.evaluate(async () => {
      const music = await import("./js/wings/music.js");
      const store = await import("./js/core/store.js");
      const first = { ts: "2026-08-01T10:00:00Z", ms_played: 180000, master_metadata_track_name: "Imported Song", master_metadata_album_artist_name: "Import Artist", master_metadata_album_album_name: "Import Album", spotify_track_uri: "spotify:track:vault-test" };
      const second = { ...first, ts: "2026-08-02T10:00:00Z", ms_played: 175000 };
      const fileA = new File([JSON.stringify([first, second])], "Streaming_History_Audio_2026_0.json", { type: "application/json" });
      const fileB = new File([JSON.stringify([first])], "Streaming_History_Audio_2026_1.json", { type: "application/json" });
      const initial = await music.importSpotifyHistoryFiles([fileA, fileB]);
      const repeated = await music.importSpotifyHistoryFiles([fileA, fileB]);
      const item = Object.values(store.getState().items).find(value => value.externalUrl === "spotify:track:vault-test");
      return { initial, repeated, plays: item?.occurrences, milliseconds: item?.musicMeta?.millisecondsPlayed };
    });
    assert(imported.initial.added === 2 && imported.initial.duplicates === 1, "Overlapping Spotify files were not deduplicated.");
    assert(imported.repeated.added === 0 && imported.repeated.duplicates === 3, "Repeating a Spotify import inflated play counts.");
    assert(imported.plays === 2 && imported.milliseconds === 355000, "Spotify play totals or listening time were incorrect.");
    assert(!errors.length, `Runtime errors: ${JSON.stringify(errors)}`);
    console.log(JSON.stringify({ ok: true, recent: 8, artists: 2, albums: 2, songs: 7, spotifyAdded: imported.initial.added, spotifyDuplicates: imported.initial.duplicates, repeatAdded: imported.repeated.added }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
