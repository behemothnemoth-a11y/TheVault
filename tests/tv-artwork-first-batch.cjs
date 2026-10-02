const { chromium } = require("./playwright-runtime.cjs");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const expected = [
  "tv_legacy_spongebob_squarepants", "tv_legacy_fawlty_towers",
  "tv_legacy_monty_pythons_flying_circus", "tv_legacy_lost", "tv_legacy_narcos",
  "tv_legacy_inuyasha_final_act", "tv_legacy_the_blue_planet"
];
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
    const result = await page.evaluate(async ids => {
      const { getState } = await import("./js/core/store.js"), state = getState();
      const tv = Object.values(state.items).filter(item => item.wing === "tv" && !item.id.startsWith("tv_drive_"));
      const artwork = ids.map(id => ({ id, path: state.items[id]?.artwork || "", title: state.items[id]?.title || "" }));
      const responses = await Promise.all(artwork.map(entry => fetch(entry.path).then(response => ({ ok: response.ok, type: response.headers.get("content-type") }))));
      return { totalWithArtwork: tv.filter(item => typeof item.artwork === "string" ? item.artwork : item.artwork?.localPath || item.artwork?.url).length, artwork, responses };
    }, expected);
    assert(result.totalWithArtwork >= 15, "TV artwork coverage did not increase to fifteen.");
    assert(result.artwork.every(entry => entry.path.includes(`assets/artwork/library/${entry.id}`)), "A first-batch series has the wrong artwork path.");
    assert(result.responses.every(response => response.ok && response.type?.startsWith("image/")), "A poster asset failed validation.");
    assert(!errors.length && !failed.length && !external.length, `Runtime issue: ${JSON.stringify({ errors, failed, external })}`);
    await page.screenshot({ path: "D:/Vault/tests/tv-artwork-first-batch.png", fullPage: false });
    console.log(JSON.stringify({ ok: true, totalWithArtwork: result.totalWithArtwork, added: result.artwork.map(entry => entry.title), errors, failed, external }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
