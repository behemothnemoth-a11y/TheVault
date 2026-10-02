const { chromium } = require("./playwright-runtime.cjs");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
  });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const pageErrors = [], httpErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("response", response => { if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`); });
    await page.goto("http://127.0.0.1:4173/index.html#/home", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => document.querySelector("#schema-version")?.textContent === "42", null, { timeout: 45000 });

    const expected = {
      guild: "The Guild Hall", character: "Archivist Dossier", environment: "Environment Control",
      stats: "Archive Statistics", youtube: "YOU TUBE VAULT", music: "LISTENING ROOM",
      podcasts: "RADIO ARCHIVE", manga: "MANGA STACKS", food: "TEST KITCHEN",
      trips: "WORLD MAP", calendar: "ARCHIVE CALENDAR"
    };
    const pages = {};
    for (const [route, title] of Object.entries(expected)) {
      await page.evaluate(value => { location.hash = `#/${value}`; }, route);
      await page.waitForFunction(value => document.querySelector("#view-title")?.textContent === value, title, { timeout: 10000 });
      pages[route] = await page.locator("#view-title").textContent();
    }

    const result = await page.evaluate(async () => {
      const store = await import("./js/core/store.js");
      const guild = await import("./js/systems/guildHall.js");
      const expeditions = await import("./js/systems/expeditions.js");
      const progression = await import("./js/systems/progression.js");
      const themes = await import("./js/systems/themeEngine.js");
      const reports = await import("./js/systems/expandedArchive.js");
      const health = await import("./js/systems/health.js");
      const itemId = "movie_stage17_seal_test";
      const collectionId = "collection_stage17_seal_test";
      store.update(save => {
        save.items[itemId] = {
          id: itemId, type: "movie", wing: "movies", title: "Alpha Seal Test",
          year: 2026, genres: ["Acceptance"], status: "completed", rating: null, note: ""
        };
        save.collections[collectionId] = {
          id: collectionId, title: "Alpha Seal Collection", description: "Acceptance record",
          createdAt: new Date().toISOString(), itemIds: [itemId], notes: "", milestones: [], status: "open"
        };
      });
      const xpBefore = store.getState().profile.xp;
      guild.sealCollection(collectionId);
      await new Promise(resolve => setTimeout(resolve, 100));
      const structured = window.vaultStructuredCommand("show unfinished horror before 1990");
      const random = window.vaultStructuredCommand("random horror");
      window.vaultStructuredCommand("basement").run();
      await new Promise(resolve => setTimeout(resolve, 150));
      store.update(save => {
        save.preferences.theme = "windows95";
        save.preferences.spoilerClearance = 0;
      });
      themes.applyVaultEnvironment();
      const state = store.getState();
      const check = health.runHealthCheck(state);
      const yearbook = reports.getArchiveReport(state);
      return {
        schema: state.schemaVersion,
        health: check,
        stages: [12, 13, 14, 15, 16].map(number => Boolean(state.metadata[`stage${number}`])),
        collections: Object.keys(state.collections).length,
        sealed: state.collections[collectionId].status,
        expeditions: expeditions.getExpeditions().length,
        xpBefore,
        xpAfter: state.profile.xp,
        profile: progression.profileForXp(state.profile.xp),
        grants: state.metadata.stage13.grants.length,
        commands: {
          structured: structured?.label,
          structuredHint: structured?.hint,
          random: random?.label
        },
        basement: {
          foundAt: state.metadata.stage14.basementFoundAt,
          title: document.querySelector("#view-title")?.textContent,
          hiddenFromNav: !document.querySelector('[data-route="basement"]')
        },
        environment: {
          theme: document.body.dataset.theme,
          clearance: document.body.dataset.clearance
        },
        report: {
          items: yearbook.items.length,
          wings: yearbook.wings.length,
          genres: yearbook.genres.length
        }
      };
    });
    result.pages = pages;
    result.pageErrors = pageErrors;
    result.httpErrors = httpErrors;
    result.ok = result.schema === 42 && result.health.ok && result.stages.every(Boolean) &&
      Object.entries(expected).every(([route, title]) => pages[route] === title) &&
      result.collections >= 4 && result.sealed === "sealed" && result.expeditions >= 3 &&
      result.xpAfter > result.xpBefore && result.grants >= 1 &&
      result.commands.structured?.includes("unfinished horror") && result.commands.random === "random horror" &&
      result.basement.foundAt && result.basement.title === "???" && result.basement.hiddenFromNav &&
      result.environment.theme === "windows95" && result.environment.clearance === "0" &&
      result.report.items >= 3544 && result.report.wings >= 4 &&
      pageErrors.length === 0 && httpErrors.length === 0;
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
