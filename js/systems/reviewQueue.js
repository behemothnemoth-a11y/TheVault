import { getState, update } from "../core/store.js";

const QUEUE_URL = new URL("../../data/stage1-review-queue.json", import.meta.url);

function queueState() {
  return getState().metadata.reviewQueue || { schemaVersion: 1, items: [] };
}

export async function hydrateReviewQueue() {
  const response = await fetch(QUEUE_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Review queue returned ${response.status}.`);
  const source = await response.json();
  const existing = new Map((queueState().items || []).map(item => [item.id, item]));
  update(save => {
    const merged = source.items.map(item => {
      const previous = existing.get(item.id);
      return previous
        ? { ...item, status: previous.status, decision: previous.decision }
        : item;
    });
    save.metadata.reviewQueue = {
      schemaVersion: source.schemaVersion,
      sourceGeneratedAt: source.generatedAt,
      updatedAt: new Date().toISOString(),
      summary: source.summary,
      items: merged
    };
  });
  return getReviewQueue();
}

export function getReviewQueue() {
  return queueState().items || [];
}

export function getReviewQueueStats() {
  const items = getReviewQueue();
  const pending = items.filter(item => item.status === "pending");
  return {
    total: items.length,
    pending: pending.length,
    resolved: items.filter(item => item.status === "resolved").length,
    rejected: items.filter(item => item.status === "rejected").length,
    deferred: items.filter(item => item.status === "deferred").length,
    semanticConflicts: pending.filter(item => item.kind === "semantic_conflict").length,
    scannerOnlyEpisodes: pending.filter(item => item.kind === "scanner_only_episode").length,
    fileGroups: pending.filter(item => item.kind === "file_group").length,
    representedFiles: pending
      .filter(item => item.kind === "file_group")
      .reduce((total, item) => total + Number(item.payload?.count || 0), 0)
  };
}

function findEpisode(save, item) {
  const show = save.items[item.payload.showId];
  if (!show) throw new Error("The review item references a missing series.");
  const episode = Object.values(show.episodes || {}).find(candidate =>
    Number(candidate.season) === Number(item.payload.season) &&
    Number(candidate.number) === Number(item.payload.episode)
  );
  if (!episode) throw new Error("The review item references a missing episode.");
  return episode;
}

export function resolveReviewItem(id, action) {
  update(save => {
    const queue = save.metadata.reviewQueue;
    const item = queue.items.find(candidate => candidate.id === id);
    if (!item) throw new Error("Review item was not found.");
    if (item.status !== "pending" && action !== "reopen") throw new Error("This review item has already been decided.");

    if (action === "keep_original") {
      if (item.kind !== "semantic_conflict") throw new Error("Keep original is not valid for this item.");
      item.status = "resolved";
    } else if (action === "use_scanner") {
      if (item.kind !== "semantic_conflict") throw new Error("Use scanner is not valid for this item.");
      const episode = findEpisode(save, item);
      if (episode.sourcePath && episode.sourcePath !== item.payload.scannerPath) {
        episode.alternateSourcePaths = [...new Set([...(episode.alternateSourcePaths || []), episode.sourcePath])];
      }
      episode.sourcePath = item.payload.scannerPath;
      item.status = "resolved";
    } else if (action === "link_scanner") {
      if (item.kind !== "scanner_only_episode") throw new Error("Link scanner is not valid for this item.");
      const episode = findEpisode(save, item);
      if (episode.sourcePath && episode.sourcePath !== item.payload.scannerPath) {
        throw new Error("This episode already has a file. Review it as a conflict instead.");
      }
      episode.sourcePath = item.payload.scannerPath;
      item.status = "resolved";
    } else if (action === "reject") {
      item.status = "rejected";
    } else if (action === "defer") {
      item.status = "deferred";
    } else if (action === "reopen") {
      item.status = "pending";
    } else {
      throw new Error(`Unknown review action: ${action}`);
    }

    item.decision = {
      action,
      decidedAt: new Date().toISOString()
    };
    queue.updatedAt = item.decision.decidedAt;
  });
}
