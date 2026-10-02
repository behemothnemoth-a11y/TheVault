const { chromium } = require("./playwright-runtime.cjs");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.VAULT_TEST_URL || "http://127.0.0.1:4173/index.html#/";
const routes = ["home", "tv", "manga", "youtube", "books", "movies", "games", "music", "podcasts", "writing"];
const assert = (value, message) => { if (!value) throw new Error(message); };

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.stack || String(error)));
  try {
    for (const route of routes) {
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(expected => document.body.dataset.vaultRoute === expected && document.documentElement.dataset.vaultReady === "true", route, { timeout: 90000 });
      const state = await page.evaluate(() => ({
        route: document.body.dataset.vaultRoute,
        hasContent: Boolean(document.querySelector("#view")?.textContent.trim()),
        startupFailure: document.querySelector("#view")?.textContent.includes("THE INTERFACE DID NOT FINISH OPENING"),
        legacyShells: document.querySelectorAll(".shell,.sidebar,.topbar,body>.footer").length,
        atomicRail: document.querySelectorAll(".atomic-rail").length
      }));
      assert(state.route === route && state.hasContent && !state.startupFailure, `${route}: blank or failed startup.`);
      assert(state.legacyShells === 0 && state.atomicRail === 1, `${route}: legacy shell still exists or current shell is missing.`);
      if (route === "writing") assert(await page.locator(".writing-archive").count() === 1, "writing: project library is missing.");
    }
    await page.goto(`${BASE}home`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.vaultReady === "true", null, { timeout: 90000 });
    // One-time repairs run after startup and redraw the shell as they finish. Clicking
    // through the rail while that is happening races the rebuild, so wait for the rail
    // to stop changing before driving it.
    await page.waitForFunction(() => {
      const rail = document.querySelector(".atomic-rail");
      if (!rail) return false;
      const stamp = rail.dataset.smokeMark || "";
      const now = String(rail.childElementCount) + ":" + rail.textContent.length;
      rail.dataset.smokeMark = now;
      return stamp === now;
    }, null, { timeout: 120000, polling: 1000 });
    for (const route of routes.slice(1)) {
      const routeButton = page.locator(`.atomic-rail [data-route="${route}"]`);
      if (!(await routeButton.isVisible())) await routeButton.evaluate(button => { button.closest("details").open = true; });
      await routeButton.click();
      await page.waitForFunction(expected => document.body.dataset.vaultRoute === expected, route, { timeout: 10000 });
      if (route === "writing") {
        await page.locator("[data-w-new-project]").first().click();
        await page.locator("[data-w-create-title]").fill("Shell Test Project");
        await page.getByRole("button",{name:"CREATE PROJECT"}).click();
        assert(await page.locator(".atomic-rail").count() === 1, "writing: creating a project removed the Vault shell.");
        await page.locator("[data-w-new-document]").first().click();
        await page.locator("[data-w-create-document-title]").fill("Shell Test Document");
        await page.getByRole("button",{name:"CREATE DOCUMENT"}).click();
        assert(await page.locator(".atomic-rail").count() === 1, "writing: creating a document removed the Vault shell.");
        assert(await page.locator("[data-w-body]").count() === 1, "writing: editor disappeared after creating a document.");
      }
    }
    await page.locator('.atomic-rail [data-route="home"]').first().click();
    await page.waitForFunction(() => document.body.dataset.vaultRoute === "home", null, { timeout: 10000 });
    const before = await page.locator("body").getAttribute("data-ui-scale");
    await page.locator("button[data-ui-scale='1']").click();
    const after = await page.locator("body").getAttribute("data-ui-scale");
    assert(before !== after, "Scale button did not update scale.");
    assert(await page.locator("body").getAttribute("data-vault-route") === "home", "Scale click changed routes.");
    assert(!errors.length, `Runtime errors: ${JSON.stringify(errors)}`);
    console.log(JSON.stringify({ ok: true, routes, clickNavigation: true, scale: { before, after } }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
