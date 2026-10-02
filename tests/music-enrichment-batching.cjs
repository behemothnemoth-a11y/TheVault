const { chromium } = require("./playwright-runtime.cjs");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.VAULT_TEST_URL || "http://127.0.0.1:4201/index.html#/music";
const assert = (value, message) => { if (!value) throw new Error(message); };

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE });
  const page = await browser.newPage(), errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.vaultReady === "true", null, { timeout: 90000 });
    const result = await page.evaluate(async () => {
      const store = await import("./js/core/store.js"), music = await import(`./js/wings/music.js?batch=${Date.now()}`), approvals = await import("./js/systems/artworkApproval.js");
      store.update(save => {
        save.items = {
          a: { id: "a", wing: "music", title: "Song A", creator: "Artist", series: "Shared Album", occurrences: 30, musicMeta: { spotifyUri: "spotify:track:aaaaaaaaaa" } },
          b: { id: "b", wing: "music", title: "Song B", creator: "Artist", series: "Shared Album", occurrences: 20, musicMeta: { spotifyUri: "spotify:track:bbbbbbbbbb" } },
          c: { id: "c", wing: "music", title: "Song C", creator: "Artist", series: "Other Album", occurrences: 10, musicMeta: { spotifyUri: "spotify:track:cccccccccc" } }
        };
        save.metadata.music = {};
        save.metadata.artworkApprovals = [];
      }, { persist: false });
      const originalFetch = window.fetch;
      window.fetch = async (url, options) => {
        if (!String(url).includes("/__vault/spotify/tracks") && !String(url).includes("__vault/spotify/tracks")) return originalFetch(url, options);
        const requested = JSON.parse(options.body).tracks;
        return new Response(JSON.stringify({ ready: true, tracks: requested.map(entry => ({
          itemId: entry.itemId, spotifyId: entry.uri.split(":").pop(), albumId: entry.itemId === "c" ? "album_other" : "album_shared",
          title: `Verified ${entry.itemId.toUpperCase()}`, artist: "Artist", album: entry.itemId === "c" ? "Other Album" : "Shared Album",
          artworkPath: entry.itemId === "c" ? "./assets/artwork/other.jpg" : "./assets/artwork/shared.jpg", artworkUrl: "https://example.test/cover.jpg",
          durationMs: 180000, externalUrl: `https://open.spotify.com/track/${entry.itemId}`
        })) }), { status: 200, headers: { "Content-Type": "application/json" } });
      };
      const first = await music.enrichSpotifyLibrary({ maxTracks: 1 });
      const pendingAfterFirst = approvals.pendingArtworkApprovals();
      approvals.resolveArtworkApproval(pendingAfterFirst[0].id, true);
      const sharedApplied = store.getState().items.a.artwork === "./assets/artwork/shared.jpg" && store.getState().items.b.artwork === "./assets/artwork/shared.jpg";
      const second = await music.enrichSpotifyLibrary({ maxTracks: 1 });
      const third = await music.enrichSpotifyLibrary({ maxTracks: 1 });
      window.fetch = originalFetch;
      return { first, second, third, pendingAfterFirst: pendingAfterFirst.length, sharedApplied, pendingNow: approvals.pendingArtworkApprovals().length };
    });
    assert(result.first.eligible === 1 && result.first.remaining === 1 && result.first.queued === 1, "First priority album batch was not bounded or album-deduplicated.");
    assert(result.pendingAfterFirst === 1 && result.sharedApplied, "One album approval did not apply to every matching song.");
    assert(result.second.eligible === 1 && result.second.remaining === 0 && result.second.queued === 1, "Second batch did not resume with the remaining album.");
    assert(result.third.eligible === 0, "Albums with applied or pending artwork were repeated.");
    assert(!errors.length, `Runtime errors: ${JSON.stringify(errors)}`);
    console.log(JSON.stringify({ ok: true, result }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
