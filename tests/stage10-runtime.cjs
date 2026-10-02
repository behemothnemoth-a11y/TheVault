const { chromium } = require("./playwright-runtime.cjs");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  const httpErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("response", response => {
    if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto("http://127.0.0.1:4173/index.html#/autopilot", {
    waitUntil: "domcontentloaded", timeout: 30000
  });
  await page.waitForFunction(() => document.querySelector("#schema-version")?.textContent === "42", null, {
    timeout: 45000
  });

  const routes = ["repairs", "artwork", "discover", "operations", "autopilot"];
  const pages = {};
  for (const route of routes) {
    await page.evaluate(value => { location.hash = `#/${value}`; }, route);
    await page.waitForTimeout(250);
    pages[route] = await page.locator("#view-title").textContent();
  }

  const result = await page.evaluate(async () => {
    const health = await import("./js/systems/health.js");
    const store = await import("./js/core/store.js");
    const discovery = await import("./js/systems/discoveryEngine.js");
    const autopilot = await import("./js/systems/autopilot.js");
    const repairBay = await import("./js/systems/repairBay.js");
    const curator = await import("./js/systems/artworkCurator.js");

    const sourcePaths = state => Object.values(state.items || {}).flatMap(item =>
      Object.values(item.episodes || {}).map(episode => `${episode.id}|${episode.sourcePath || ""}`).sort()
    );
    const initial = store.getState();
    const pathsBefore = JSON.stringify(sourcePaths(initial));
    const titleCounts = new Map();
    for (const item of Object.values(initial.items || {})) {
      const key = item.title.toLowerCase();
      titleCounts.set(key, (titleCounts.get(key) || 0) + 1);
    }
    const firstItem = Object.values(initial.items || {}).find(item => titleCounts.get(item.title.toLowerCase()) === 1);
    const artworkMatches = curator.analyzeArtworkFiles([
      new File(["acceptance"], `${firstItem.id}.jpg`, { type: "image/jpeg" })
    ]);

    const cycle = await autopilot.runAutopilotCycle({ source: "acceptance", quiet: true });
    let afterCycle = store.getState();
    const proposal = (afterCycle.metadata.stage5?.proposals || []).find(entry =>
      entry.confidence === "high" && entry.status === "pending"
    );
    let repairRollback = { exercised: false, linksRestored: true };
    if (proposal) {
      const repair = await repairBay.applyProtectedRepair(proposal.id);
      await repairBay.rollbackProtectedRepair(repair.id);
      repairRollback = {
        exercised: true,
        action: repair.action,
        status: store.getState().metadata.stage6.repairs.find(entry => entry.id === repair.id)?.status,
        linksRestored: JSON.stringify(sourcePaths(store.getState())) === pathsBefore
      };
    }

    const state = store.getState();
    const check = health.runHealthCheck(state);
    return {
      schema: state.schemaVersion,
      items: Object.keys(state.items || {}).length,
      episodes: check.episodes,
      linkedEpisodes: check.linkedEpisodes,
      health: check,
      stages: [6, 7, 8, 9, 10].map(number => Boolean(state.metadata?.[`stage${number}`])),
      collections: discovery.buildDynamicCollections(state).map(entry => ({ id: entry.id, count: entry.items.length })),
      discoveryModes: ["chaos", "archaeology", "almost", "comfort", "deepcut"].map(mode => ({
        mode, count: discovery.getDiscoveryCandidates(mode, state).length
      })),
      artworkAnalysis: {
        candidates: artworkMatches.length,
        ready: artworkMatches.filter(entry => entry.status === "ready").length
      },
      autopilot: {
        outcome: cycle.outcome,
        steps: cycle.steps.map(entry => `${entry.jobId}:${entry.outcome}`),
        cycleCount: state.metadata.stage10.cycles.length
      },
      repairRollback,
      proposals: state.metadata.stage5.summary,
      safety: state.metadata.stage10.policy
    };
  });

  result.pages = pages;
  result.pageErrors = pageErrors;
  result.httpErrors = httpErrors;
  result.ok = result.schema === 42 && result.health.ok && result.stages.every(Boolean) &&
    Object.values(pages).every(Boolean) && pageErrors.length === 0 && httpErrors.length === 0 &&
    result.artworkAnalysis.ready === 1 &&
    result.autopilot.outcome === "passed" && result.autopilot.steps.length === 4 &&
    result.repairRollback.exercised && result.repairRollback.status === "rolled_back" &&
    result.repairRollback.linksRestored &&
    result.safety.repairsAutomatic === false &&
    result.safety.artworkAutomatic === false &&
    result.safety.mediaFileChangesAllowed === false;
  console.log(JSON.stringify(result, null, 2));
  await page.screenshot({ path: "D:/Vault/tests/stage10-final-autopilot.png", fullPage: true });
  await browser.close();
  if (!result.ok) process.exitCode = 1;
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
