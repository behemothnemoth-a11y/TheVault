const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("./playwright-runtime.cjs");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.VAULT_TEST_URL || "http://127.0.0.1:4201/index.html#/music";
const EXPORT_DIR = process.env.SPOTIFY_EXPORT_DIR;
const assert = (value, message) => { if (!value) throw new Error(message); };

if (!EXPORT_DIR) throw new Error("Set SPOTIFY_EXPORT_DIR to the extracted Spotify Extended Streaming History folder.");
const files = fs.readdirSync(EXPORT_DIR)
  .filter(name => /^Streaming_History_Audio_.*\.json$/i.test(name))
  .sort()
  .map(name => path.join(EXPORT_DIR, name));
assert(files.length, "No Spotify audio history JSON files were found.");

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.vaultReady === "true", null, { timeout: 90000 });
    await page.evaluate(async () => {
      const store = await import("./js/core/store.js");
      store.update(save => { save.items = {}; save.metadata.music = {}; }, { persist: false });
    });
    const chooser = page.waitForEvent("filechooser");
    await page.locator("[data-music-import]").click();
    await (await chooser).setFiles(files);
    await page.getByText("CONFIRM SPOTIFY HISTORY IMPORT", { exact: true }).waitFor({ timeout: 120000 });
    const preview = await page.locator(".spotify-import-preview").innerText();
    await page.getByRole("button", { name: "CREATE SNAPSHOT & IMPORT" }).click();
    await page.waitForFunction(() => {
      const text = document.body.innerText;
      return text.includes("SPOTIFY HISTORY SAVED") || text.includes("SPOTIFY EXPORT ALREADY CURRENT");
    }, null, { timeout: 600000 });
    const result = await page.evaluate(async () => {
      const store = await import("./js/core/store.js");
      await store.flushPersistence();
      const state = store.getState(), items = Object.values(state.items || {}).filter(item => item.wing === "music"), last = state.metadata.music?.lastHistoryImport || {};
      return {
        last,
        items: items.length,
        artists: new Set(items.map(item => item.creator)).size,
        plays: items.reduce((sum, item) => sum + Number(item.occurrences || 0), 0),
        milliseconds: items.reduce((sum, item) => sum + Number(item.musicMeta?.millisecondsPlayed || 0), 0),
        importedEvents: state.metadata.music?.spotifyImportedEvents?.length || 0,
        storage: store.getStorageStatus()
      };
    });
    assert(/169,796 HISTORY RECORDS/.test(preview), "The real export preview row total is wrong.");
    assert(/164,331/.test(preview) && /5,436/.test(preview), "Music/podcast separation preview is wrong.");
    assert(result.last.verification?.passed, "Final real-export totals did not balance.");
    assert(result.plays === result.importedEvents, "Saved play total and event ledger disagree.");
    assert(result.last.snapshotId, "The protected pre-import recovery snapshot is missing.");
    assert(!result.storage.lastError, `Storage error: ${result.storage.lastError}`);
    assert(!errors.length, `Runtime errors: ${JSON.stringify(errors)}`);
    console.log(JSON.stringify({ ok: true, files: files.length, preview: preview.split("\n").slice(0, 5), result }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
