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

    await page.goto("http://127.0.0.1:4173/index.html#/eras", {
      waitUntil: "domcontentloaded", timeout: 30000
    });
  await page.waitForFunction(() => document.querySelector("#schema-version")?.textContent === "42", null, {
      timeout: 45000
    });
    await page.waitForFunction(() => document.querySelector("#view-title")?.textContent === "Personal Eras", null, {
      timeout: 10000
    });

    const result = await page.evaluate(async () => {
      const store = await import("./js/core/store.js");
      const events = await import("./js/core/events.js");
      const eras = await import("./js/systems/eras.js");
      const echoes = await import("./js/systems/echoes.js");
      const seasonal = await import("./js/systems/seasonalMoments.js");
      const health = await import("./js/systems/health.js");

      const item = Object.values(store.getState().items).find(entry =>
        !entry.id.startsWith("tv_drive_") && entry.wing === "movies"
      );
      const collection = Object.values(store.getState().collections || {})[0];
      const syntheticIds = [
        "evt_stage25_q4_complete", "evt_stage25_q4_rate", "evt_stage25_q4_change",
        "evt_stage26_anniversary", "evt_stage26_later_change"
      ];
      store.update(save => {
        save.events = save.events.filter(event => !syntheticIds.includes(event.id));
        save.events.push(
          { id: syntheticIds[0], type: "ITEM_COMPLETED", timestamp: "2024-10-05T12:00:00.000Z", itemId: item.id, wing: item.wing, meta: { title: item.title } },
          { id: syntheticIds[1], type: "ITEM_RATED", timestamp: "2024-11-05T12:00:00.000Z", itemId: item.id, wing: item.wing, meta: { title: item.title, from: null, to: 8 } },
          { id: syntheticIds[2], type: "RATING_CHANGED", timestamp: "2024-12-05T12:00:00.000Z", itemId: item.id, wing: item.wing, meta: { title: item.title, from: 8, to: 9 } },
          { id: syntheticIds[3], type: "ITEM_COMPLETED", timestamp: "2025-07-30T12:00:00.000Z", itemId: item.id, wing: item.wing, meta: { title: item.title } },
          { id: syntheticIds[4], type: "RATING_CHANGED", timestamp: "2025-08-01T12:00:00.000Z", itemId: item.id, wing: item.wing, meta: { title: item.title, from: 9, to: 7 } }
        );
      });

      const eraReport = eras.detectPersonalEras(store.getState());
      const echoReport = echoes.buildEchoReport(store.getState(), new Date("2026-07-30T16:00:00.000Z"));
      const momentsBefore = store.getState().metadata.stage27.moments.length;
      const firstSeasonal = seasonal.triggerSeasonalMoments(new Date("2026-10-31T12:00:00"));
      const secondSeasonal = seasonal.triggerSeasonalMoments(new Date("2026-10-31T12:05:00"));
      events.emit("COLLECTION_SEALED", {
        meta: { title: collection.title, collectionId: collection.id, total: collection.itemIds.length }
      });
      events.emit("COLLECTION_SEALED", {
        meta: { title: collection.title, collectionId: collection.id, total: collection.itemIds.length }
      });
      await new Promise(resolve => setTimeout(resolve, 150));

      const state = store.getState();
      const newMoments = state.metadata.stage27.moments.slice(momentsBefore);
      const check = health.runHealthCheck(state);
      const q4 = eraReport.find(era => era.period === "2024-Q4");
      return {
        schema: state.schemaVersion,
        health: check,
        stages: [25, 26, 27].map(number => Boolean(state.metadata[`stage${number}`])),
        policies: {
          canonicalEras: state.metadata.stage25.canonicalOnly,
          minimumEvents: state.metadata.stage25.minimumEvents,
          importedDatesExcluded: state.metadata.stage26.importedDatesExcluded,
          streaksDisabled: state.metadata.stage27.streaksDisabled,
          annualDeduplication: state.metadata.stage27.annualDeduplication
        },
        era: q4 ? {
          eventCount: q4.eventCount,
          evidenceCount: q4.evidence.eventIds.length,
          firstAt: q4.evidence.firstAt,
          lastAt: q4.evidence.lastAt
        } : null,
        echoes: {
          anniversaries: echoReport.anniversaries.filter(event => event.id === syntheticIds[3]).length,
          ratingYears: echoReport.ratingYears.filter(row => [2024, 2025].includes(row.year)),
          revisit: echoReport.revisits.find(row => row.itemId === item.id)
        },
        seasonal: {
          first: firstSeasonal.length,
          second: secondSeasonal.length,
          halloweenLedger: newMoments.filter(moment => moment.key === "halloween:2026").length,
          ceremonyLedger: newMoments.filter(moment => moment.key === `collection:${collection.id}`).length,
          allEvidenceBacked: newMoments.every(moment => moment.evidence && moment.triggeredAt)
        }
      };
    });

    const expectedPages = {
      eras: "Personal Eras",
      echoes: "Archival Echoes",
      seasonal: "Seasonal Chamber"
    };
    const pages = {};
    for (const [route, expectedTitle] of Object.entries(expectedPages)) {
      await page.evaluate(value => { location.hash = `#/${value}`; }, route);
      await page.waitForFunction(title => document.querySelector("#view-title")?.textContent === title, expectedTitle, {
        timeout: 10000
      });
      pages[route] = {
        title: await page.locator("#view-title").textContent(),
        textLength: (await page.locator("#view").textContent()).length,
        navButton: await page.locator(`[data-route="${route}"]`).count()
      };
    }

    result.pages = pages;
    result.pageErrors = pageErrors;
    result.httpErrors = httpErrors;
    result.ok = result.schema === 42 && result.health.ok && result.stages.every(Boolean) &&
      result.policies.canonicalEras && result.policies.minimumEvents >= 3 &&
      result.policies.importedDatesExcluded && result.policies.streaksDisabled &&
      result.policies.annualDeduplication &&
      result.era?.eventCount >= 3 && result.era.evidenceCount >= 3 &&
      result.era.firstAt < result.era.lastAt &&
      result.echoes.anniversaries === 1 && result.echoes.ratingYears.length === 2 &&
      result.echoes.revisit?.count >= 2 &&
      result.seasonal.first === 1 && result.seasonal.second === 0 &&
      result.seasonal.halloweenLedger === 1 && result.seasonal.ceremonyLedger === 1 &&
      result.seasonal.allEvidenceBacked &&
      Object.values(pages).every(entry => entry.title && entry.textLength > 100 && entry.navButton === 1) &&
      pageErrors.length === 0 && httpErrors.length === 0;

    await page.screenshot({
      path: "D:/Vault/tests/stage27-temporal-checkpoint.png",
      fullPage: true
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
