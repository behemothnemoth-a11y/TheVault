const { chromium } = require("./playwright-runtime.cjs");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = "http://127.0.0.1:4173/index.html#/";
const ROUTES = ["youtube", "music", "podcasts", "manga", "food", "trips", "calendar"];
const assert = (value, message) => { if (!value) throw new Error(message); };

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], results = [];
  page.on("pageerror", error => errors.push(String(error)));
  try {
    for (const route of ROUTES) {
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(expected => document.body.dataset.vaultRoute === expected, route, { timeout: 90000 });
      await page.locator("#boot:not(.dismissed)").click().catch(() => {});
      try {
        await page.waitForSelector(`.atomic-wing--${route} .vault-wing-placeholder__empty`, { timeout: 10000 });
      } catch (error) {
        const diagnostic = await page.evaluate(async () => {
          const placeholders = await import("./js/wings/placeholders.js?v=20260826-atomic-wings");
          const servedApp = await (await fetch("./js/app.js?v=20260826-atomic-wings", { cache: "no-store" })).text();
          return {
            bodyRoute: document.body.dataset.vaultRoute,
            viewClasses: [...document.querySelector("#view")?.children || []].map(node => node.className),
            viewText: document.querySelector("#view")?.innerText?.slice(0, 500),
            bootClass: document.querySelector("#boot")?.className,
            unfinishedHasRoute: placeholders.unfinishedWingIds.has(document.body.dataset.vaultRoute),
            servedAppUsesPlaceholder: servedApp.includes("unfinishedWingIds.has(route)"),
            resources: performance.getEntriesByType("resource").map(entry => entry.name).filter(name => name.includes("app.js") || name.includes("placeholders.js"))
          };
        });
        throw new Error(`${route}: waiting view did not render. ${JSON.stringify({ diagnostic, errors })}`);
      }
      const result = await page.evaluate(expected => ({
        route: document.body.dataset.vaultRoute,
        activeClass: document.body.classList.contains("atomic-shell-active"),
        oldSidebar: getComputedStyle(document.querySelector(".shell>.sidebar")).display,
        oldTopbar: getComputedStyle(document.querySelector(".topbar")).display,
        atomicRail: document.querySelectorAll(".atomic-rail").length,
        activeButton: document.querySelector(`.atomic-rail [data-route="${expected}"].active`)?.textContent.trim(),
        waitingText: document.querySelector(".vault-wing-placeholder__empty p")?.textContent.trim(),
        aiControl: document.querySelectorAll(`[data-adaptive-refresh][data-ai-wing="${expected}"]`).length
      }), route);
      assert(result.route === route, `${route}: incorrect body route.`);
      assert(result.activeClass && result.oldSidebar === "none" && result.oldTopbar === "none", `${route}: legacy shell is still visible.`);
      assert(result.atomicRail === 1 && result.activeButton, `${route}: atomic navigation is missing or inactive.`);
      assert(result.waitingText === "AWAITING DESIGN", `${route}: waiting-page content is missing.`);
      assert(result.aiControl >= 1, `${route}: AI foundation control is not wired.`);
      results.push(result);
    }
    assert(!errors.length, `Runtime errors: ${JSON.stringify(errors)}`);
    console.log(JSON.stringify({ ok: true, routes: results, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
