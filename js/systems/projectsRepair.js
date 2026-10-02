import { createArchiveSnapshot, flushPersistence, getState, update } from "../core/store.js";

// One-time move: the personal making-projects that were filed in Games because that
// is where they happened to arrive. Game building — Minecraft worlds, farms, the
// version migration — stays in the Games Workshop; woodwork, props, drawing, pixel
// art and restorations move to their own room.
const FLAG = "projectsRoom20260912";

// Matched on the legacy id prefix rather than on titles, which the reader can rename.
const MAKING_PREFIX = "game_legacy_g_make_something_";

export async function runProjectsMove() {
  if (getState().metadata?.maintenance?.[FLAG]) return null;
  const candidates = Object.values(getState().items || {})
    .filter(item => item.wing === "games" && String(item.id).startsWith(MAKING_PREFIX));
  // Nothing to move: write nothing. An update() here would notify every subscriber
  // and redraw the open wing for no reason, and the check itself is one cheap filter.
  if (!candidates.length) return null;

  await createArchiveSnapshot("Before moving personal projects out of Games");
  const moved = [];
  update(save => {
    for (const candidate of candidates) {
      const record = save.items[candidate.id];
      if (!record) continue;
      const previous = record.gameMeta || {};
      record.wing = "projects";
      record.type = "project";
      record.projectMeta = {
        status: "idea",
        medium: "",
        notes: previous.notes || record.description || "",
        startedAt: "",
        finishedAt: "",
        movedFrom: "games",
        movedAt: new Date().toISOString()
      };
      delete record.gameMeta;
      moved.push(record.title);
    }
    save.metadata.maintenance ||= {};
    save.metadata.maintenance[FLAG] = {
      completedAt: new Date().toISOString(),
      moved: moved.length,
      titles: moved,
      note: "personal making-projects moved out of Games; Minecraft building stayed in the Workshop"
    };
  });
  await flushPersistence();
  return { moved: moved.length, titles: moved };
}
