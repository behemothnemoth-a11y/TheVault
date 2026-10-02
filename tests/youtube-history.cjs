const { chromium } = require("./playwright-runtime.cjs");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.VAULT_TEST_URL || "http://127.0.0.1:4173/index.html#/youtube";
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
        save.items = {
          youtube_channel_test: { id: "youtube_channel_test", wing: "youtube", title: "Deliberately Tracked", youtubeMeta: { kind: "channel", channelId: "tracked", channelUrl: "https://www.youtube.com/channel/tracked", trackingState: "tracked", trackingStartedAt: "2026-01-01T00:00:00Z", baselineAt: "2026-01-01T00:00:00Z", uploads: [] } }
        };
        save.metadata.youtube = {
          version: 2, connection: { status: "not_connected" }, preferences: { scope: "tracked", sort: "newest", group: "all" }, groups: ["General"],
          history: [
            { id: "h1", videoId: "v1", title: "August One", channelTitle: "History Only Channel", watchedAt: "2026-08-10T12:00:00Z", durationSeconds: 1200, watchSeconds: 900, source: "vault_open" },
            { id: "h2", videoId: "v2", title: "August Two", channelTitle: "History Only Channel", watchedAt: "2026-08-12T12:00:00Z", durationSeconds: 1800, source: "manual_mark" },
            { id: "h3", videoId: "v3", title: "July Video", channelTitle: "Another Channel", watchedAt: "2026-07-04T12:00:00Z", durationSeconds: 600, source: "vault_open" },
            { id: "h4", videoId: "v4", title: "Older Video", channelTitle: "Older Channel", watchedAt: "2025-12-01T12:00:00Z", durationSeconds: 300, source: "vault_open" }
          ]
        };
      }, { persist: false });
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await page.waitForSelector("[data-youtube-history]");
    assert(await page.locator(".youtube-channel-card").count() === 1, "History-only channels leaked into the tracked library.");
    await page.locator("[data-youtube-history]").click();
    await page.waitForSelector(".youtube-history-periods");
    const chooserPromise=page.waitForEvent("filechooser");
    await page.locator("[data-youtube-history-import]").click();
    const chooser=await chooserPromise;
    await chooser.setFiles({name:"watch-history.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify([
      {title:"Watched August One",titleUrl:"https://www.youtube.com/watch?v=v1",subtitles:[{name:"History Only Channel"}],time:"2026-08-10T12:00:00Z"},
      {title:"Watched August One Again",titleUrl:"https://www.youtube.com/watch?v=v1",subtitles:[{name:"History Only Channel"}],time:"2026-08-20T12:00:00Z"}
    ]))});
    await page.waitForFunction(async()=>{const state=(await import("./js/core/store.js")).getState();return state.metadata.youtube.history.length===5&&state.metadata.youtube.lastHistoryImport?.duplicates===1});
    assert(await page.locator("[data-youtube-history-period]").count() === 3, "Monthly history did not group into three periods.");
    await page.locator('[data-youtube-history-mode="year"]').click();
    await page.waitForFunction(() => location.hash === "#/youtube/history/year");
    await page.waitForFunction(() => document.querySelector('[data-youtube-history-mode="year"]')?.classList.contains("primary"));
    const yearCount=await page.locator("[data-youtube-history-period]").count();
    assert(yearCount === 2, `Yearly history did not group into two periods (found ${yearCount}).`);
    await page.locator('[data-youtube-history-period="2026"]').click();
    await page.waitForFunction(() => location.hash === "#/youtube/history/year/2026");
    await page.waitForSelector(".youtube-history-ledger");
    const videos2026=await page.locator(".youtube-history-ledger article").count();
    if(videos2026!==4){const diagnostic=await page.evaluate(async()=>({history:(await import("./js/core/store.js")).getState().metadata.youtube.history.map(entry=>({id:entry.id,videoId:entry.videoId,watchedAt:entry.watchedAt})),titles:[...document.querySelectorAll(".youtube-history-ledger article b")].map(node=>node.textContent)}));console.error(JSON.stringify(diagnostic,null,2))}
    assert(videos2026 === 4, `The 2026 period did not contain the correct watched videos (found ${videos2026}).`);
    assert((await page.locator(".youtube-history-summary").textContent()).includes("History Only Channel"), "Most-watched channel was not calculated.");
    assert(!errors.length, `Runtime errors: ${JSON.stringify(errors)}`);
    console.log(JSON.stringify({ ok: true, trackedChannels: 1, months: 3, years: 2, videos2026: 4, takeoutAdded: 1, duplicateSkipped: 1 }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
