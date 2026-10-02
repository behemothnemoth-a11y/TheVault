import { createArchiveSnapshot, flushPersistence, getState, update } from "../core/store.js";

// One-time library repair from a deterministic local scan of D: (no AI classification).
// Links files the archive already owned but never connected, adds shows that exist on
// disk, removes scan-created duplicates recoverably, and restores the movie watchlist.
const PLAN_URL = "./data/repair/library-repair-plan.json";
const FLAG = "libraryRepair20260911";

const norm = value => String(value ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\b(?:the|a|an)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
const episodeId = (showId, season, number) => `${showId}_s${String(season).padStart(2, "0")}e${String(number).padStart(2, "0")}`;

function refreshProgress(show) {
  const episodes = Object.values(show.episodes || {});
  const done = episodes.filter(episode => episode.status === "completed").length;
  show.progress = { completed: done, total: episodes.length };
  if (show.status === "planned") return;
  show.status = done === episodes.length && done ? "completed" : done || episodes.some(episode => episode.status === "in_progress") ? "in_progress" : "backlog";
}

function linkEpisode(show, season, number, path) {
  show.episodes ||= {};
  let episode = Object.values(show.episodes).find(entry => Number(entry.season) === Number(season) && Number(entry.number) === Number(number));
  if (!episode) {
    // The store's draft copies any object assigned into it, so read the stored
    // copy back before mutating it; the assigned literal is not the live record.
    const id = episodeId(show.id, season, number);
    show.episodes[id] = { id, season: Number(season), number: Number(number), status: "backlog", rating: null, note: "", rewatches: 0 };
    episode = show.episodes[id];
  }
  if (episode.sourcePath) return false;
  episode.sourcePath = path;
  show.sourcePaths = [...new Set([...(show.sourcePaths || []), path])];
  return true;
}

function removeCard(save, id, reason) {
  const item = save.items[id];
  if (!item) return false;
  save.metadata.removedCards ||= [];
  save.metadata.removedCards = save.metadata.removedCards.filter(entry => entry.id !== id);
  save.metadata.removedCards.push({ id, item: JSON.parse(JSON.stringify(item)), title: item.title || "Untitled card", wing: item.wing || "unknown", removedAt: new Date().toISOString(), reason });
  delete save.items[id];
  const daily = save.preferences?.dailyDriver;
  if (daily) {
    daily.hiddenCards = (daily.hiddenCards || []).filter(entry => entry !== id);
    daily.dismissedRecommendations = (daily.dismissedRecommendations || []).filter(entry => entry !== id);
  }
  if (Array.isArray(save.metadata.artworkApprovals)) save.metadata.artworkApprovals = save.metadata.artworkApprovals.filter(entry => entry.itemId !== id);
  return true;
}

export async function runLibraryRepair() {
  if (getState().metadata?.maintenance?.[FLAG]) return null;
  let plan = null;
  try {
    const response = await fetch(PLAN_URL, { cache: "no-store" });
    if (!response.ok) return null;
    plan = await response.json();
  } catch { return null; }
  if (!plan?.tv || !plan?.movies) return null;

  await createArchiveSnapshot("Protected backup before local library repair", { kind: "library_repair", protected: true });
  const summary = { linkedFiles: 0, showsAdded: 0, episodesAdded: 0, seriesRemoved: 0, moviesRestored: 0, shelvesRestored: 0, junkRemoved: 0 };

  update(save => {
    const tvByTitle = new Map();
    for (const item of Object.values(save.items || {})) if (item.wing === "tv") tvByTitle.set(norm(item.title), item);

    for (const entry of plan.tv.link || []) {
      const show = save.items[entry.showId];
      if (show?.wing !== "tv") continue;
      if (linkEpisode(show, entry.season, entry.number, entry.path)) summary.linkedFiles++;
    }

    const reuse = new Map((plan.tv.relinkEmpty || []).map(entry => [entry.folder, entry.id]));
    for (const show of plan.tv.newShows || []) {
      const existing = tvByTitle.get(norm(show.title));
      const reusedId = reuse.get(show.folder);
      let record = existing || (reusedId ? save.items[reusedId] : null);
      if (!record) {
        const id = `tv_local_${norm(show.title).replace(/\s+/g, "_").slice(0, 60) || Math.random().toString(36).slice(2, 10)}`;
        if (!save.items[id]) save.items[id] = { id, wing: "tv", type: "tv", title: show.title, owned: true, favorite: false, status: "backlog", genres: ["Television"], artwork: "", addedAt: new Date().toISOString(), episodes: {}, sourcePaths: [] };
        record = save.items[id];
        tvByTitle.set(norm(show.title), record);
        summary.showsAdded++;
      }
      record.owned = true;
      record.title = record.title || show.title;
      record.scanSource = "Local drive repair";
      record.tvMeta = { ...(record.tvMeta || {}), localFolder: show.folder, addedBy: "local_drive_repair", needsMetadata: true };
      delete record.tvMeta.planned;
      for (const episode of show.episodes || []) if (linkEpisode(record, episode.season, episode.number, episode.path)) summary.episodesAdded++;
      refreshProgress(record);
    }

    for (const entry of plan.tv.removeEmpty || []) if (removeCard(save, entry.id, entry.reason)) summary.seriesRemoved++;
    for (const entry of plan.tv.link || []) {
      const show = save.items[entry.showId];
      if (show) refreshProgress(show);
    }

    for (const record of plan.movies.restore || []) {
      if (!record?.id || save.items[record.id]) continue;
      save.items[record.id] = { ...record, wing: "movies", type: record.type || "movie", owned: Boolean(record.owned), favorite: Boolean(record.favorite), status: record.status || "backlog" };
      summary.moviesRestored++;
    }
    // A shelf entry for a film already in the library points at that owned record.
    const ownedMovies = new Map();
    for (const item of Object.values(save.items || {})) {
      if (item.wing !== "movies") continue;
      ownedMovies.set(norm(item.title), item.id);
      if (item.year) ownedMovies.set(`${norm(item.title)}|${item.year}`, item.id);
    }
    const replacement = new Map();
    for (const entry of plan.movies.ownedReplacements || []) {
      const id = ownedMovies.get(`${norm(entry.title)}|${entry.year}`) || ownedMovies.get(norm(entry.title));
      if (id) replacement.set(entry.legacyId, id);
    }
    for (const [id, collection] of Object.entries(plan.movies.collections || {})) {
      if (!id || save.collections?.[id]) continue;
      save.collections ||= {};
      const itemIds = [...new Set((collection.itemIds || []).map(itemId => replacement.get(itemId) || itemId))].filter(itemId => save.items[itemId]);
      save.collections[id] = { ...collection, itemIds };
      summary.shelvesRestored++;
    }
    for (const entry of plan.movies.removeJunk || []) if (removeCard(save, entry.id, "drive scan record with no film file")) summary.junkRemoved++;

    save.metadata.maintenance ||= {};
    save.metadata.maintenance[FLAG] = { completedAt: new Date().toISOString(), planVersion: plan.version, source: plan.source, ...summary };
  });

  await flushPersistence();
  return summary;
}
