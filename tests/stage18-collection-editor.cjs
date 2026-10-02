const { chromium } = require("./playwright-runtime.cjs");

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
  try {
    const page = await browser.newPage();
    const pageErrors = [], httpErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("response", response => { if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`); });
    await page.goto("http://127.0.0.1:4173/index.html#/collection-editor", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => document.querySelector("#schema-version")?.textContent === "42", null, { timeout: 45000 });
    await page.waitForFunction(() => document.querySelector("#view-title")?.textContent === "Collection Editor", null, { timeout: 10000 });
    const result = await page.evaluate(async () => {
      const editor = await import("./js/systems/collectionEditor.js");
      const store = await import("./js/core/store.js");
      const health = await import("./js/systems/health.js");
      const items = Object.values(store.getState().items).filter(item => !item.id.startsWith("tv_drive_")).slice(0, 2);
      const id = await editor.createCustomCollection({ title: "Stage 18 Test Shelf", description: "Protected acceptance", notes: "Keep order." });
      await editor.toggleCollectionMember(id, items[0].id);
      await editor.toggleCollectionMember(id, items[1].id);
      await editor.moveCollectionMember(id, items[1].id, -1);
      await editor.editCustomCollection(id, { title: "Stage 18 Ordered Shelf", notes: "Edited safely." });
      await editor.archiveCustomCollection(id);
      const archiveChange = [...store.getState().metadata.stage18.changeLog].reverse().find(change => change.label === "archive collection");
      await editor.undoCollectionChange(archiveChange.id);
      editor.renderCollectionEditor();
      const state = store.getState();
      const collection = state.collections[id];
      const check = health.runHealthCheck(state);
      return {
        schema: state.schemaVersion,
        health: check,
        collection: {
          id: collection.id, title: collection.title, status: collection.status,
          itemIds: collection.itemIds, notes: collection.notes
        },
        expectedOrder: [items[1].id, items[0].id],
        changes: state.metadata.stage18.changeLog.map(change => ({ label: change.label, status: change.status })),
        page: {
          title: document.querySelector("#view-title")?.textContent,
          code: document.querySelector("#view-code")?.textContent,
          ledger: document.querySelectorAll(".ops-ledger").length,
          editorVisible: Boolean(document.querySelector(".collection-workspace"))
        }
      };
    });
    result.pageErrors = pageErrors; result.httpErrors = httpErrors;
    result.ok = result.schema === 42 && result.health.ok &&
      result.collection.title === "Stage 18 Ordered Shelf" && result.collection.status === "open" &&
      JSON.stringify(result.collection.itemIds) === JSON.stringify(result.expectedOrder) &&
      result.changes.length === 6 && result.changes.at(-1).status === "undone" &&
      result.page.title === "Collection Editor" && result.page.code === "VAULT://COLLECTION_EDITOR" &&
      result.page.editorVisible && pageErrors.length === 0 && httpErrors.length === 0;
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
