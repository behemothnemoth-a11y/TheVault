const { chromium } = require("./playwright-runtime.cjs");

const BASE = "http://127.0.0.1:4173/index.html";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const pageErrors = [], httpErrors = [], externalRequests = [];
  page.on("pageerror", error => pageErrors.push(String(error)));
  page.on("response", response => { if (response.status() >= 400 && !response.url().includes("favicon")) httpErrors.push({ url: response.url(), status: response.status() }); });
  page.on("request", request => { if (!request.url().startsWith("http://127.0.0.1:4173")) externalRequests.push(request.url()); });

  try {
    await page.goto(`${BASE}#/today`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#schema-version")?.textContent === "42");
    await page.waitForSelector(".desk-grid .desk-card");
    const baseline = await page.evaluate(async () => {
      const store = await import("./js/core/store.js");
      const health = await import("./js/systems/health.js");
      const migrations = await import("./js/core/migrations.js");
      const desk = await import("./js/systems/dailyDesk.js");
      const state = store.getState(), model = desk.getDailyDeskModel();
      const episodes = Object.values(state.items).flatMap(item => Object.values(item.episodes || {}));
      const schema36 = structuredClone(state);
      schema36.schemaVersion = 36;
      for (const key of ["stage37", "stage38", "stage39", "stage40", "stage41", "stage42"]) delete schema36.metadata[key];
      const migrated = migrations.migrateSave(schema36);
      const buildStart = performance.now(); desk.buildDailyDeskPlan(state, { dateKey: "2037-03-07", revision: 7, mode: "balanced" });
      const buildMs = performance.now() - buildStart;
      return {
        schema: state.schemaVersion, health: health.runHealthCheck(), migratedHealth: health.runHealthCheck(migrated),
        migratedPolicy: migrated.metadata.stage37.policy, records: Object.keys(state.items).length, episodes: episodes.length,
        links: episodes.filter(episode => episode.sourcePath).length, planId: model.plan.id, dateKey: model.plan.dateKey,
        mode: model.plan.mode, entries: model.entries.map(entry => ({ itemId: entry.itemId, title: entry.item.title, wing: entry.item.wing, lane: entry.lane, reasons: entry.reasons.length, factors: Object.keys(entry.factors).length })),
        itemFingerprint: JSON.stringify(Object.entries(state.items).sort(([left], [right]) => left.localeCompare(right))), buildMs
      };
    });

    const ui = await page.evaluate(() => ({
      title: document.querySelector("#view-title")?.textContent, cards: document.querySelectorAll(".desk-grid .desk-card").length,
      modes: document.querySelectorAll("[data-desk-mode]").length, activeNav: document.querySelectorAll('.nav-button[data-route="today"][aria-current="page"]').length,
      unnamedButtons: [...document.querySelectorAll("button")].filter(button => !(button.getAttribute("aria-label") || button.getAttribute("title") || button.textContent || "").trim()).length,
      overflow: document.documentElement.scrollWidth > innerWidth
    }));

    const firstItem = await page.locator("[data-desk-item]").first().getAttribute("data-desk-item");
    await page.locator(`.desk-card:has([data-desk-item="${firstItem}"]) .desk-card-menu > summary`).click();
    await page.locator(`[data-desk-feedback="keep"][data-desk-item="${firstItem}"]`).click();
    const kept = await page.evaluate(async itemId => {
      const store = await import("./js/core/store.js"); await store.flushPersistence();
      const stage = store.getState().metadata.stage37;
      return { pinned: stage.signals[itemId].pinned, feedback: stage.feedback[0].action, planId: stage.currentPlanId };
    }, firstItem);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(`[data-desk-feedback="keep"][data-desk-item="${firstItem}"]`, { state: "attached" });
    const keptAfterReload = await page.locator(`[data-desk-feedback="keep"][data-desk-item="${firstItem}"]`).textContent();

    await page.locator(`.desk-card:has([data-desk-item="${firstItem}"]) .desk-card-menu > summary`).click();
    await page.locator(`[data-desk-feedback="later"][data-desk-item="${firstItem}"]`).click();
    const later = await page.evaluate(async itemId => {
      const store = await import("./js/core/store.js"); await store.flushPersistence();
      const state = store.getState(), signal = state.metadata.stage37.signals[itemId];
      return { snoozed: Date.parse(signal.snoozedUntil) > Date.now(), absent: !state.metadata.stage37.plans.find(plan => plan.id === state.metadata.stage37.currentPlanId).entries.some(entry => entry.itemId === itemId), planId: state.metadata.stage37.currentPlanId };
    }, firstItem);

    const hideItem = await page.locator('[data-desk-feedback="hide"]').first().getAttribute("data-desk-item");
    await page.locator(`.desk-card:has([data-desk-item="${hideItem}"]) .desk-card-menu > summary`).click();
    await page.locator(`[data-desk-feedback="hide"][data-desk-item="${hideItem}"]`).click();
    const hidden = await page.evaluate(async itemId => {
      const store = await import("./js/core/store.js"); await store.flushPersistence();
      const state = store.getState();
      return { hidden: state.metadata.stage37.signals[itemId].hidden, absent: !state.metadata.stage37.plans.find(plan => plan.id === state.metadata.stage37.currentPlanId).entries.some(entry => entry.itemId === itemId) };
    }, hideItem);
    await page.locator(".desk-hidden > summary").click();
    await page.locator(`[data-desk-feedback="restore"][data-desk-item="${hideItem}"]`).click();
    const restored = await page.evaluate(async itemId => {
      const store = await import("./js/core/store.js"); await store.flushPersistence();
      return !store.getState().metadata.stage37.signals[itemId].hidden;
    }, hideItem);

    await page.locator('[data-desk-mode="discovery"]').click();
    const discovery = await page.evaluate(async oldPlan => {
      const store = await import("./js/core/store.js"); await store.flushPersistence();
      const stage = store.getState().metadata.stage37;
      return { mode: stage.preferences.mode, changed: stage.currentPlanId !== oldPlan, revision: stage.revision };
    }, later.planId);
    const beforeRotate = await page.evaluate(async () => (await import("./js/core/store.js")).getState().metadata.stage37.currentPlanId);
    await page.locator("[data-desk-refresh]").click();
    const rotated = await page.evaluate(async oldPlan => {
      const store = await import("./js/core/store.js"); await store.flushPersistence();
      const state = store.getState();
      return { changed: state.metadata.stage37.currentPlanId !== oldPlan, health: (await import("./js/systems/health.js")).runHealthCheck() };
    }, beforeRotate);

    const openRoute = await page.locator(".desk-grid .desk-card [data-route]").first().getAttribute("data-route");
    await page.locator(".desk-grid .desk-card [data-route]").first().click();
    await page.waitForFunction(route => location.hash === `#/${route}`, openRoute);
    await page.waitForSelector(".record-hero");
    const durableOpen = await page.evaluate(() => ({ hash: location.hash, detail: Boolean(document.querySelector(".record-hero")) }));
    await page.goto(`${BASE}#/home`); await page.waitForSelector(".desk-preview");
    const home = await page.evaluate(() => ({ preview: document.querySelectorAll(".desk-preview-grid .desk-card").length, link: document.querySelectorAll('[data-route="today"]').length, brokenGlyph: /â˜/.test(document.querySelector("#view")?.textContent || "") }));

    const finalState = await page.evaluate(async fingerprint => {
      const store = await import("./js/core/store.js");
      return { itemsUnchanged: JSON.stringify(Object.entries(store.getState().items).sort(([left], [right]) => left.localeCompare(right))) === fingerprint, health: (await import("./js/systems/health.js")).runHealthCheck(), plans: store.getState().metadata.stage37.plans.length, feedback: store.getState().metadata.stage37.feedback.length };
    }, baseline.itemFingerprint);

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`${BASE}#/today`, { waitUntil: "domcontentloaded" });
    await mobilePage.waitForFunction(() => document.querySelector("#schema-version")?.textContent === "42");
    await mobilePage.waitForSelector(".desk-grid .desk-card");
    const mobile = await mobilePage.evaluate(() => ({
      width: document.documentElement.scrollWidth, viewport: innerWidth, cards: document.querySelectorAll(".desk-grid .desk-card").length,
      modes: document.querySelectorAll("[data-desk-mode]").length, visibleNavButtons: [...document.querySelectorAll(".nav-button")].filter(button => button.offsetParent).length,
      unnamedControls: [...document.querySelectorAll("button,input,select,textarea")].filter(control => !(control.getAttribute("aria-label") || control.getAttribute("title") || control.textContent || "").trim() && !control.closest("label")).length
    }));
    await mobileContext.close();

    const wings = new Set(baseline.entries.map(entry => entry.wing));
    const wingCounts = baseline.entries.reduce((out, entry) => ({ ...out, [entry.wing]: (out[entry.wing] || 0) + 1 }), {});
    const output = { baseline: { ...baseline, itemFingerprint: `[${baseline.itemFingerprint.length} bytes]` }, ui, kept, keptAfterReload, later, hidden, restored, discovery, rotated, openRoute, durableOpen, home, finalState, mobile, pageErrors, httpErrors, externalRequests };
    output.ok = baseline.schema === 42 && baseline.health.ok && baseline.migratedHealth.ok && baseline.migratedPolicy.localOnly && baseline.migratedPolicy.externalInference === false && baseline.migratedPolicy.automaticCompletion === false &&
      baseline.records === 3543 && baseline.episodes === 13055 && baseline.links === 11941 && baseline.entries.length === 6 && ["movies", "tv", "games", "books"].every(wing => wings.has(wing)) && Object.values(wingCounts).every(count => count <= 2) &&
      baseline.entries.every(entry => entry.reasons > 0 && entry.factors >= 8 && entry.title.length <= 100 && !/verify|^gameplay\s*:/i.test(entry.title)) && baseline.buildMs < 500 &&
      ui.title === "Today" && ui.cards === 6 && ui.modes === 4 && ui.activeNav === 1 && ui.unnamedButtons === 0 && !ui.overflow &&
      kept.pinned && kept.feedback === "keep" && /KEPT/.test(keptAfterReload) && later.snoozed && later.absent && hidden.hidden && hidden.absent && restored &&
      discovery.mode === "discovery" && discovery.changed && rotated.changed && rotated.health.ok && durableOpen.hash === `#/${openRoute}` && durableOpen.detail &&
      home.preview === 4 && home.link >= 2 && !home.brokenGlyph && finalState.itemsUnchanged && finalState.health.ok && finalState.plans >= 5 && finalState.feedback >= 4 &&
      mobile.width <= mobile.viewport && mobile.cards === 6 && mobile.modes === 4 && mobile.visibleNavButtons === 0 && mobile.unnamedControls === 0 &&
      pageErrors.length === 0 && httpErrors.length === 0 && externalRequests.length === 0;
    console.log(JSON.stringify(output, null, 2));
    if (!output.ok) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
