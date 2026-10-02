const { chromium } = require("./playwright-runtime.cjs");
const BASE = "http://127.0.0.1:4173/index.html";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], http = [], external = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("response", response => { if (response.status() >= 400 && !response.url().includes("favicon")) http.push(`${response.status()} ${response.url()}`); });
  page.on("request", request => { if (!request.url().startsWith("http://127.0.0.1:4173")) external.push(request.url()); });
  const open = async route => {
    await page.goto(`${BASE}#/${route}`, { waitUntil: "domcontentloaded" });
    try { await page.waitForFunction(() => document.querySelector("#schema-version")?.textContent === "42", null, { timeout: 60000 }); }
    catch (error) {
      console.error("STARTUP_DIAGNOSTIC", await page.evaluate(() => ({ schema: document.querySelector("#schema-version")?.textContent, notice: document.querySelector("[data-stage0-load-error]")?.textContent, view: document.querySelector("#view")?.textContent?.slice(0, 300), ready: document.readyState })), { errors, http, external });
      throw error;
    }
    await page.locator("#boot:not(.dismissed)").click().catch(() => {});
  };
  try {
    await open("home");
    const baseline = await page.evaluate(async () => { const { getState } = await import("./js/core/store.js"); const state = getState(); return JSON.stringify(Object.entries(state.items).sort(([a],[b]) => a.localeCompare(b))); });
    const home = await page.evaluate(() => ({ title: document.querySelector("#view-title")?.textContent, hero: document.querySelectorAll(".hero-actions .button").length, tools: document.querySelectorAll(".home-tools__actions .button").length, nav: [...document.querySelectorAll(".nav-button")].map(button => button.textContent) }));
    assert(home.title === "Home" && home.hero === 2 && home.tools >= 5, "Simplified Home failed.");
    assert(home.nav.some(text => text.includes("VAULT ASSISTANT")) && home.nav.some(text => text.includes("BACKGROUND CARE")), "Friendly navigation failed.");

    await open("today");
    const today = await page.evaluate(() => ({ statuses: document.querySelectorAll(".today-status-card").length, cards: document.querySelectorAll(".desk-grid .desk-card").length, menus: document.querySelectorAll(".desk-card-menu").length, openMenus: document.querySelectorAll(".desk-card-menu[open]").length, policy: document.querySelector(".desk-policy")?.open, overflow: document.documentElement.scrollWidth > innerWidth }));
    assert(today.statuses === 4 && today.cards >= 4 && today.cards === today.menus && !today.openMenus && !today.policy && !today.overflow, "Unified Today failed.");
    await page.keyboard.press("Alt+s"); await page.waitForFunction(() => location.hash.startsWith("#/session"));
    await page.keyboard.press("Alt+a"); await page.waitForFunction(() => location.hash.startsWith("#/companion"));
    await page.waitForFunction(() => document.querySelector("#view-title")?.textContent === "Vault Assistant");
    assert(await page.locator("#view-title").textContent() === "Vault Assistant", "Assistant shortcut failed.");
    assert(await page.locator(".companion-evidence[open]").count() === 0, "Assistant evidence is open by default.");
    await page.keyboard.press("Alt+t"); await page.waitForFunction(() => location.hash.startsWith("#/today"));
    await page.keyboard.press("Alt+h"); await page.waitForFunction(() => location.hash === "#/home");

    await open("host");
    assert(await page.locator("#view-title").textContent() === "Background Care" && await page.locator(".host-details[open]").count() === 0, "Background Care failed.");
    const id = await page.evaluate(async () => { const { getState } = await import("./js/core/store.js"); return Object.values(getState().items).find(item => item.wing === "tv" && !item.id.startsWith("tv_drive_"))?.id; });
    await open(`record/${encodeURIComponent(id)}`); await page.waitForSelector(".record-hero");
    const record = await page.evaluate(() => ({ back: !!document.querySelector("[data-record-back]"), copy: !!document.querySelector("[data-record-copy]"), ratings: document.querySelectorAll("[data-record-rating]").length, details: document.querySelector(".record-technical")?.open, episode: !!document.querySelector('.record-tv [data-route^="tv/"]'), ratingHeight: Math.min(...[...document.querySelectorAll("[data-record-rating]")].map(button => button.getBoundingClientRect().height)) }));
    assert(record.back && record.copy && record.ratings === 10 && !record.details && record.episode && record.ratingHeight >= 29, "Record QoL failed.");
    await page.screenshot({ path: "D:/Vault/tests/stage43-ui-qol.png", fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 }); await open("today");
    const mobile = await page.evaluate(() => ({ display: getComputedStyle(document.querySelector("#mobile-dock")).display, buttons: document.querySelectorAll("#mobile-dock button").length, overflow: document.documentElement.scrollWidth > innerWidth, height: Math.min(...[...document.querySelectorAll("#mobile-dock button")].map(button => button.getBoundingClientRect().height)) }));
    assert(mobile.display === "grid" && mobile.buttons === 5 && !mobile.overflow && mobile.height >= 56, "Mobile dock failed.");
    await page.screenshot({ path: "D:/Vault/tests/stage43-ui-qol-mobile.png", fullPage: true });
    const final = await page.evaluate(async () => { const { getState } = await import("./js/core/store.js"); return JSON.stringify(Object.entries(getState().items).sort(([a],[b]) => a.localeCompare(b))); });
    assert(final === baseline, "UI navigation changed library records.");
    assert(!errors.length && !http.length && !external.length, `Runtime errors: ${JSON.stringify({ errors, http, external })}`);
    console.log(JSON.stringify({ ok: true, home, today, record, mobile, errors, http, external }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
