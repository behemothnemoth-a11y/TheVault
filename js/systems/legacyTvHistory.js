import { emit } from "../core/events.js";
import { getState, update } from "../core/store.js";

const HISTORY_URL = new URL("../../recovery/vault-v1-tv-history-2026-08-13.json", import.meta.url);
const EXPECTED_BUNDLE_SHA256 = "04C9DD47310C00B2103313F37CC3E22AB9E28868AD6D1B87232BD6B07D300EBC";

const hex = buffer => [...new Uint8Array(buffer)].map(value => value.toString(16).padStart(2, "0")).join("").toUpperCase();
const showIdFor = slug => `tv_legacy_${String(slug).replaceAll("-", "_")}`;
const episodeFor = (show, season, number) => Object.values(show?.episodes || {}).find(episode => Number(episode.season) === Number(season) && Number(episode.number) === Number(number));

export async function importBundledLegacyTvHistory() {
  const existing = getState().metadata?.legacyTvHistory;
  if (existing?.bundleSha256 === EXPECTED_BUNDLE_SHA256) return existing.report;
  const response = await fetch(HISTORY_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Original TV history returned ${response.status}.`);
  const bytes = await response.arrayBuffer();
  const bundleSha256 = hex(await crypto.subtle.digest("SHA-256", bytes));
  if (bundleSha256 !== EXPECTED_BUNDLE_SHA256) throw new Error("Original TV history checksum did not match.");
  const history = JSON.parse(new TextDecoder().decode(bytes));
  if (history.format !== "vault-v1-tv-history" || history.version !== 1) throw new Error("Original TV history format is unsupported.");

  const latestPositive = new Map();
  for (const entry of history.log || []) {
    if (entry.v === true && Number.isFinite(Number(entry.t))) latestPositive.set(entry.k, new Date(Number(entry.t)).toISOString());
  }
  const report = {
    requested: Object.keys(history.checks || {}).length,
    matched: 0,
    newlyWatched: 0,
    alreadyWatched: 0,
    unmatchedShows: 0,
    unmatchedEpisodes: 0,
    notesImported: 0,
    notesPreserved: 0,
    legacyRatingsFlagged: 0,
    affectedSeries: 0
  };
  const affected = new Set(), importedAt = new Date().toISOString();
  update(save => {
    for (const [key, checked] of Object.entries(history.checks || {})) {
      if (checked !== true) continue;
      const [kind, slug, season, number] = key.split("|");
      if (kind !== "e") continue;
      const show = save.items[showIdFor(slug)];
      if (!show) { report.unmatchedShows++; continue; }
      const episode = episodeFor(show, season, number);
      if (!episode) { report.unmatchedEpisodes++; continue; }
      report.matched++; affected.add(show.id);
      if (episode.status === "completed") report.alreadyWatched++;
      else {
        episode.status = "completed";
        episode.completedAt = latestPositive.get(key) || history.sourceModifiedAt || importedAt;
        episode.completionDateApproximate = !latestPositive.has(key);
        episode.historySource = "original_vault_v1";
        report.newlyWatched++;
      }
    }
    for (const [key, legacy] of Object.entries(history.notes || {})) {
      const [kind, slug, season, number] = key.split("|");
      if (kind !== "e") continue;
      const show = save.items[showIdFor(slug)], episode = episodeFor(show, season, number);
      if (!episode) continue;
      const note = String(legacy.n || "").trim(), rating = Number(legacy.r || 0);
      if (note) {
        if (String(episode.note || "").trim()) report.notesPreserved++;
        else { episode.note = note; report.notesImported++; }
      }
      if (rating > 0) {
        episode.legacyFiveDiamondRating = rating;
        episode.ratingNeedsReview = true;
        report.legacyRatingsFlagged++;
      }
    }
    for (const showId of affected) {
      const show = save.items[showId], episodes = Object.values(show.episodes || {});
      const completed = episodes.filter(episode => episode.status === "completed").length;
      show.progress = { completed, total: episodes.length };
      show.status = completed === episodes.length && completed ? "completed" : completed ? "in_progress" : "backlog";
    }
    report.affectedSeries = affected.size;
    save.metadata.legacyTvHistory = {
      version: 1,
      importedAt,
      sourceName: history.sourceName,
      sourceSha256: history.sourceSha256,
      bundleSha256,
      mergePolicy: "positive_only_preserve_newer",
      report
    };
  });
  emit("LEGACY_TV_HISTORY_IMPORTED", { wing: "tv", meta: { title: `${report.matched} original watched episodes recovered`, ...report } });
  return report;
}
