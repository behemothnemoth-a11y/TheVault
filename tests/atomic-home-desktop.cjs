const { chromium } = require("./playwright-runtime.cjs");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = "http://127.0.0.1:4173/index.html#/home";
const assert = (value, message) => { if (!value) throw new Error(message); };
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], failed = [], external = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("response", response => { if (response.status() >= 400 && !response.url().includes("favicon")) failed.push(`${response.status()} ${response.url()}`); });
  page.on("request", request => { if (!request.url().startsWith("http://127.0.0.1:4173")) external.push(request.url()); });
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#schema-version")?.textContent === "42", null, { timeout: 90000 });
    await page.waitForSelector(".atomic-home");
    await page.locator("#boot:not(.dismissed)").click().catch(() => {});
    const result = await page.evaluate(async () => {
      const { getState } = await import("./js/core/store.js"), state = getState();
      const playButtons = [...document.querySelectorAll(".atomic-media-card [data-living-play]")];
      return {
        bodyRoute: document.body.dataset.vaultRoute,
        uiScale: document.body.dataset.uiScale,
        scaleControls: document.querySelectorAll("button[data-ui-scale]").length,
        oldSidebar: getComputedStyle(document.querySelector(".shell>.sidebar")).display,
        oldTopbar: getComputedStyle(document.querySelector(".topbar")).display,
        rail: document.querySelectorAll(".atomic-rail nav button").length,
        continueCards: document.querySelectorAll(".atomic-media-card").length,
        fitCards: document.querySelectorAll(".atomic-fit-card").length,
        nextActions: document.querySelectorAll(".atomic-actions>button").length,
        playButtons: playButtons.length,
        allPlayLocal: playButtons.every(button => button.dataset.mediaPath && /^[A-Z]:\\/i.test(button.dataset.mediaPath)),
        externalImages: [...document.images].filter(image => new URL(image.src).origin !== location.origin).length,
        healthText: document.querySelector(".atomic-footer section b")?.textContent,
        recordsText: document.querySelector(".atomic-local b")?.textContent,
        overflow: document.documentElement.scrollWidth > innerWidth,
        prefs: state.metadata.lifeDashboard.preferences
      };
    });
    assert(result.bodyRoute === "home" && result.oldSidebar === "none" && result.oldTopbar === "none", "Home did not take over the old generic shell.");
    assert(result.uiScale === "115" && result.scaleControls === 2, "Home did not start with the recommended persistent readability scale.");
    assert(result.rail === 8, "Atomic navigation rail is incomplete.");
    assert(result.continueCards === 4 && result.playButtons > 0 && result.allPlayLocal, "Continue Watching is not grounded in playable local episodes.");
    assert(result.fitCards === 4 && result.nextActions === 2, "Daily recommendation or action modules are incomplete.");
    assert(result.externalImages === 0 && !result.overflow, "Home hotlinked artwork or overflowed at desktop width.");
    await page.locator('[data-life-pref="timeAvailable"][data-life-value="30"]').click();
    await page.waitForTimeout(50);
    const time = await page.evaluate(async () => (await import("./js/core/store.js")).getState().metadata.lifeDashboard.preferences.timeAvailable);
    assert(time === 30, `Homepage time control did not update the shared dashboard preference; received ${JSON.stringify(time)}.`);
    await page.locator('[data-ui-scale="1"]').click();
    await page.waitForFunction(() => document.body.dataset.uiScale === "130");
    const enlarged = await page.evaluate(() => ({
      persisted: localStorage.getItem("vault-ui-scale"),
      columns: getComputedStyle(document.querySelector(".atomic-continue-grid")).gridTemplateColumns.split(" ").length,
      scrollable: document.documentElement.scrollHeight > innerHeight
    }));
    assert(enlarged.persisted === "130" && enlarged.columns === 2 && enlarged.scrollable, "The largest scale did not persist or open the Home layout vertically.");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".atomic-home");
    assert(await page.evaluate(() => document.body.dataset.uiScale) === "130", "Interface scale did not survive a restart.");
    await page.locator('[data-ui-scale="-1"]').click();
    await page.waitForFunction(() => document.body.dataset.uiScale === "115");
    await page.locator('.atomic-rail [data-route="games"]').click();
    await page.waitForFunction(() => document.body.dataset.vaultRoute === "games");
    const shellRestored = await page.evaluate(() => getComputedStyle(document.querySelector(".shell>.sidebar")).display !== "none" && getComputedStyle(document.querySelector(".topbar")).display !== "none");
    assert(shellRestored, "Leaving Home did not restore the normal Vault shell.");
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".atomic-home");
    await page.screenshot({ path: "D:/Vault/tests/atomic-home-desktop.png", fullPage: true });
    assert(!errors.length && !failed.length && !external.length, `Runtime issue: ${JSON.stringify({ errors, failed, external })}`);
    console.log(JSON.stringify({ ok: true, result, sharedTime: time, enlarged, shellRestored, errors, failed, external }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
