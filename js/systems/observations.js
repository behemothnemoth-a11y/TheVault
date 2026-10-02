import { getState } from "../core/store.js";

function daysSince(value, now) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? Math.max(0, Math.floor((now - time) / 86400000)) : null;
}

function percent(item) {
  const completed = Number(item.progress?.completed || 0);
  const total = Number(item.progress?.total || 0);
  return total > 0 ? Math.round(completed / total * 100) : 0;
}

export function getObservationReport(candidate = getState(), now = new Date()) {
  const items = Object.values(candidate.items || {}).filter(item => !item.id.startsWith("tv_drive_"));
  const signals = [];
  const add = (id, rarity, message, evidence) => signals.push({ id, rarity, message, evidence });

  const oldest = items.filter(item => item.status !== "completed" && item.addedAt)
    .map(item => ({ item, days: daysSince(item.addedAt, now) }))
    .filter(entry => entry.days != null)
    .sort((a, b) => b.days - a.days)[0];
  if (oldest?.days >= 365) add("ancient_backlog", oldest.days >= 1825 ? "rare" : "common",
    `${oldest.item.title} has been waiting in the archive for ${oldest.days.toLocaleString()} days.`,
    { itemId: oldest.item.id, addedAt: oldest.item.addedAt, days: oldest.days });

  const nearlyDone = items.filter(item => item.status !== "completed" && percent(item) >= 70)
    .sort((a, b) => percent(b) - percent(a))[0];
  if (nearlyDone) add("nearly_done", "common",
    `${nearlyDone.title} is ${percent(nearlyDone)}% complete. The exit is visible.`,
    { itemId: nearlyDone.id, completed: nearlyDone.progress.completed, total: nearlyDone.progress.total });

  const unresolved = candidate.metadata?.reviewQueue?.items?.filter(entry => entry.status === "pending").length || 0;
  if (unresolved) add("review_queue", "common",
    `${unresolved.toLocaleString()} recovered records are still waiting for a human decision.`,
    { pendingReviewItems: unresolved });

  const sentinel = candidate.metadata?.stage4?.lastReport;
  if (sentinel?.missingCount) add("missing_links", "common",
    `${sentinel.missingCount} episode links point into empty space. The Sentinel is keeping watch.`,
    { scanAt: sentinel.scannedAt, missingLinks: sentinel.missingCount, linkedPresent: sentinel.linkedPresent });
  else if (sentinel?.linkedPresent) add("sentinel_clear", "uncommon",
    `${sentinel.linkedPresent.toLocaleString()} linked episode files answered the last roll call.`,
    { scanAt: sentinel.scannedAt, linkedPresent: sentinel.linkedPresent });

  const proposals = candidate.metadata?.stage5?.summary;
  if (proposals?.highConfidence) add("repair_candidates", "common",
    `${proposals.highConfidence} high-confidence archive repairs are waiting in the Repair Bay. None will move without you.`,
    { generatedAt: candidate.metadata.stage5.generatedAt, highConfidence: proposals.highConfidence });

  const wingCounts = new Map();
  items.forEach(item => wingCounts.set(item.wing, (wingCounts.get(item.wing) || 0) + 1));
  const largestWing = [...wingCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (largestWing) add("largest_wing", "uncommon",
    `${largestWing[1].toLocaleString()} records now occupy the ${largestWing[0].toUpperCase()} wing.`,
    { wing: largestWing[0], records: largestWing[1] });

  const rated = items.filter(item => Number(item.rating) >= 1);
  if (rated.length >= 5) {
    const average = rated.reduce((sum, item) => sum + Number(item.rating), 0) / rated.length;
    add("rating_average", "uncommon",
      `Your recorded archive average is ${average.toFixed(1)} across ${rated.length.toLocaleString()} rated items.`,
      { ratedItems: rated.length, average: Number(average.toFixed(2)) });
  }

  if (!signals.length) add("quiet_archive", "rare",
    "THE ARCHIVE HAS BEEN QUIET. It is listening, though.",
    { itemCount: items.length, eventCount: candidate.events?.length || 0 });
  return signals;
}

export function selectObservation(candidate = getState(), now = new Date()) {
  const signals = getObservationReport(candidate, now);
  const day = now.toISOString().slice(0, 10);
  let hash = 2166136261;
  for (const character of `${day}|${candidate.schemaVersion}|${signals.map(entry => entry.id).join("|")}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return signals[(hash >>> 0) % signals.length];
}

export function getObservation() {
  return selectObservation().message;
}
