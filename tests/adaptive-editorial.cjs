const assert = require("node:assert/strict");

(async () => {
  const memory = new Map();
  global.localStorage = {
    getItem: key => memory.get(key) || null,
    setItem: (key, value) => memory.set(key, String(value))
  };
  const { buildEditorialContext, getAdaptiveEditorial, getRecommendationReadiness } = await import("../js/systems/adaptiveEditorial.js");
  const owned = { id: "owned_show", title: "Owned Show", wing: "tv", owned: true, status: "backlog", episodes: { e1: { id: "e1", season: 1, number: 1, sourcePath: "D:\\owned.mkv", status: "backlog" } } };
  const discovery = { id: "outside_show", title: "Outside Show", wing: "tv", owned: false, status: "backlog", episodes: {} };
  const cold = { items: { owned_show: owned, outside_show: discovery }, events: [], metadata: { lifeDashboard: { preferences: {} } } };
  const coldContext = buildEditorialContext(cold);
  assert.equal(coldContext.recommendationsEnabled, false);
  assert.deepEqual(coldContext.candidates.map(item => item.id), ["owned_show"]);
  const coldEdit = getAdaptiveEditorial(cold);
  assert.equal(coldEdit.recommendationsEnabled, false);
  assert.ok(coldEdit.sections.flatMap(section => section.itemIds).every(id => cold.items[id].owned));
  assert.equal(getRecommendationReadiness(cold).enabled, false);

  const learning = structuredClone(cold);
  learning.events.push({ type: "PLAYBACK_SESSION_STARTED", itemId: "owned_show", wing: "tv", timestamp: new Date().toISOString() });
  const learningContext = buildEditorialContext(learning);
  assert.equal(learningContext.recommendationsEnabled, true);
  assert.ok(learningContext.candidates.some(item => item.id === "outside_show"));
  assert.equal(getRecommendationReadiness(learning).profileLevel, "starting");
  console.log("adaptive editorial cold-start policy: passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
