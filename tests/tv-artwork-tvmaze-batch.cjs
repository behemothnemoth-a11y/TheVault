const { chromium } = require("./playwright-runtime.cjs");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const expected = {
  tv_legacy_south_park: 112, tv_legacy_rugrats: 421, tv_legacy_adventure_time: 290,
  tv_legacy_cheers: 553, tv_legacy_frasier: 540, tv_legacy_king_of_the_hill: 115,
  tv_legacy_bobs_burgers: 107, tv_legacy_american_dad: 215,
  tv_legacy_beavis_and_butt_head: 910, tv_legacy_the_simpsons: 83,
  tv_legacy_that_70s_show: 587, tv_legacy_scrubs: 532, tv_legacy_the_office_us: 526,
  tv_legacy_star_trek_tng: 491, tv_legacy_the_fairly_oddparents: 2565,
  tv_legacy_family_guy: 84, tv_legacy_robot_chicken: 686,
  tv_legacy_malcolm_in_the_middle: 568, tv_legacy_hunter_x_hunter_2011: 1536,
  tv_legacy_the_fresh_prince_of_bel_air: 582, tv_legacy_3rd_rock_from_the_sun: 1053,
  tv_legacy_aqua_teen_hunger_force: 382, tv_legacy_sanford_and_son: 7513,
  tv_legacy_catdog: 12449, tv_legacy_recess: 5935, tv_legacy_ed_edd_n_eddy: 6428,
  tv_legacy_parks_and_recreation: 174
};
const assert = (value, message) => { if (!value) throw new Error(message); };
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], failed = [], external = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("response", response => { if (response.status() >= 400 && !response.url().includes("favicon")) failed.push(`${response.status()} ${response.url()}`); });
  page.on("request", request => { if (!request.url().startsWith("http://127.0.0.1:4173")) external.push(request.url()); });
  try {
    await page.goto("http://127.0.0.1:4173/index.html#/tv", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#schema-version")?.textContent === "42", null, { timeout: 90000 });
    const result = await page.evaluate(async expectedMap => {
      const { getState, update } = await import("./js/core/store.js");
      const { applyBundledArtwork } = await import("./js/systems/bundledArtwork.js");
      const state = getState(), entries = Object.entries(expectedMap).map(([id, sourceId]) => ({ id, sourceId, artwork: state.items[id]?.artwork }));
      const loads = await Promise.all(entries.map(entry => fetch(entry.artwork.localPath).then(response => ({ ok: response.ok, type: response.headers.get("content-type") }))));
      const tv = Object.values(state.items).filter(item => item.wing === "tv" && !item.id.startsWith("tv_drive_"));
      const totalWithArtwork = tv.filter(item => typeof item.artwork === "string" ? item.artwork : item.artwork?.localPath || item.artwork?.url).length;
      const before = JSON.stringify(entries.map(entry => entry.artwork));
      const secondRun = applyBundledArtwork();
      const unchanged = before === JSON.stringify(entries.map(entry => getState().items[entry.id].artwork));
      update(save => { save.items.tv_legacy_south_park.artwork = { localPath: "./assets/artwork/library/tv_legacy_south_park.jpg", source: "manual_test" }; });
      applyBundledArtwork();
      const customPreserved = getState().items.tv_legacy_south_park.artwork.source === "manual_test";
      return { entries, loads, totalWithArtwork, secondRun, unchanged, customPreserved, remoteImagesInDom: [...document.images].filter(image => new URL(image.src).origin !== location.origin).length };
    }, expected);
    assert(result.totalWithArtwork >= 42, "TV artwork coverage did not reach 42.");
    assert(result.entries.every(entry => entry.artwork?.source === "tvmaze" && entry.artwork?.sourceId === entry.sourceId && entry.artwork?.localPath?.endsWith(`${entry.id}.jpg`)), "TVmaze provenance or local path mismatch.");
    assert(result.loads.every(load => load.ok && load.type?.startsWith("image/")), "A cached TVmaze poster failed to load.");
    assert(result.secondRun === 0 && result.unchanged && result.customPreserved, "Artwork import is not idempotent or fill-only.");
    assert(result.remoteImagesInDom === 0 && !external.length, "The TV screen attempted to hotlink external artwork.");
    assert(!errors.length && !failed.length, `Runtime issue: ${JSON.stringify({ errors, failed })}`);
    await page.screenshot({ path: "D:/Vault/tests/tv-artwork-tvmaze-batch.png", fullPage: false });
    console.log(JSON.stringify({ ok: true, totalWithArtwork: result.totalWithArtwork, cached: result.entries.length, idempotent: result.secondRun === 0, customPreserved: result.customPreserved, external, errors, failed }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
