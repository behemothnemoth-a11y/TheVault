const { chromium } = require("./playwright-runtime.cjs");

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const pageErrors = [], httpErrors = [], externalRequests = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("response", response => { if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`); });
    page.on("request", request => {
      const url = new URL(request.url());
      if (["http:", "https:"].includes(url.protocol) && url.origin !== "http://127.0.0.1:4173") externalRequests.push(request.url());
    });

    await page.goto("http://127.0.0.1:4173/index.html#/home", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => document.querySelector("#schema-version")?.textContent === "42", null, { timeout: 45000 });
    await page.waitForSelector(".daily-home-shelf", { timeout: 15000 });
    await page.waitForFunction(() => {
      const state = window.indexedDB && document.querySelector("#view");
      return Boolean(state && document.querySelector('[data-route="museum"]') && document.querySelector('[data-route="control"]'));
    });

    const baseline = await page.evaluate(async () => {
      const store = await import("./js/core/store.js");
      const migration = await import("./js/core/migrations.js");
      const state = store.getState();
      const episodes = Object.values(state.items).flatMap(item => Object.values(item.episodes || {}));
      const migrationSeed = structuredClone(state);
      migrationSeed.schemaVersion = 32;
      for (const key of ["stage33", "stage34", "stage35", "stage36", "stage37", "stage38", "stage39", "stage40", "stage41", "stage42"]) delete migrationSeed.metadata[key];
      delete migrationSeed.preferences.dailyDriver;
      const migrated = migration.migrateSave(migrationSeed);
      const sample = Object.values(state.items).find(item => item.wing === "tv" && Object.values(item.episodes || {}).some(episode => !episode.sourcePath) && Object.values(item.episodes || {}).some(episode => episode.sourcePath)) || Object.values(state.items).find(item => item.wing === "tv");
      return {
        schema: state.schemaVersion,
        counts: { records: Object.values(state.items).filter(item => !item.id.startsWith("tv_drive_")).length, episodes: episodes.length, links: episodes.filter(episode => episode.sourcePath).length },
        sample: { id: sample.id, title: sample.title, favorite: Boolean(sample.favorite) },
        migrated: {
          schema: migrated.schemaVersion,
          dvdPolicy: migrated.metadata.stage33.dvdRipsAreIntentional,
          enrichmentSafe: migrated.metadata.stage34.policy.externalGuessingAllowed === false,
          stewardSafe: migrated.metadata.stage35.policy.mediaFileChangesAllowed === false,
          museumSafe: migrated.metadata.stage36.policy.inventedDatesAllowed === false
        },
        nav: {
          groups: document.querySelectorAll(".nav-group").length,
          manageClosed: Boolean(document.querySelector('[data-nav-group="MANAGE"]:not([open])')),
          museum: document.querySelectorAll('[data-route="museum"]').length,
          enrichment: document.querySelectorAll('[data-route="enrichment"]').length,
          control: document.querySelectorAll('[data-route="control"]').length,
          steward: document.querySelectorAll('[data-route="steward"]').length
        }
      };
    });

    await page.evaluate(() => { location.hash = "#/tv"; });
    await page.waitForSelector(".tv-genre-overview", { timeout: 10000 });
    await page.evaluate(id => { location.hash = `#/tv/${id}`; }, baseline.sample.id);
    await page.waitForFunction(title => document.querySelector("#view-title")?.textContent === title, baseline.sample.title, { timeout: 10000 });
    const seriesBefore = await page.evaluate(() => ({
      header: Boolean(document.querySelector(".series-header")),
      seasons: document.querySelectorAll(".season-card").length,
      episodes: document.querySelectorAll(".episode-record").length,
      playable: document.querySelectorAll('a.episode-main[href^="file:///"]').length,
      catalogOnly: document.querySelectorAll("button.episode-main.catalog-only").length,
      noFileText: /NO FILE/i.test(document.querySelector("#view").textContent),
      quickNext: document.querySelectorAll("[data-quick-episode]").length
    }));
    const favoriteButton = page.locator(`[data-tv-favorite="${baseline.sample.id}"]`).first();
    await favoriteButton.click(); await page.waitForTimeout(120); await page.locator(`[data-tv-favorite="${baseline.sample.id}"]`).first().click();
    if (seriesBefore.catalogOnly) {
      await page.locator("button.episode-main.catalog-only").first().click();
      await page.waitForSelector("[data-episode-title]");
      await page.evaluate(async () => (await import("./js/ui/modals.js")).closeModal());
    }
    await page.locator("[data-tv-back]").click();
    await page.waitForSelector(".tv-browser");
    await page.locator('[data-tv-filter="scope"][data-tv-value="favorites"]').click();
    await page.locator("[data-tv-reset]").click();
    const tvPage = await page.evaluate(() => ({
      daily: document.querySelectorAll(".daily-tv-card").length,
      genreCards: document.querySelectorAll(".tv-genre-overview button").length,
      filters: document.querySelectorAll('[data-tv-filter="scope"]').length,
      noFileText: /NO FILE/i.test(document.querySelector("#view").textContent),
      optionalDvdCopy: /DVD rips/i.test(document.querySelector("#view").textContent)
    }));
    await page.screenshot({ path: "D:/Vault/tests/stage36-tv-daily-driver.png", fullPage: true });

    await page.evaluate(() => { location.hash = "#/enrichment"; });
    await page.waitForSelector(".enrichment-hero", { timeout: 10000 });
    const exclusionBefore = await page.evaluate(async () => (await import("./js/core/store.js")).getState().metadata.stage34.exclusions.length);
    const exclude = page.locator("[data-enrichment-exclude]").first();
    const exclusionKey = await exclude.getAttribute("data-enrichment-exclude");
    await exclude.click();
    await page.locator('[data-enrichment-mode="intentional"]').click();
    await page.locator(`[data-enrichment-restore="${exclusionKey}"]`).click();
    const enrichment = await page.evaluate(async before => {
      const store = await import("./js/core/store.js"); const system = await import("./js/systems/archiveEnrichment.js");
      const report = system.analyzeArchiveEnrichment();
      return { exclusionsRestored: store.getState().metadata.stage34.exclusions.length === before, average: report.summary.average, records: report.summary.records, cards: document.querySelectorAll(".enrichment-card").length, editorButtons: document.querySelectorAll("[data-workbench-edit]").length };
    }, exclusionBefore);

    await page.evaluate(() => { location.hash = "#/steward"; });
    await page.waitForSelector(".steward-hero", { timeout: 10000 });
    await page.evaluate(async () => (await import("./js/systems/vaultSteward.js")).runVaultSteward({ force: true, source: "manual" }));
    const steward = await page.evaluate(async () => {
      const store = await import("./js/core/store.js"); const health = await import("./js/systems/health.js");
      const state = store.getState(), stage = state.metadata.stage35, safety = stage.lastBrief.safety;
      return { enabled: stage.enabled, runs: stage.runs.length, brief: Boolean(stage.lastBrief), safe: Object.values(safety).every(value => value === false), health: health.runHealthCheck().ok, limits: document.querySelectorAll(".steward-limits span").length };
    });

    const dvdAutomation = await page.evaluate(async () => {
      const store = await import("./js/core/store.js"); const autopilot = await import("./js/systems/autopilot.js");
      const reportsBefore = store.getState().metadata.stage4.reports.length;
      const cycle = await autopilot.runAutopilotCycle({ source: "stage36_acceptance", quiet: true });
      const state = store.getState(), sentinel = cycle.steps.find(step => step.jobId === "sentinel");
      return { outcome: cycle.outcome, steps: cycle.steps.length, sentinelSkipped: /skipped/i.test(sentinel?.detail || ""), reportsUnchanged: state.metadata.stage4.reports.length === reportsBefore, mediaAllowed: state.metadata.stage10.policy.mediaFileChangesAllowed };
    });
    await page.evaluate(() => { location.hash = "#/museum"; });
    await page.waitForSelector(".museum-hero", { timeout: 10000 });
    await page.waitForFunction(async () => (await import("./js/core/store.js")).getState().metadata.stage36.exhibits.length > 0);
    const pinBefore = await page.evaluate(async () => (await import("./js/core/store.js")).getState().metadata.stage36.pins.length);
    const pin = page.locator("[data-museum-pin]").first();
    const pinId = await pin.getAttribute("data-museum-pin");
    await pin.click(); await page.waitForTimeout(120); await page.locator(`[data-museum-pin="${pinId}"]`).first().click();
    const museum = await page.evaluate(async before => {
      const store = await import("./js/core/store.js"); const system = await import("./js/systems/livingMuseum.js");
      const state = store.getState(), model = system.getLivingMuseumModel();
      return { pinsRestored: state.metadata.stage36.pins.length === before, exhibits: state.metadata.stage36.exhibits.length, spotlight: Boolean(model.currentExhibit), galleries: document.querySelectorAll(".museum-gallery").length, externalEvidenceOnly: state.metadata.stage36.policy.evidenceRequired && !state.metadata.stage36.policy.inventedDatesAllowed };
    }, pinBefore);
    await page.screenshot({ path: "D:/Vault/tests/stage36-living-museum.png", fullPage: true });

    const routeAudits = [];
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ["home", "tv", "enrichment", "steward", "museum"]) {
      await page.evaluate(value => { location.hash = `#/${value}`; }, route);
      await page.waitForTimeout(450);
      routeAudits.push(await page.evaluate(route => {
        const nameFor = element => (element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent || "").trim();
        return {
          route,
          title: document.querySelector("#view-title")?.textContent || "",
          primaryRoute: Boolean(document.querySelector(`[data-route="${CSS.escape(route)}"]`)),
          activeNav: document.querySelectorAll('.nav-button[aria-current="page"]').length,
          unnamedButtons: [...document.querySelectorAll("button")].filter(button => !nameFor(button)).length,
          unnamedControls: [...document.querySelectorAll("input:not([type=hidden]),select,textarea")].filter(control => !control.closest("label") && !control.getAttribute("aria-label") && !(control.id && document.querySelector(`label[for="${CSS.escape(control.id)}"]`))).length,
          width: document.documentElement.scrollWidth,
          viewport: innerWidth
        };
      }, route));
    }
    await page.screenshot({ path: "D:/Vault/tests/stage36-living-museum-mobile.png", fullPage: true });

    const final = await page.evaluate(async baselineCounts => {
      const store = await import("./js/core/store.js"); const health = await import("./js/systems/health.js");
      const state = store.getState(), episodes = Object.values(state.items).flatMap(item => Object.values(item.episodes || {}));
      return { schema: state.schemaVersion, counts: { records: Object.values(state.items).filter(item => !item.id.startsWith("tv_drive_")).length, episodes: episodes.length, links: episodes.filter(episode => episode.sourcePath).length }, countsExact: JSON.stringify(baselineCounts) === JSON.stringify({ records: Object.values(state.items).filter(item => !item.id.startsWith("tv_drive_")).length, episodes: episodes.length, links: episodes.filter(episode => episode.sourcePath).length }), health: health.runHealthCheck() };
    }, baseline.counts);

    const output = { baseline, seriesBefore, tvPage, enrichment, steward, dvdAutomation, museum, routeAudits, final, pageErrors, httpErrors, externalRequests };
    output.ok = baseline.schema === 42 && baseline.counts.records === 3543 && baseline.counts.episodes === 13055 && baseline.counts.links === 11941 &&
      baseline.migrated.schema === 42 && baseline.migrated.dvdPolicy && baseline.migrated.enrichmentSafe && baseline.migrated.stewardSafe && baseline.migrated.museumSafe &&
      baseline.nav.groups === 5 && baseline.nav.manageClosed && baseline.nav.museum === 1 && baseline.nav.enrichment === 1 && baseline.nav.control === 1 && baseline.nav.steward === 0 &&
      seriesBefore.header && seriesBefore.seasons > 0 && seriesBefore.episodes > 0 && seriesBefore.playable > 0 && seriesBefore.catalogOnly > 0 && !seriesBefore.noFileText && seriesBefore.quickNext <= 1 &&
      tvPage.daily > 0 && tvPage.genreCards > 0 && tvPage.filters === 6 && !tvPage.noFileText && tvPage.optionalDvdCopy &&
      enrichment.exclusionsRestored && enrichment.records === 3543 && enrichment.cards >= 0 && enrichment.editorButtons >= 0 &&
      steward.enabled && steward.runs > 0 && steward.brief && steward.safe && steward.health && steward.limits === 5 &&
      dvdAutomation.outcome === "passed" && dvdAutomation.steps === 4 && dvdAutomation.sentinelSkipped && dvdAutomation.reportsUnchanged && dvdAutomation.mediaAllowed === false &&
      museum.pinsRestored && museum.exhibits > 0 && museum.spotlight && museum.galleries > 0 && museum.externalEvidenceOnly &&
      routeAudits.every(audit => audit.title && audit.activeNav === (audit.primaryRoute ? 1 : 0) && audit.unnamedButtons === 0 && audit.unnamedControls === 0 && audit.width <= audit.viewport) &&
      final.schema === 42 && final.countsExact && final.health.ok && pageErrors.length === 0 && httpErrors.length === 0 && externalRequests.length === 0;
    console.log(JSON.stringify(output, null, 2));
    if (!output.ok) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
