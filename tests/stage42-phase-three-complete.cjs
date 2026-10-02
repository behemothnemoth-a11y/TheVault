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
  const open = async route => {
    await page.goto(`${BASE}#/${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#schema-version")?.textContent === "42", null, { timeout: 60000 });
  };
  try {
    await open("home");
    await page.locator("#boot:not(.dismissed)").click().catch(() => {});
    const baseline = await page.evaluate(async () => {
      const store = await import("./js/core/store.js");
      const health = await import("./js/systems/health.js");
      const migrations = await import("./js/core/migrations.js");
      const state = store.getState(), schema37 = structuredClone(state);
      schema37.schemaVersion = 37;
      for (const key of ["stage38", "stage39", "stage40", "stage41", "stage42"]) delete schema37.metadata[key];
      const migrated = migrations.migrateSave(schema37);
      const episodes = Object.values(state.items).flatMap(item => Object.values(item.episodes || {}));
      return {
        schema: state.schemaVersion, health: health.runHealthCheck(), migratedHealth: health.runHealthCheck(migrated),
        migratedSchema: migrated.schemaVersion,
        policies: {
          calibration: migrated.metadata.stage38.policy,
          planner: migrated.metadata.stage39.policy,
          record: migrated.metadata.stage40.policy,
          host: migrated.metadata.stage41.policy,
          companion: migrated.metadata.stage42.policy
        },
        records: Object.keys(state.items).length, episodes: episodes.length, links: episodes.filter(episode => episode.sourcePath).length,
        itemFingerprint: JSON.stringify(Object.entries(state.items).sort(([a], [b]) => a.localeCompare(b))),
        hostRuns: state.metadata.stage41.runs.length, companionProposals: state.metadata.stage42.proposals.length
      };
    });

    const routeSelectors = {
      today: ".desk-grid .desk-card", calibrate: ".phase-hero", session: ".session-controls",
      host: ".host-brief", companion: ".companion-proposal"
    };
    const routeUi = {};
    for (const [route, selector] of Object.entries(routeSelectors)) {
      await open(route); await page.waitForSelector(selector);
      routeUi[route] = await page.evaluate(() => ({
        title: document.querySelector("#view-title")?.textContent,
        overflow: document.documentElement.scrollWidth > innerWidth,
        unnamedButtons: [...document.querySelectorAll("#view button")].filter(button => !(button.getAttribute("aria-label") || button.getAttribute("title") || button.textContent || "").trim()).length
      }));
    }

    await open("calibrate");
    await page.locator("[data-calibration-start]").click();
    const firstPair = await page.evaluate(async () => {
      const store = await import("./js/core/store.js"), calibration = await import("./js/systems/tasteCalibration.js");
      const model = calibration.getCalibrationModel();
      return { leftId: model.pair.leftId, rightId: model.pair.rightId, sessions: store.getState().metadata.stage38.sessions.length };
    });
    await page.locator('[data-calibration-choice="left"]').click();
    const chosen = await page.evaluate(async ids => {
      const store = await import("./js/core/store.js"), state = store.getState(), latest = state.metadata.stage38.comparisons[0];
      return { choice: latest.choice, left: state.metadata.stage38.signals.items[ids.leftId], right: state.metadata.stage38.signals.items[ids.rightId] || 0, deltas: latest.deltas.length };
    }, firstPair);
    await page.locator("[data-calibration-undo]").click();
    const undone = await page.evaluate(async ids => {
      const store = await import("./js/core/store.js"), state = store.getState(), latest = state.metadata.stage38.comparisons[0];
      return { undone: latest.undone, left: state.metadata.stage38.signals.items[ids.leftId] || 0 };
    }, firstPair);
    await page.locator('[data-calibration-choice="skip"]').click();
    const skipped = await page.evaluate(async () => {
      const store = await import("./js/core/store.js"), latest = store.getState().metadata.stage38.comparisons[0];
      return { choice: latest.choice, deltas: latest.deltas.length };
    });
    await page.locator('[data-calibration-choice="left"]').click();
    const explicitSignal = await page.evaluate(async () => {
      const store = await import("./js/core/store.js"), calibration = await import("./js/systems/tasteCalibration.js");
      const state = store.getState(), latest = state.metadata.stage38.comparisons[0], item = state.items[latest.leftId];
      return { itemId: item.id, signal: calibration.tasteSignalFor(item).total, comparisons: state.metadata.stage38.comparisons.length };
    });

    await open("session");
    await page.locator('[data-session-pref="duration"][data-session-value="30"]').click();
    await page.locator('[data-session-pref="energy"][data-session-value="easy"]').click();
    await page.locator('[data-session-pref="focus"][data-session-value="watch"]').click();
    await page.locator("[data-session-create]").first().click();
    const draft = await page.evaluate(async () => {
      const store = await import("./js/core/store.js"), planner = await import("./js/systems/sessionPlanner.js");
      const model = planner.getSessionModel();
      return { id: model.plan.id, status: model.plan.status, target: model.plan.targetMinutes, minutes: model.plan.plannedMinutes, entries: model.entries.map(entry => entry.itemId), source: model.plan.source };
    });
    await page.locator('[data-session-action="start"]').click();
    await page.locator('[data-session-action="finish"]').click();
    const completedSession = await page.evaluate(async id => {
      const store = await import("./js/core/store.js"), plan = store.getState().metadata.stage39.plans.find(entry => entry.id === id);
      return { status: plan.status, started: Boolean(plan.startedAt), finished: Boolean(plan.finishedAt), activePlanId: store.getState().metadata.stage39.activePlanId };
    }, draft.id);

    const recordId = draft.entries[0];
    await open(`record/${encodeURIComponent(recordId)}`);
    await page.waitForSelector(".record-hero");
    const record = await page.evaluate(id => ({
      title: document.querySelector("#view-title")?.textContent,
      route: location.hash,
      ratingControls: document.querySelectorAll("[data-record-rating]").length,
      recentFiled: Boolean(document.querySelector(".record-dashboard")),
      id
    }), recordId);

    await open("host");
    const hostBefore = await page.evaluate(async () => (await import("./js/core/store.js")).getState().metadata.stage41.runs.length);
    await page.locator("[data-host-run]").click();
    const host = await page.evaluate(async before => {
      const store = await import("./js/core/store.js"), stage = store.getState().metadata.stage41;
      return { added: stage.runs.length === before + 1, outcome: stage.runs[0].outcome, checks: stage.runs[0].checks, mutations: stage.runs[0].mutations, findings: stage.brief.findings.length };
    }, hostBefore);

    await open("companion");
    const originalProposal = await page.evaluate(async () => {
      const store = await import("./js/core/store.js"), stage = store.getState().metadata.stage42;
      return stage.proposals.find(entry => entry.id === stage.currentProposalId).id;
    });
    await page.locator(`[data-companion-all="reject"][data-companion-proposal="${originalProposal}"]`).click();
    await page.locator("[data-companion-generate]").click();
    const proposal = await page.evaluate(async () => {
      const store = await import("./js/core/store.js"), stage = store.getState().metadata.stage42;
      const current = stage.proposals.find(entry => entry.id === stage.currentProposalId);
      return { id: current.id, dryRun: current.dryRun, actions: Object.fromEntries(current.actions.map(action => [action.kind, action.id])) };
    });
    await page.locator(`[data-companion-action="approve"][data-companion-action-id="${proposal.actions.prepare_session}"]`).click();
    await page.locator(`[data-companion-action="approve"][data-companion-action-id="${proposal.actions.calibration_round}"]`).click();
    await page.locator(`[data-companion-action="reject"][data-companion-action-id="${proposal.actions.desk_mode}"]`).click();
    const supervised = await page.evaluate(async ids => {
      const store = await import("./js/core/store.js"), state = store.getState();
      const proposal = state.metadata.stage42.proposals.find(entry => entry.id === ids.id);
      return {
        status: proposal.status, dryRun: proposal.dryRun,
        actions: Object.fromEntries(proposal.actions.map(action => [action.kind, action.status])),
        approvedSession: state.metadata.stage39.plans[0].source,
        appliedActions: state.metadata.stage42.cycles.find(cycle => cycle.proposalId === proposal.id).appliedActions
      };
    }, proposal);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = {};
    for (const route of ["today", "calibrate", "session", `record/${encodeURIComponent(recordId)}`, "host", "companion"]) {
      await open(route);
      mobile[route.split("/")[0]] = await page.evaluate(() => ({
        inner: innerWidth, scroll: document.documentElement.scrollWidth,
        overflow: document.documentElement.scrollWidth > innerWidth,
        unnamedButtons: [...document.querySelectorAll("#view button")].filter(button => !(button.getAttribute("aria-label") || button.getAttribute("title") || button.textContent || "").trim()).length
      }));
    }

    const final = await page.evaluate(async () => {
      const store = await import("./js/core/store.js"), health = await import("./js/systems/health.js"), state = store.getState();
      return {
        health: health.runHealthCheck(),
        itemFingerprint: JSON.stringify(Object.entries(state.items).sort(([a], [b]) => a.localeCompare(b))),
        schema: state.schemaVersion,
        counts: { calibrationSessions: state.metadata.stage38.sessions.length, comparisons: state.metadata.stage38.comparisons.length, sessionPlans: state.metadata.stage39.plans.length, recordHistory: state.metadata.stage40.recentRecords.length, hostRuns: state.metadata.stage41.runs.length, proposals: state.metadata.stage42.proposals.length }
      };
    });

    const result = { baseline, routeUi, calibration: { firstPair, chosen, undone, skipped, explicitSignal }, draft, completedSession, record, host, proposal, supervised, mobile, final, pageErrors, httpErrors, externalRequests };
    result.ok = baseline.schema === 42 && baseline.migratedSchema === 42 && baseline.health.ok && baseline.migratedHealth.ok &&
      baseline.records === 3543 && baseline.episodes === 13055 && baseline.links === 11941 &&
      baseline.policies.calibration.explicitInputOnly && baseline.policies.calibration.negativeInferenceAllowed === false &&
      baseline.policies.planner.automaticCompletion === false && baseline.policies.record.editsRemainExplicit &&
      baseline.policies.host.onlyWhileOpen && baseline.policies.host.networkAllowed === false &&
      baseline.policies.companion.explicitApprovalRequired && baseline.policies.companion.automaticCompletion === false &&
      Object.values(routeUi).every(entry => entry.title && !entry.overflow && entry.unnamedButtons === 0) &&
      chosen.choice === "left" && chosen.left === 2 && chosen.right === 0 && chosen.deltas === 1 &&
      undone.undone && undone.left === 0 && skipped.choice === "skip" && skipped.deltas === 0 && explicitSignal.signal > 0 &&
      draft.status === "draft" && draft.target === 30 && draft.minutes === 30 && draft.entries.length >= 1 &&
      completedSession.status === "completed" && completedSession.started && completedSession.finished && completedSession.activePlanId === null &&
      record.route === `#/record/${encodeURIComponent(recordId)}` && record.ratingControls === 10 && record.recentFiled &&
      host.added && host.outcome === "passed" && host.checks === 5 && host.mutations === 0 && host.findings === 5 &&
      proposal.dryRun && supervised.status === "applied" && supervised.actions.prepare_session === "applied" && supervised.actions.calibration_round === "applied" && supervised.actions.desk_mode === "rejected" && supervised.approvedSession === "autopilot_approved" && supervised.appliedActions === 2 &&
      Object.values(mobile).every(entry => entry.inner === 390 && entry.scroll === 390 && !entry.overflow && entry.unnamedButtons === 0) &&
      final.schema === 42 && final.health.ok && final.itemFingerprint === baseline.itemFingerprint &&
      pageErrors.length === 0 && httpErrors.length === 0 && externalRequests.length === 0;
    const printable = structuredClone(result);
    printable.baseline.itemFingerprint = `${baseline.itemFingerprint.length} byte stable fingerprint`;
    printable.final.itemFingerprint = final.itemFingerprint === baseline.itemFingerprint ? "UNCHANGED" : "CHANGED";
    console.log(JSON.stringify(printable, null, 2));
    await browser.close();
    if (!result.ok) process.exit(1);
  } catch (error) {
    console.error(error);
    await browser.close();
    process.exit(1);
  }
})();
