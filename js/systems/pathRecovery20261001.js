import { createArchiveSnapshot, flushPersistence, getState, update } from "../core/store.js";

const PLAN_URL = "./data/repair/path-recovery-20261001.json";
const FLAG = "pathRecovery20261001";
const lower = value => String(value || "").toLowerCase();

export async function runPathRecovery() {
  if (getState().metadata?.maintenance?.[FLAG]) return null;

  let plan;
  try {
    const response = await fetch(PLAN_URL, { cache: "no-store" });
    if (!response.ok) return null;
    plan = await response.json();
  } catch {
    return null;
  }
  if (plan?.version !== 1 || !Array.isArray(plan.entries)) return null;

  await createArchiveSnapshot("Protected backup before D: path recovery", {
    kind: "path_recovery",
    protected: true
  });

  const replacements = new Map(
    plan.entries.map(entry => [lower(entry.oldPath), entry.newPath])
  );  const summary = {
    plannedPaths: plan.entries.length,
    plannedReferences: Number(plan.summary?.repairableReferences || 0),
    referencesUpdated: 0,
    itemsTouched: 0,
    ambiguousLeft: Number(plan.summary?.ambiguousReferences || 0),
    unmatchedLeft: Number(plan.summary?.unmatchedReferences || 0),
    byField: {}
  };
  const touched = new Set();

  update(save => {
    const replace = (value, field, itemId) => {
      if (!value) return value;
      const next = replacements.get(lower(value));
      if (!next || next === value) return value;
      summary.referencesUpdated += 1;
      summary.byField[field] = (summary.byField[field] || 0) + 1;
      if (itemId) touched.add(itemId);
      return next;
    };

    for (const item of Object.values(save.items || {})) {
      const id = item.id;
      const beforeSource = item.sourcePath;
      item.sourcePath = replace(item.sourcePath, "sourcePath", id);
      if (beforeSource !== item.sourcePath && item.fileMissing) delete item.fileMissing;

      if (Array.isArray(item.sourcePaths)) {
        item.sourcePaths = [...new Set(item.sourcePaths.map(path =>
          replace(path, "sourcePaths", id)
        ))];
      }      if (item.bookMeta) {
        item.bookMeta.sourcePath = replace(item.bookMeta.sourcePath, "bookMeta.sourcePath", id);
        for (const local of item.bookMeta.localFiles || []) {
          local.path = replace(local.path, "bookMeta.localFiles", id);
        }
      }

      if (item.comicMeta) {
        item.comicMeta.sourcePath = replace(item.comicMeta.sourcePath, "comicMeta.sourcePath", id);
        for (const volume of item.comicMeta.volumes || []) {
          volume.sourcePath = replace(volume.sourcePath, "comicMeta.volumes", id);
        }
      }

      for (const episode of Object.values(item.episodes || {})) {
        const beforeSourcePath = episode.sourcePath;
        const beforeFilePath = episode.filePath;
        episode.sourcePath = replace(episode.sourcePath, "episode.sourcePath", id);
        episode.filePath = replace(episode.filePath, "episode.filePath", id);
        if (beforeSourcePath !== episode.sourcePath || beforeFilePath !== episode.filePath) {
          episode.linkStatus = "linked";
        }
      }
    }

    summary.itemsTouched = touched.size;
    save.metadata.maintenance ||= {};
    save.metadata.maintenance[FLAG] = {
      completedAt: new Date().toISOString(),
      planVersion: plan.version,
      source: plan.source,
      ...summary
    };
  });  await flushPersistence();
  return summary;
}
