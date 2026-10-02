const { chromium } = require("./playwright-runtime.cjs");
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
  try {
    const page = await browser.newPage();
    const pageErrors = [], httpErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("response", response => { if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`); });
    await page.goto("http://127.0.0.1:4173/index.html#/expedition-builder", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => document.querySelector("#schema-version")?.textContent === "42", null, { timeout: 45000 });
    await page.waitForFunction(() => document.querySelector("#view-title")?.textContent === "Expedition Builder", null, { timeout: 10000 });
    const result = await page.evaluate(async () => {
      const builder = await import("./js/systems/expeditionBuilder.js");
      const runtime = await import("./js/systems/expeditions.js");
      const store = await import("./js/core/store.js");
      const health = await import("./js/systems/health.js");
      const id = await builder.createExpeditionDefinition({
        title: "Stage 19 Test Quest", description: "Cross-wing evidence.", reward: "75 XP",
        objectives: [
          { label: "Archive two items", eventType: "ITEM_COMPLETED", target: 2 },
          { label: "Visit three wings", eventType: "WING_VISITED", target: 3, uniqueBy: "wing", optional: true },
          { label: "Classified recovery", eventType: "ANCIENT_BACKLOG_COMPLETED", target: 1, hidden: true }
        ]
      });
      await builder.editExpeditionDefinition(id, { title: "Stage 19 Edited Quest", reward: "SECRET MAP" });
      await builder.archiveExpeditionDefinition(id);
      const archive = [...store.getState().metadata.stage19.changeLog].reverse().find(change => change.label === "archive Expedition");
      await builder.undoExpeditionChange(archive.id);
      builder.renderExpeditionBuilder();
      const state = store.getState(), definition = state.metadata.stage19.definitions[id];
      const check = health.runHealthCheck(state);
      return {
        schema: state.schemaVersion, health: check,
        definition: { title: definition.title, status: definition.status, reward: definition.reward, objectives: definition.objectives },
        live: runtime.getExpeditions().some(entry => entry.id === id),
        changes: state.metadata.stage19.changeLog.map(change => change.status),
        page: { title: document.querySelector("#view-title")?.textContent, cards: document.querySelectorAll(".guild-card").length }
      };
    });
    result.pageErrors = pageErrors; result.httpErrors = httpErrors;
    result.ok = result.schema === 42 && result.health.ok && result.definition.title === "Stage 19 Edited Quest" &&
      result.definition.status === "available" && result.definition.objectives.length === 3 &&
      result.definition.objectives.some(objective => objective.hidden) && result.definition.objectives.some(objective => objective.optional) &&
      result.live && result.changes.length === 3 && result.changes.at(-1) === "undone" &&
      result.page.title === "Expedition Builder" && result.page.cards === 1 && pageErrors.length === 0 && httpErrors.length === 0;
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
