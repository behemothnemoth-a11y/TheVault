const { chromium } = require("./playwright-runtime.cjs");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
  });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    const httpErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("response", response => {
      if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`);
    });

    await page.goto("http://127.0.0.1:4173/index.html#/oracle", {
      waitUntil: "domcontentloaded", timeout: 30000
    });
    await page.waitForFunction(() => document.querySelector("#schema-version")?.textContent === "42", null, { timeout: 45000 });
    await page.waitForFunction(() => document.querySelector("#view-title")?.textContent === "Vault Oracle", null, { timeout: 10000 });

    const oracle = await page.evaluate(async () => {
      const oracleModule = await import("./js/systems/vaultOracle.js");
      const graph = await import("./js/systems/relationshipGraph.js");
      const store = await import("./js/core/store.js");
      const health = await import("./js/systems/health.js");
      const state = store.getState();
      const visible = Object.values(state.items).filter(item => !item.id.startsWith("tv_drive_"));
      const expectedHorror = visible.filter(item => item.wing === "movies" && item.owned === true && (item.genres || []).some(genre => genre.toLowerCase() === "horror")).length;
      const expectedArchiveHorror = visible.filter(item => item.wing === "movies" && (item.genres || []).some(genre => genre.toLowerCase() === "horror")).length;
      const expectedMissingEpisodes = visible.filter(item => item.wing === "tv").flatMap(item => Object.values(item.episodes || {})).filter(episode => !episode.sourcePath).length;
      const connectedItem = visible.find(item => item.wing === "movies" && graph.connectionsForNode("item", item.id, state).length);
      const horror = oracleModule.askVault("How many horror movies do I have?", state);
      const archiveHorror = oracleModule.askVault("How many horror movies are in the archive?", state);
      const episodes = oracleModule.askVault("How many TV episodes are missing files?", state);
      const relationships = oracleModule.askVault(`What is connected to "${connectedItem.title}"?`, state);
      const recent = oracleModule.askVault("What happened recently?", state);
      const unsupported = oracleModule.askVault("Who will win an award next year?", state);
      return {
        schema: state.schemaVersion,
        initialHistoryIds: (state.metadata.stage30.history || []).map(entry => entry.id),
        initialPlanIds: (state.metadata.stage31.plans || []).map(entry => entry.id),
        initialRunIds: (state.metadata.stage31.runs || []).map(entry => entry.id),
        historyBefore: state.metadata.stage30.history.length,
        horror: {
          status: horror.status, intent: horror.intent, confidence: horror.confidence,
          count: horror.facts.find(fact => fact.label === "Matching records")?.value,
          expected: expectedHorror, citations: horror.citations.length,
          citationsValid: horror.citations.every(source => source.type === "record" && Boolean(state.items[source.id]))
        },
        archiveHorror: { count: archiveHorror.facts.find(fact => fact.label === "Matching records")?.value, expected: expectedArchiveHorror, citations: archiveHorror.citations.length },
        episodes: {
          status: episodes.status,
          count: episodes.facts.find(fact => fact.label === "Matching episodes")?.value,
          expected: expectedMissingEpisodes, citations: episodes.citations.length,
          citationsValid: episodes.citations.every(source => source.type === "episode" && source.detail.sourceLinked === false)
        },
        relationships: {
          item: connectedItem.title, status: relationships.status,
          citations: relationships.citations.length,
          hasRecord: relationships.citations.some(source => source.type === "record" && source.id === connectedItem.id),
          hasEvidence: relationships.citations.some(source => source.type === "relationship" && source.detail.evidence)
        },
        recent: { status: recent.status, eventCitations: recent.citations.filter(source => source.type === "event").length },
        unsupported: { status: unsupported.status, citations: unsupported.citations.length, confidence: unsupported.confidence },
        health: health.runHealthCheck(state)
      };
    });

    await page.locator("[data-oracle-question]").fill("How many horror movies are in the archive?");
    await page.locator("[data-oracle-ask]").click();
    await page.waitForFunction(() => document.querySelector(".oracle-answer")?.textContent.includes("GROUNDED"), null, { timeout: 10000 });
    const oraclePage = {
      title: await page.locator("#view-title").textContent(),
      answer: await page.locator(".oracle-answer h3").textContent(),
      citations: await page.locator(".oracle-citations article").count(),
      history: await page.locator(".oracle-history article").count(),
      navButton: await page.locator('[data-route="oracle"]').count()
    };
    await page.screenshot({ path: "D:/Vault/tests/stage31-vault-oracle.png", fullPage: true });

    await page.evaluate(() => { location.hash = "#/supervision"; });
    await page.waitForFunction(() => document.querySelector("#view-title")?.textContent === "Supervision Deck", null, { timeout: 10000 });
    const supervisionPage = {
      title: await page.locator("#view-title").textContent(),
      jobs: await page.locator("[data-supervision-job]").count(),
      policyCards: await page.locator(".supervision-policy article").count(),
      previewButton: await page.locator("[data-supervision-preview]").count(),
      navButton: await page.locator('[data-route="supervision"]').count()
    };
    await page.screenshot({ path: "D:/Vault/tests/stage31-supervision-deck.png", fullPage: true });

    const supervision = await page.evaluate(async baseline => {
      const system = await import("./js/systems/supervisedAutomation.js");
      const store = await import("./js/core/store.js");
      const health = await import("./js/systems/health.js");
      const stage = () => store.getState().metadata.stage31;
      const beforeSummaryExists = Object.prototype.hasOwnProperty.call(stage(), "archiveSummary");
      const beforeSummary = beforeSummaryExists ? structuredClone(stage().archiveSummary) : null;
      const snapshotsBefore = (await store.getArchiveSnapshots()).length;

      const blocked = system.createSupervisedPlan(["health_audit"], {
        title: "Stage 31 blocked-confidence acceptance",
        confidenceOverrides: { health_audit: .5 }
      });
      let blockedApprovalRejected = false;
      try { system.approveSupervisedPlan(blocked.id); } catch (error) { blockedApprovalRejected = /confidence/.test(error.message); }

      const unapproved = system.createSupervisedPlan(["health_audit"], { title: "Stage 31 approval-gate acceptance" });
      let unapprovedExecutionRejected = false;
      try { await system.executeSupervisedPlan(unapproved.id); } catch (error) { unapprovedExecutionRejected = /approve/.test(error.message); }

      const isolationPlan = system.createSupervisedPlan(["health_audit", "isolation_probe", "relationship_integrity"], {
        title: "Stage 31 failure-isolation acceptance", allowDiagnostics: true
      });
      system.approveSupervisedPlan(isolationPlan.id);
      const isolationRun = await system.executeSupervisedPlan(isolationPlan.id);

      const summaryPlan = system.createSupervisedPlan(["health_audit", "refresh_archive_summary"], {
        title: "Stage 31 reversible-summary acceptance"
      });
      const dryRunDidNotRefresh = beforeSummaryExists
        ? JSON.stringify(stage().archiveSummary) === JSON.stringify(beforeSummary)
        : !Object.prototype.hasOwnProperty.call(stage(), "archiveSummary");
      system.approveSupervisedPlan(summaryPlan.id);
      const summaryRun = await system.executeSupervisedPlan(summaryPlan.id);
      const summaryAfterExecution = structuredClone(stage().archiveSummary);
      const rollback = await system.rollbackSupervisedRun(summaryRun.id);
      const exactSummaryRestored = beforeSummaryExists
        ? JSON.stringify(stage().archiveSummary) === JSON.stringify(beforeSummary)
        : !Object.prototype.hasOwnProperty.call(stage(), "archiveSummary");
      const snapshotsAfter = (await store.getArchiveSnapshots()).length;
      const beforeCleanupHealth = health.runHealthCheck(store.getState());

      const newPlanIds = stage().plans.map(entry => entry.id).filter(id => !baseline.initialPlanIds.includes(id));
      const newRunIds = stage().runs.map(entry => entry.id).filter(id => !baseline.initialRunIds.includes(id));
      const newAnswerIds = store.getState().metadata.stage30.history.map(entry => entry.id).filter(id => !baseline.initialHistoryIds.includes(id));
      store.update(save => {
        save.metadata.stage31.plans = save.metadata.stage31.plans.filter(entry => !newPlanIds.includes(entry.id));
        save.metadata.stage31.runs = save.metadata.stage31.runs.filter(entry => !newRunIds.includes(entry.id));
        save.metadata.stage30.history = save.metadata.stage30.history.filter(entry => !newAnswerIds.includes(entry.id));
        save.events = save.events.filter(event => !newPlanIds.includes(event.meta?.planId) && !newRunIds.includes(event.meta?.runId) && !newAnswerIds.includes(event.meta?.answerId));
      });
      const afterCleanupHealth = health.runHealthCheck(store.getState());
      return {
        blocked: { status: blocked.status, approvalRejected: blockedApprovalRejected },
        unapprovedExecutionRejected,
        isolation: {
          outcome: isolationRun.outcome,
          steps: isolationRun.steps.map(step => ({ jobId: step.jobId, outcome: step.outcome })),
          laterReadOnlyPassed: isolationRun.steps.find(step => step.jobId === "relationship_integrity")?.outcome === "passed"
        },
        summary: {
          dryRunDidNotRefresh, outcome: summaryRun.outcome, journal: summaryRun.journal.length,
          records: summaryAfterExecution.records, schema: summaryAfterExecution.schemaVersion,
          rollbackStatus: rollback.status, exactSummaryRestored
        },
        snapshotsAdded: snapshotsAfter - snapshotsBefore,
        beforeCleanupHealth,
        afterCleanupHealth,
        cleanedPlans: newPlanIds.length,
        cleanedRuns: newRunIds.length,
        cleanedAnswers: newAnswerIds.length
      };
    }, {
      initialHistoryIds: oracle.initialHistoryIds,
      initialPlanIds: oracle.initialPlanIds,
      initialRunIds: oracle.initialRunIds
    });

    const result = { oracle, oraclePage, supervisionPage, supervision, pageErrors, httpErrors };
    result.ok = oracle.schema === 42 && oracle.health.ok &&
      oracle.horror.status === "answered" && oracle.horror.intent === "records" && oracle.horror.confidence === 1 &&
      oracle.horror.count === oracle.horror.expected && oracle.horror.citationsValid &&
      oracle.episodes.status === "answered" && oracle.episodes.count === oracle.episodes.expected && oracle.episodes.citationsValid &&
      oracle.relationships.status === "answered" && oracle.relationships.citations >= 2 && oracle.relationships.hasRecord && oracle.relationships.hasEvidence &&
      oracle.recent.status === "answered" && oracle.recent.eventCitations >= 1 &&
      oracle.unsupported.status === "unsupported" && oracle.unsupported.citations === 0 && oracle.unsupported.confidence < .5 &&
      oraclePage.title === "Vault Oracle" && /record/.test(oraclePage.answer) && oracle.archiveHorror.count === oracle.archiveHorror.expected && oracle.archiveHorror.citations > 0 && oraclePage.citations === oracle.archiveHorror.citations && oraclePage.history >= 1 && oraclePage.navButton === 1 &&
      supervisionPage.title === "Supervision Deck" && supervisionPage.jobs === 4 && supervisionPage.policyCards === 4 && supervisionPage.previewButton === 1 && supervisionPage.navButton === 0 &&
      supervision.blocked.status === "blocked" && supervision.blocked.approvalRejected && supervision.unapprovedExecutionRejected &&
      supervision.isolation.outcome === "failed" && supervision.isolation.steps.length === 3 &&
      supervision.isolation.steps[0].outcome === "passed" && supervision.isolation.steps[1].outcome === "failed" && supervision.isolation.laterReadOnlyPassed &&
      supervision.summary.dryRunDidNotRefresh && supervision.summary.outcome === "passed" && supervision.summary.journal === 1 &&
      supervision.summary.records > 3000 && supervision.summary.schema === 42 && supervision.summary.rollbackStatus === "rolled_back" && supervision.summary.exactSummaryRestored &&
      supervision.snapshotsAdded >= 2 && supervision.beforeCleanupHealth.ok && supervision.afterCleanupHealth.ok &&
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
