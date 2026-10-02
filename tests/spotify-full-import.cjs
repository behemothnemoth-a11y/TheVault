const { chromium } = require("./playwright-runtime.cjs");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = "http://127.0.0.1:4173/index.html#/music";
const assert = (value, message) => { if (!value) throw new Error(message); };

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.vaultReady === "true", null, { timeout: 30000 });
    const result = await page.evaluate(async () => {
      const music = await import("./js/wings/music.js");
      const store = await import("./js/core/store.js");
      store.update(save => { save.items = {}; save.metadata.music = {}; }, { persist: false });
      const basic = [{
        endTime: "2025-01-01 12:00",
        artistName: "Merge Artist",
        trackName: "Same Song",
        msPlayed: 180000,
        albumName: "Merge Album"
      }];
      const extended = [{
        ts: "2025-01-01T12:00:00Z",
        master_metadata_album_artist_name: "Merge Artist",
        master_metadata_track_name: "Same Song",
        master_metadata_album_album_name: "Merge Album",
        spotify_track_uri: "spotify:track:merge1234567890",
        ms_played: 180000
      }, {
        ts: "2025-01-02T12:00:00Z",
        episode_name: "Podcast Episode",
        episode_show_name: "Podcast Show",
        spotify_episode_uri: "spotify:episode:test",
        ms_played: 120000
      }, {
        ts: "bad date",
        master_metadata_album_artist_name: "Broken",
        master_metadata_track_name: "Broken",
        ms_played: 10
      }];
      const fileA = new File([JSON.stringify(basic)], "StreamingHistory0.json", { type: "application/json", lastModified: 1 });
      const fileB = new File([JSON.stringify(extended)], "Streaming_History_Audio_0.json", { type: "application/json", lastModified: 2 });
      const compatibility = await music.importSpotifyHistoryFiles([fileA, fileB]);
      const merged = Object.values(store.getState().items).filter(item => item.wing === "music" && item.title === "Same Song");
      const large = [];
      for (let index = 0; index < 30000; index++) large.push({
        ts: new Date(Date.UTC(2020, 0, 1) + index * 60000).toISOString(),
        master_metadata_album_artist_name: `Artist ${index % 80}`,
        master_metadata_track_name: `Track ${index % 400}`,
        master_metadata_album_album_name: `Album ${index % 120}`,
        spotify_track_uri: `spotify:track:${String(index % 400).padStart(10, "0")}`,
        ms_played: 60000 + index % 180000
      });
      const stressFile = new File([JSON.stringify(large)], "Streaming_History_Audio_full.json", { type: "application/json", lastModified: 3 });
      const started = performance.now();
      const stress = await music.importSpotifyHistoryFiles([stressFile]);
      const durationMs = performance.now() - started;
      const repeat = await music.importSpotifyHistoryFiles([stressFile]);
      const interruptedRows = [];
      for (let index = 0; index < 5000; index++) interruptedRows.push({
        ts: new Date(Date.UTC(2018, 0, 1) + index * 60000).toISOString(),
        master_metadata_album_artist_name: "Resume Artist",
        master_metadata_track_name: `Resume Track ${index % 25}`,
        master_metadata_album_album_name: "Resume Album",
        spotify_track_uri: `spotify:track:resume${String(index % 25).padStart(5, "0")}`,
        ms_played: 90000
      });
      const interruptedFile = new File([JSON.stringify(interruptedRows)], "Streaming_History_Audio_resume.json", { type: "application/json", lastModified: 4 });
      let interrupted = false;
      try {
        await music.importSpotifyHistoryFiles([interruptedFile], { onProgress: value => { if (value.current >= 2000) throw new Error("simulated close"); } });
      } catch { interrupted = true; }
      await store.flushPersistence();
      const resumed = await music.importSpotifyHistoryFiles([interruptedFile]);
      const state = store.getState();
      const job = state.metadata.music.historyImports[stress.importId];
      const resumePlays = Object.values(state.items).filter(item => item.creator === "Resume Artist").reduce((sum, item) => sum + item.occurrences, 0);
      return {
        compatibility,
        mergedCount: merged.length,
        mergedPlays: merged[0]?.occurrences,
        mergedUri: merged[0]?.musicMeta?.spotifyUri,
        stress,
        repeat,
        durationMs,
        jobStatus: job?.status,
        processed: Object.values(job?.files || {}).reduce((sum, value) => sum + value.processed, 0),
        snapshotId: job?.snapshotId,
        totalMusicItems: Object.values(state.items).filter(item => item.wing === "music").length,
        interrupted,
        resumed,
        resumePlays
      };
    });
    assert(result.compatibility.added === 1, "Basic/extended overlap was counted twice.");
    assert(result.compatibility.duplicates === 1, "Cross-format duplicate was not reported.");
    assert(result.compatibility.podcastsSkipped === 1, "Podcast activity was not separated.");
    assert(result.compatibility.rejected === 1, "Malformed Spotify row was not reported.");
    assert(result.mergedCount === 1 && result.mergedPlays === 1, "Equivalent URI and non-URI tracks did not merge.");
    assert(result.mergedUri === "spotify:track:merge1234567890", "Merged track did not retain its Spotify URI.");
    assert(result.stress.added === 30000 && result.stress.safeToClose, "Large import did not commit every play.");
    assert(result.repeat.added === 0 && result.repeat.alreadyImported, "Repeated full import did not short-circuit.");
    assert(result.jobStatus === "complete" && result.processed === 30000, "Import checkpoint did not finish.");
    assert(result.snapshotId, "Protected pre-import snapshot was not recorded.");
    assert(result.interrupted && result.resumed.resumed, "Interrupted import did not resume from its checkpoint.");
    assert(result.resumed.skippedPreviously >= 2000 && result.resumePlays === 5000, "Resumed import lost or double-counted plays.");
    assert(!errors.length, `Runtime errors: ${JSON.stringify(errors)}`);
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
