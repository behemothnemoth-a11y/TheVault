const { chromium } = require("./playwright-runtime.cjs");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const pageErrors = [];
    const httpErrors = [];
    const externalRequests = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("response", response => {
      if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`);
    });
    page.on("request", request => {
      const url = new URL(request.url());
      if (["http:", "https:"].includes(url.protocol) && url.origin !== "http://127.0.0.1:4173") externalRequests.push(request.url());
    });

    await page.goto("http://127.0.0.1:4173/index.html#/audit", {
      waitUntil: "domcontentloaded", timeout: 30000
    });
    await page.waitForFunction(() => document.querySelector("#schema-version")?.textContent === "42", null, { timeout: 45000 });
    await page.waitForFunction(() => document.querySelector("#view-title")?.textContent === "Final Audit", null, { timeout: 10000 });

    const result = await page.evaluate(async () => {
      const system = await import("./js/systems/finalAudit.js");
      const store = await import("./js/core/store.js");
      const health = await import("./js/systems/health.js");
      const snapshotsBefore = (await store.getArchiveSnapshots()).length;
      const stateBefore = store.getState();
      const recordsBefore = Object.values(stateBefore.items).filter(item => !item.id.startsWith("tv_drive_")).length;
      const episodesBefore = Object.values(stateBefore.items).flatMap(item => Object.values(item.episodes || {}));
      const countsBefore = {
        records: recordsBefore,
        episodes: episodesBefore.length,
        linkedEpisodes: episodesBefore.filter(episode => episode.sourcePath).length
      };
      const archiveContentBefore = JSON.stringify({
        items: stateBefore.items, collections: stateBefore.collections,
        relationships: stateBefore.relationships, achievements: stateBefore.achievements,
        expeditions: stateBefore.expeditions
      });
      const audit = await system.runCompleteSystemAudit({ source: "stage32_acceptance" });
      const stateAfter = store.getState();
      const episodesAfter = Object.values(stateAfter.items).flatMap(item => Object.values(item.episodes || {}));
      const countsAfter = {
        records: Object.values(stateAfter.items).filter(item => !item.id.startsWith("tv_drive_")).length,
        episodes: episodesAfter.length,
        linkedEpisodes: episodesAfter.filter(episode => episode.sourcePath).length
      };
      const archiveContentAfter = JSON.stringify({
        items: stateAfter.items, collections: stateAfter.collections,
        relationships: stateAfter.relationships, achievements: stateAfter.achievements,
        expeditions: stateAfter.expeditions
      });
      const checks = Object.fromEntries(audit.checks.map(check => [check.id, check]));
      return {
        schema: stateAfter.schemaVersion,
        audit: { id: audit.id, status: audit.status, checks: audit.checks.length, outcomes: audit.checks.map(check => check.outcome) },
        migration: checks.migration_matrix,
        corruption: checks.corruption_detection,
        restore: checks.snapshot_restore,
        performance: checks.performance_budget,
        accessibility: checks.accessibility_runtime,
        recovery: checks.export_snapshot_recovery,
        library: checks.live_tv_inventory,
        finalHealth: checks.final_health,
        countsBefore,
        countsAfter,
        archiveContentExact: archiveContentBefore === archiveContentAfter,
        snapshotsAdded: (await store.getArchiveSnapshots()).length - snapshotsBefore,
        liveHealth: health.runHealthCheck(stateAfter),
        stagePolicy: stateAfter.metadata.stage32,
        restoreProbeRemoved: !stateAfter.metadata.stage32.restoreProbe
      };
    });

    console.log("STAGE32_AUDIT_RESULT", JSON.stringify(result, null, 2));

    await page.waitForFunction(() => document.querySelector(".final-latest") && !document.querySelector("[data-run-final-audit]")?.disabled, null, { timeout: 10000 });
    const auditPage = {
      title: await page.locator("#view-title").textContent(),
      seal: (await page.locator(".final-seal").textContent()).replace(/\s+/g, " ").trim(),
      checks: await page.locator(".final-check").count(),
      passedChecks: await page.locator(".final-check.passed").count(),
      limits: await page.locator(".final-limits article").count(),
      history: await page.locator(".final-history article").count(),
      activeNav: await page.locator('[data-route="audit"][aria-current="page"]').count(),
      controlLink: await page.locator('[data-route="control"]').count(),
      auditButton: await page.locator("[data-run-final-audit]").count()
    };
    await page.locator(".skip-link").focus();
    const skipBox = await page.locator(".skip-link").boundingBox();
    const skipLink = { text: await page.locator(".skip-link").textContent(), visibleY: skipBox?.y ?? -1 };

    const routeAudits = [];
    for (const route of ["home", "tv", "oracle", "control", "supervision", "audit", "settings"]) {
      await page.evaluate(next => { location.hash = `#/${next}`; }, route);
      await page.waitForTimeout(300);
      routeAudits.push(await page.evaluate(routeName => {
        const nameFor = element => (element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent || "").trim();
        const unnamedButtons = [...document.querySelectorAll("button")].filter(button => !nameFor(button)).length;
        const unnamedInputs = [...document.querySelectorAll("input:not([type=hidden]), select, textarea")].filter(control => {
          if (control.getAttribute("aria-label") || control.getAttribute("aria-labelledby")) return false;
          if (control.id && document.querySelector(`label[for="${CSS.escape(control.id)}"]`)) return false;
          return !control.closest("label");
        }).length;
        return {
          route: routeName,
          title: document.querySelector("#view-title")?.textContent,
          unnamedButtons,
          unnamedInputs,
          primaryRoute: Boolean(document.querySelector(`[data-route="${CSS.escape(routeName)}"]`)),
          activeNav: document.querySelectorAll('.nav-button[aria-current="page"]').length,
          main: Boolean(document.querySelector("main")),
          viewContent: document.querySelector("#view")?.textContent.trim().length || 0
        };
      }, route));
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { location.hash = "#/audit"; });
    await page.waitForTimeout(400);
    const mobile = {
      scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth),
      innerWidth: await page.evaluate(() => innerWidth),
      overflowing: await page.evaluate(() => [...document.querySelectorAll("body *")].map(element => {
        const box = element.getBoundingClientRect();
        return { tag: element.tagName, className: String(element.className || "").slice(0, 80), left: Math.round(box.left), right: Math.round(box.right), width: Math.round(box.width) };
      }).filter(box => box.left < -1 || box.right > innerWidth + 1).sort((a, b) => b.right - a.right).slice(0, 12)),
      sealVisible: await page.locator(".final-seal").isVisible(),
      buttonVisible: await page.locator("[data-run-final-audit]").isVisible()
    };
    await page.screenshot({ path: "D:/Vault/tests/stage32-final-audit-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: "D:/Vault/tests/stage32-final-audit.png", fullPage: true });

    const output = { result, auditPage, skipLink, routeAudits, mobile, pageErrors, httpErrors, externalRequests };
    output.ok = result.schema === 42 && result.audit.status === "passed" && result.audit.checks === 8 && result.audit.outcomes.every(outcome => outcome === "passed") &&
      result.migration.evidence.futureRejected && result.migration.metrics.boundaries === 18 &&
      Object.values(result.corruption.evidence).every(Boolean) &&
      result.restore.evidence.probeRemoved && result.restore.evidence.beforeFingerprint === result.restore.evidence.afterFingerprint &&
      result.performance.metrics.healthMs < 2500 && result.performance.metrics.oracleFourQueriesMs < 1500 && result.performance.metrics.exportRoundTripMs < 6000 &&
      result.accessibility.evidence.unnamedButtons === 0 && result.accessibility.evidence.unnamedInputs === 0 && result.accessibility.evidence.externalStylesheets === 0 && result.accessibility.evidence.skipLink &&
      result.recovery.evidence.exportHealth && result.recovery.metrics.protectedSnapshots > 0 &&
      result.library.evidence.intentionalDvdRips === true && result.library.metrics.inventorySkipped === true &&
      result.finalHealth.outcome === "passed" && result.liveHealth.ok && result.restoreProbeRemoved &&
      JSON.stringify(result.countsBefore) === JSON.stringify(result.countsAfter) && result.archiveContentExact && result.snapshotsAdded >= 2 &&
      auditPage.title === "Final Audit" && /SYSTEM SEALED/.test(auditPage.seal) && auditPage.checks === 8 && auditPage.passedChecks === 8 && auditPage.limits === 6 && auditPage.history >= 1 && auditPage.activeNav === 0 && auditPage.controlLink === 1 && auditPage.auditButton === 1 &&
      skipLink.text.trim() === "Skip to archive content" && skipLink.visibleY >= 0 &&
      routeAudits.every(route => route.title && route.unnamedButtons === 0 && route.unnamedInputs === 0 && route.activeNav === (route.primaryRoute ? 1 : 0) && route.main && route.viewContent > 0) &&
      mobile.scrollWidth <= mobile.innerWidth && mobile.sealVisible && mobile.buttonVisible &&
      pageErrors.length === 0 && httpErrors.length === 0 && externalRequests.length === 0;

    console.log(JSON.stringify(output, null, 2));
    if (!output.ok) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
