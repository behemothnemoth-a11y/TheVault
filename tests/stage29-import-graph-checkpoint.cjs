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

    await page.goto("http://127.0.0.1:4173/index.html#/imports", {
      waitUntil: "domcontentloaded", timeout: 30000
    });
    await page.waitForFunction(() => document.querySelector("#schema-version")?.textContent === "42", null, {
      timeout: 45000
    });
    await page.waitForFunction(() => document.querySelector("#view-title")?.textContent === "Import Station", null, {
      timeout: 10000
    });

    const phaseOne = await page.evaluate(async () => {
      const station = await import("./js/systems/importStation.js");
      const graph = await import("./js/systems/relationshipGraph.js");
      const store = await import("./js/core/store.js");
      const health = await import("./js/systems/health.js");

      const initial = store.getState();
      const initialCounts = {
        items: Object.keys(initial.items).length,
        relationships: Object.keys(initial.relationships || {}).length,
        snapshots: (await store.getArchiveSnapshots()).length
      };
      const existing = Object.values(initial.items).find(item => item.wing === "youtube");
      const youtubeRows = [
        { title: `Watched ${existing.title}`, titleUrl: "https://youtube.example/conflict", subtitles: [{ name: "Existing Channel" }], time: "2026-01-01T12:00:00Z" },
        { title: "Watched Stage 28 Signal Video", titleUrl: "https://youtube.example/stage28-signal", subtitles: [{ name: "Checkpoint Channel" }], time: "2026-06-01T10:00:00Z" },
        { title: "Watched Stage 28 Signal Video", titleUrl: "https://youtube.example/stage28-signal", subtitles: [{ name: "Checkpoint Channel" }], time: "2026-06-02T10:00:00Z" },
        { title: "Watched Stage 28 Second Video", videoId: "stage28-second", channel: "Checkpoint Channel", time: "2026-06-03T10:00:00Z" }
      ];
      const plan = station.inspectImportText(JSON.stringify(youtubeRows), {
        source: "auto", fileName: "youtube-watch-history.json"
      });

      const adapterSamples = {
        youtube: station.inspectImportText(JSON.stringify([{ title: "Watched Adapter YouTube", videoId: "adapter-youtube", channel: "Adapter Creator" }]), { source: "youtube", fileName: "youtube.json" }),
        music: station.inspectImportText("trackName,artistName,playedAt,uri\nAdapter Song,Adapter Artist,2026-01-01T00:00:00Z,track:adapter", { source: "music", fileName: "music.csv" }),
        podcasts: station.inspectImportText(JSON.stringify([{ episodeTitle: "Adapter Episode", podcastName: "Adapter Show", guid: "adapter-podcast" }]), { source: "podcasts", fileName: "podcasts.json" }),
        books: station.inspectImportText("title\tauthor\tstatus\tisbn\nAdapter Book\tAdapter Author\tcompleted\tadapter-book", { source: "books", fileName: "books.tsv" }),
        manga: station.inspectImportText(JSON.stringify([{ title: "Adapter Manga", author: "Adapter Mangaka", id: "adapter-manga", status: "reading" }]), { source: "manga", fileName: "manga.json" }),
        food: station.inspectImportText(JSON.stringify([{ dish: "Adapter Meal", restaurant: "Adapter Kitchen", id: "adapter-food" }]), { source: "food", fileName: "food.json" }),
        trips: station.inspectImportText(JSON.stringify([{ trip: "Adapter Journey", destination: "Adapter Place", id: "adapter-trip", visitedAt: "2026-02-01" }]), { source: "trips", fileName: "trips.json" }),
        calendar: station.inspectImportText("BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:adapter-calendar\nDTSTART:20260301T120000Z\nSUMMARY:Adapter Calendar Event\nLOCATION:Adapter Hall\nEND:VEVENT\nEND:VCALENDAR", { source: "auto", fileName: "calendar.ics" })
      };

      const batchId = await station.applyImportPlan(plan);
      let duplicateRejected = false;
      try { await station.applyImportPlan(plan); } catch (error) { duplicateRejected = /already/.test(error.message); }
      const afterImport = store.getState();
      const batch = afterImport.metadata.stage28.batches.find(entry => entry.id === batchId);
      const importedItem = afterImport.items[batch.itemIds[0]];
      const importedConnections = graph.connectionsForNode("item", importedItem.id, afterImport);
      const creatorNodes = graph.getGraphNodes(afterImport, { query: "Checkpoint Channel", type: "person" });
      const manualId = await graph.createManualRelationship({
        fromItemId: importedItem.id,
        toType: "franchise",
        toLabel: "Stage 29 Test Continuity",
        kind: "part_of",
        evidenceNote: "Filed by the schema 29 acceptance drill."
      });
      const importedChangeId = store.getState().metadata.stage29.changeLog.at(-1).id;
      const stableItem = Object.values(store.getState().items).find(item => item.wing === "movies");
      const independentManualId = await graph.createManualRelationship({
        fromItemId: stableItem.id,
        toType: "place",
        toLabel: "Stage 29 Undo Room",
        kind: "located_at",
        evidenceNote: "Temporary independent relationship used to verify protected undo."
      });
      const state = store.getState();
      const independentChangeId = state.metadata.stage29.changeLog.at(-1).id;
      const check = health.runHealthCheck(state);
      return {
        schema: state.schemaVersion,
        initialCounts,
        plan: {
          source: plan.source, rows: plan.rowCount, creatable: plan.creatable,
          skipped: plan.skipped, duplicates: plan.duplicates, rawRetained: plan.rawRetained
        },
        adapters: Object.fromEntries(Object.entries(adapterSamples).map(([id, sample]) => [id, {
          source: sample.source, creatable: sample.creatable, format: sample.format, errors: sample.errors.length
        }])),
        batch: {
          id: batchId, status: batch.status, items: batch.itemIds.length,
          relationships: batch.relationshipIds.length, rawRetained: batch.rawRetained,
          protected: batch.snapshotProtected, eventId: batch.eventId
        },
        duplicateRejected,
        importedItem: { id: importedItem.id, title: importedItem.title, rawRetained: importedItem.import.rawRetained },
        graph: {
          connections: importedConnections.length,
          hasCreator: importedConnections.some(connection => connection.to.label === "Checkpoint Channel" && connection.evidence?.batchId === batchId),
          creatorNodes: creatorNodes.length,
          manualId,
          manualFiled: Boolean(state.relationships[manualId]),
          importedChangeId,
          independentManualId,
          independentFiled: Boolean(state.relationships[independentManualId]),
          independentChangeId,
          explicit: Object.keys(state.relationships).length
        },
        snapshotsAfterProtectedChanges: (await store.getArchiveSnapshots()).length,
        health: check
      };
    });

    await page.evaluate(() => { location.hash = "#/relationships"; });
    await page.waitForFunction(() => document.querySelector("#view-title")?.textContent === "Relationship Atlas", null, {
      timeout: 10000
    });
    await page.locator("[data-graph-search]").fill("Stage 28 Signal Video");
    await page.waitForTimeout(150);
    const itemNode = page.locator("[data-graph-node]").first();
    await itemNode.click();
    await page.waitForTimeout(150);
    const atlasPage = {
      title: await page.locator("#view-title").textContent(),
      nodes: await page.locator("[data-graph-node]").count(),
      edges: await page.locator(".graph-edge").count(),
      evidencePanels: await page.locator(".graph-edge details").count(),
      editorVisible: await page.locator("[data-create-relationship]").count(),
      navButton: await page.locator('[data-route="relationships"]').count()
    };
    await page.screenshot({ path: "D:/Vault/tests/stage29-relationship-atlas.png", fullPage: true });

    const phaseTwo = await page.evaluate(async ({ batchId, importedChangeId, independentChangeId, initialCounts }) => {
      const station = await import("./js/systems/importStation.js");
      const graph = await import("./js/systems/relationshipGraph.js");
      const store = await import("./js/core/store.js");
      const health = await import("./js/systems/health.js");
      await graph.undoRelationshipChange(independentChangeId);
      const rollback = await station.rollbackImportBatch(batchId);
      const state = store.getState();
      const batch = state.metadata.stage28.batches.find(entry => entry.id === batchId);
      return {
        rollback,
        batchStatus: batch.status,
        manualUndoneByRollback: state.metadata.stage29.changeLog.find(entry => entry.id === importedChangeId)?.status,
        independentUndo: state.metadata.stage29.changeLog.find(entry => entry.id === independentChangeId)?.status,
        exactCountsRestored: Object.keys(state.items).length === initialCounts.items && Object.keys(state.relationships).length === initialCounts.relationships,
        snapshots: (await store.getArchiveSnapshots()).length,
        health: health.runHealthCheck(state)
      };
    }, { batchId: phaseOne.batch.id, importedChangeId: phaseOne.graph.importedChangeId, independentChangeId: phaseOne.graph.independentChangeId, initialCounts: phaseOne.initialCounts });

    await page.evaluate(() => { location.hash = "#/imports"; });
    await page.waitForFunction(() => document.querySelector("#view-title")?.textContent === "Import Station", null, {
      timeout: 10000
    });
    await page.locator("[data-import-file]").setInputFiles({
      name: "spotify-streaming-history.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify([{
        master_metadata_track_name: "Spotify Checkpoint Track",
        master_metadata_album_artist_name: "Spotify Checkpoint Artist",
        master_metadata_album_album_name: "Checkpoint Album",
        spotify_track_uri: "spotify:track:checkpoint-stage29",
        ts: "2026-07-01T12:00:00Z",
        ms_played: 220000
      }]))
    });
    await page.waitForFunction(() => document.querySelector(".import-records")?.textContent.includes("Spotify Checkpoint Track"), null, {
      timeout: 10000
    });
    const importPage = {
      title: await page.locator("#view-title").textContent(),
      adapters: await page.locator(".adapter-card").count(),
      rolledBackLedger: await page.locator(".ops-ledger").filter({ hasText: "ROLLED_BACK" }).count(),
      spotifyPreview: await page.locator(".import-records article.create").count(),
      previewButton: await page.locator("[data-apply-import]").textContent(),
      navButton: await page.locator('[data-route="imports"]').count()
    };

    const result = { phaseOne, phaseTwo, pages: { imports: importPage, atlas: atlasPage }, pageErrors, httpErrors };
    result.ok = phaseOne.schema === 42 && phaseOne.health.ok &&
      phaseOne.plan.source === "youtube" && phaseOne.plan.rows === 4 &&
      phaseOne.plan.creatable === 2 && phaseOne.plan.skipped === 1 && phaseOne.plan.duplicates === 1 && phaseOne.plan.rawRetained === false &&
      Object.entries(phaseOne.adapters).every(([id, adapter]) => adapter.source === id && adapter.creatable === 1 && adapter.errors === 0) &&
      new Set(Object.values(phaseOne.adapters).map(adapter => adapter.format)).size >= 4 &&
      phaseOne.batch.status === "applied" && phaseOne.batch.items === 2 && phaseOne.batch.relationships === 2 &&
      phaseOne.batch.rawRetained === false && phaseOne.batch.protected && phaseOne.batch.eventId && phaseOne.duplicateRejected &&
      phaseOne.importedItem.rawRetained === false && phaseOne.graph.hasCreator && phaseOne.graph.creatorNodes === 1 &&
      phaseOne.graph.manualFiled && phaseOne.graph.independentFiled && phaseOne.snapshotsAfterProtectedChanges >= phaseOne.initialCounts.snapshots + 3 &&
      atlasPage.title === "Relationship Atlas" && atlasPage.nodes >= 1 && atlasPage.edges >= 3 && atlasPage.evidencePanels === atlasPage.edges && atlasPage.editorVisible === 1 && atlasPage.navButton === 1 &&
      phaseTwo.rollback.removedItems === 2 && phaseTwo.rollback.removedRelationships === 3 &&
      phaseTwo.batchStatus === "rolled_back" && phaseTwo.manualUndoneByRollback === "undone" && phaseTwo.independentUndo === "undone" && phaseTwo.exactCountsRestored && phaseTwo.health.ok &&
      phaseTwo.snapshots >= phaseOne.initialCounts.snapshots + 5 &&
      importPage.title === "Import Station" && importPage.adapters === 8 && importPage.rolledBackLedger === 1 && importPage.spotifyPreview === 1 && /IMPORT 1 NEW RECORDS/.test(importPage.previewButton) && importPage.navButton === 1 &&
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
