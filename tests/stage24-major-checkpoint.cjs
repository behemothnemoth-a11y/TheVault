const { chromium } = require("./playwright-runtime.cjs");
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
  try {
    const page = await browser.newPage(), pageErrors = [], httpErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("response", response => { if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`); });
    await page.goto("http://127.0.0.1:4173/index.html#/achievement-workshop", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => document.querySelector("#schema-version")?.textContent === "42", null, { timeout: 45000 });
    await page.waitForFunction(() => document.querySelector("#view-title")?.textContent === "Achievement Workshop", null, { timeout: 10000 });
    const result = await page.evaluate(async () => {
      const workshop = await import("./js/systems/achievementWorkshop.js");
      const achievements = await import("./js/systems/achievements.js");
      const unlocks = await import("./js/systems/unlockables.js");
      const consoleSystem = await import("./js/systems/advancedConsole.js");
      const spoilers = await import("./js/systems/spoilerPolicy.js");
      const environment = await import("./js/systems/themeEngine.js");
      const layouts = await import("./js/systems/themeLayouts.js");
      const events = await import("./js/core/events.js");
      const store = await import("./js/core/store.js");
      const health = await import("./js/systems/health.js");
      const item = Object.values(store.getState().items).find(entry => entry.wing === "movies");
      const achievementId = await workshop.createAchievementDefinition({
        title: "Stage 24 Evidence Test", description: "One canonical completion.", icon: "T", secret: true, rarity: "rare", xp: 30,
        rule: { type: "event_count", eventType: "ITEM_COMPLETED", target: 1 }
      });
      events.emit("ITEM_COMPLETED", { itemId: item.id, wing: item.wing, meta: { title: item.title } });
      await new Promise(resolve => setTimeout(resolve, 120));
      store.update(save => { save.profile.level = 7; });
      unlocks.syncUnlockables();
      window.vaultStructuredCommand("save query old horror = find movies genre horror before 1990 unfinished").run();
      const advancedMatches = consoleSystem.queryItems("find movies genre horror before 1990 unfinished");
      const show = Object.values(store.getState().items).find(entry => entry.wing === "tv" && Object.keys(entry.episodes || {}).length);
      const showClearance = spoilers.clearanceForShow(show, 5);
      const themeResults = {};
      for (const theme of ["archive", "video_store", "windows95", "bunker"]) {
        store.update(save => { save.preferences.theme = theme; });
        environment.applyVaultEnvironment(); const signature = layouts.applyThemeLayout();
        themeResults[theme] = { theme: document.body.dataset.theme, layout: document.body.dataset.layout, signature: signature.layout };
      }
      location.hash = "#/unlockables"; await new Promise(resolve => setTimeout(resolve, 120));
      const state = store.getState(), unlocked = state.achievements[achievementId], check = health.runHealthCheck(state);
      return {
        schema: state.schemaVersion, health: check,
        stages: [20, 21, 22, 23, 24].map(number => Boolean(state.metadata[`stage${number}`])),
        achievement: { unlocked: Boolean(unlocked), evidence: unlocked?.evidence, definition: achievements.getAchievementDefinitions(state).some(entry => entry.id === achievementId) },
        unlocks: { count: Object.keys(state.metadata.stage21.unlocks).length, coreLocked: state.metadata.stage21.coreFunctionsLocked },
        commands: { matches: advancedMatches.length, saved: state.metadata.stage22.savedQueries["old horror"]?.query },
        spoiler: { clearance: showClearance, completed: Object.values(show.episodes).filter(entry => entry.status === "completed").length, total: Object.keys(show.episodes).length },
        themes: themeResults,
        page: { title: document.querySelector("#view-title")?.textContent, cards: document.querySelectorAll(".achievement").length }
      };
    });
    result.pageErrors = pageErrors; result.httpErrors = httpErrors;
    result.ok = result.schema === 42 && result.health.ok && result.stages.every(Boolean) &&
      result.achievement.unlocked && result.achievement.definition && result.achievement.evidence.count >= 1 &&
      result.unlocks.count >= 6 && result.unlocks.coreLocked === false &&
      result.commands.matches > 0 && result.commands.saved.includes("horror") &&
      result.spoiler.clearance >= 1 && result.spoiler.clearance <= 5 &&
      Object.values(result.themes).every(value => value.theme && value.layout === value.signature) &&
      new Set(Object.values(result.themes).map(value => value.layout)).size === 4 &&
      result.page.title === "Unlock Vault" && result.page.cards >= 6 &&
      pageErrors.length === 0 && httpErrors.length === 0;
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
