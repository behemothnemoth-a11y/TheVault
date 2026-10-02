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
  await page.goto("http://127.0.0.1:4173/index.html#/voice", {
    waitUntil: "domcontentloaded", timeout: 30000
  });
  await page.waitForFunction(() => document.querySelector("#schema-version")?.textContent === "42", null, {
    timeout: 45000
  });
  await page.waitForFunction(() => document.querySelector("#view-title")?.textContent === "Archive Voice", null, {
    timeout: 10000
  });

  const result = await page.evaluate(async () => {
    const store = await import("./js/core/store.js");
    const events = await import("./js/core/events.js");
    const health = await import("./js/systems/health.js");
    const observations = await import("./js/systems/observations.js");
    const testId = "movie_stage11_acceptance_2010";
    store.update(save => {
      save.items[testId] = {
        id: testId, type: "movie", wing: "movies", title: "Stage 11 Acceptance Relic",
        year: 2010, genres: ["Test Archive"], status: "completed", owned: false,
        addedAt: "2010-01-01T00:00:00.000Z", rating: null, note: ""
      };
    });
    events.emit("ITEM_COMPLETED", {
      itemId: testId, wing: "movies", meta: { title: "Stage 11 Acceptance Relic" }
    });
    await new Promise(resolve => setTimeout(resolve, 100));
    const state = store.getState();
    const report = observations.getObservationReport(state);
    const check = health.runHealthCheck(state);
    const moments = state.metadata.stage11.moments;
    return {
      schema: state.schemaVersion,
      health: check,
      signalCount: report.length,
      signalsHaveEvidence: report.every(signal =>
        signal.id && signal.message && signal.evidence && typeof signal.evidence === "object"
      ),
      selected: observations.selectObservation(state),
      moments: moments.map(moment => ({
        kind: moment.kind, title: moment.title, hasEvidence: Boolean(moment.evidence)
      })),
      ancientMoment: moments.find(moment =>
        moment.kind === "ancient_backlog" && moment.evidence?.itemId === testId
      ),
      firstAchievement: state.achievements.achievement_first_archive,
      page: {
        title: document.querySelector("#view-title")?.textContent,
        code: document.querySelector("#view-code")?.textContent,
        signalCards: document.querySelectorAll(".voice-signal").length,
        policyVisible: document.querySelector(".voice-policy")?.textContent.includes("DOES NOT INVENT")
      }
    };
  });
  result.pageErrors = pageErrors;
  result.httpErrors = httpErrors;
  result.ok = result.schema === 42 && result.health.ok && result.signalCount > 0 &&
    result.signalsHaveEvidence && result.ancientMoment?.evidence?.days >= 1825 &&
    result.firstAchievement && result.page.title === "Archive Voice" &&
    result.page.code === "VAULT://VOICE" && result.page.signalCards === result.signalCount &&
    result.page.policyVisible && pageErrors.length === 0 && httpErrors.length === 0;
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  if (!result.ok) process.exitCode = 1;
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
