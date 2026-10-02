const { chromium } = require("./playwright-runtime.cjs");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const assert = (value, message) => { if (!value) throw new Error(message); };
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = []; page.on("pageerror", error => errors.push(String(error)));
  try {
    await page.goto(process.env.VAULT_TEST_URL || "http://127.0.0.1:4173/index.html#/tv", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.vaultReady === "true");
    await page.evaluate(async () => {
      const store = await import("./js/core/store.js");
      store.update(save => {
        save.metadata.tv ||= {}; save.metadata.tv.recommendationResetVersion = 1;
        save.items.tv_planned_test = { id:"tv_planned_test", wing:"tv", type:"tv", title:"Planned Test Series", owned:false, status:"planned", genres:["Drama"], episodes:{}, sourcePaths:[], tvMeta:{planned:true,catalogEnriched:true} };
        save.items.tv_owned_test = { id:"tv_owned_test", wing:"tv", type:"tv", title:"Owned Test Series", owned:true, status:"backlog", genres:["Drama"], episodes:{}, sourcePaths:[] };
      }, { persist:false });
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await page.waitForSelector('[data-tv-value="planned"]');
    await page.locator('[data-tv-value="planned"]').click();
    await page.waitForFunction(() => document.querySelector('[data-tv-value="planned"]')?.classList.contains("primary"));
    const text = await page.locator(".series-row-list").textContent();
    assert(text.includes("Planned Test Series"), "Planned series was not shown.");
    assert(!text.includes("Owned Test Series"), "Owned backlog leaked into Planned.");
    assert(!errors.length, `Runtime errors: ${JSON.stringify(errors)}`);
    console.log(JSON.stringify({ok:true,plannedVisible:true,filterActive:true}));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
