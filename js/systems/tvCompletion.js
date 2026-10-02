import { createArchiveSnapshot, flushPersistence, getState, update } from "../core/store.js";
import { fillTitlesFromFiles } from "./tvEpisodeDetails.js?v=20260911-episode-details-v1";

// Second local repair pass, TV only. Makes leftover specials playable, records
// alternate copies, flags links whose file is genuinely gone, reassigns files that
// were filed under a folder name, and fills empty metadata fields from TVMaze.
// Manual values always win: nothing already set is overwritten.
const COMPLETION_URL = "./data/repair/tv-completion-plan.json";
const METADATA_URL = "./data/repair/tv-metadata-plan.json";
const FLAG = "tvCompletion20260911";

const episodeId = (showId, season, number) => `${showId}_s${String(season).padStart(2, "0")}e${String(number).padStart(2, "0")}`;
const filled = value => value !== undefined && value !== null && String(value).trim() !== "";

function episodeAt(show, season, number) {
  show.episodes ||= {};
  const existing = Object.values(show.episodes).find(entry => Number(entry.season) === Number(season) && Number(entry.number) === Number(number));
  if (existing) return existing;
  const id = episodeId(show.id, season, number);
  show.episodes[id] = { id, season: Number(season), number: Number(number), status: "backlog", rating: null, note: "", rewatches: 0 };
  return show.episodes[id];
}

function refreshProgress(show) {
  const episodes = Object.values(show.episodes || {});
  const done = episodes.filter(episode => episode.status === "completed").length;
  show.progress = { completed: done, total: episodes.length };
  if (show.status === "planned") return;
  show.status = done === episodes.length && done ? "completed" : done || episodes.some(episode => episode.status === "in_progress") ? "in_progress" : "backlog";
}

function titleFromPath(path) {
  const stem = String(path).split(/[\\/]/).pop().replace(/\.[a-z0-9]{2,4}$/i, "");
  return stem.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

export async function runTvCompletion() {
  if (getState().metadata?.maintenance?.[FLAG]) return null;
  let completion = null, metadata = null;
  try {
    const [completionResponse, metadataResponse] = await Promise.all([
      fetch(COMPLETION_URL, { cache: "no-store" }),
      fetch(METADATA_URL, { cache: "no-store" }).catch(() => null)
    ]);
    if (!completionResponse?.ok) return null;
    completion = await completionResponse.json();
    if (metadataResponse?.ok) metadata = await metadataResponse.json();
  } catch { return null; }
  if (!completion) return null;

  await createArchiveSnapshot("Protected backup before TV completion pass", { kind: "tv_completion", protected: true });
  const summary = { foldedSpecials: 0, duplicatesRetired: 0, specialsLinked: 0, titleMatched: 0, extrasFiled: 0, alternatesRecorded: 0, deadLinksFlagged: 0, filesReassigned: 0, sweptIn: 0, junkRetired: 0, phantomEpisodesRetired: 0, seriesEnriched: 0, postersApplied: 0, seasonPostersApplied: 0, episodeDetailsFilled: 0 };

  update(save => {
    const touched = new Set();

    // A one-off special belongs under its parent series, not on the wall as its own card.
    for (const entry of completion.fold || []) {
      const parent = save.items[entry.parentId], child = save.items[entry.childId];
      if (parent?.wing !== "tv" || !child) continue;
      const used = Object.values(parent.episodes || {}).filter(episode => Number(episode.season) === 0).length;
      const episode = episodeAt(parent, 0, used + 1);
      episode.title ||= entry.childTitle;
      if (entry.path && !episode.sourcePath) {
        episode.sourcePath = entry.path;
        parent.owned = true;
        parent.sourcePaths = [...new Set([...(parent.sourcePaths || []), entry.path])];
      }
      save.metadata.removedCards ||= [];
      save.metadata.removedCards.push({ id: child.id, item: JSON.parse(JSON.stringify(child)), title: child.title || entry.childTitle, wing: "tv", removedAt: new Date().toISOString(), reason: `folded into ${entry.parentTitle} as a special` });
      delete save.items[entry.childId];
      summary.foldedSpecials++;
      touched.add(parent.id);
    }

    for (const entry of completion.retireDuplicates || []) {
      const item = save.items[entry.id];
      if (!item) continue;
      save.metadata.removedCards ||= [];
      save.metadata.removedCards.push({ id: entry.id, item: JSON.parse(JSON.stringify(item)), title: item.title, wing: "tv", removedAt: new Date().toISOString(), reason: entry.reason });
      delete save.items[entry.id];
      summary.duplicatesRetired++;
    }

    for (const entry of completion.specials || []) {
      const show = save.items[entry.id];
      if (show?.wing !== "tv") continue;
      const used = Object.values(show.episodes || {}).filter(episode => Number(episode.season) === 0).length;
      const episode = episodeAt(show, 0, used + 1);
      if (!episode.sourcePath) {
        episode.sourcePath = entry.path;
        episode.title ||= titleFromPath(entry.path);
        show.owned = true;
        show.sourcePaths = [...new Set([...(show.sourcePaths || []), entry.path])];
        summary.specialsLinked++;
        touched.add(show.id);
      }
    }

    for (const entry of completion.alternates || []) {
      const show = save.items[entry.showId];
      if (show?.wing !== "tv") continue;
      const episode = Object.values(show.episodes || {}).find(value => Number(value.season) === Number(entry.season) && Number(value.number) === Number(entry.number));
      if (!episode) continue;
      const extras = (entry.paths || []).filter(path => path !== episode.sourcePath);
      if (!extras.length) continue;
      episode.alternatePaths = [...new Set([...(episode.alternatePaths || []), ...extras])];
      summary.alternatesRecorded++;
    }

    // Files with no episode number in the name, placed by matching the episode title.
    for (const entry of completion.titleMatched || []) {
      const show = save.items[entry.showId];
      if (show?.wing !== "tv") continue;
      const episode = episodeAt(show, entry.season, entry.number);
      if (!episode.sourcePath) {
        episode.sourcePath = entry.path;
        episode.title ||= entry.episodeTitle;
        show.owned = true;
        show.sourcePaths = [...new Set([...(show.sourcePaths || []), entry.path])];
        summary.titleMatched++;
        touched.add(show.id);
      } else if (episode.sourcePath !== entry.path) {
        episode.alternatePaths = [...new Set([...(episode.alternatePaths || []), entry.path])];
      }
    }

    // Everything else in a show's folder becomes a special of that show rather than a loose file.
    for (const entry of completion.extras || []) {
      const show = save.items[entry.showId];
      if (show?.wing !== "tv") continue;
      const used = Object.values(show.episodes || {}).filter(episode => Number(episode.season) === 0).length;
      const episode = episodeAt(show, 0, used + 1);
      if (episode.sourcePath) continue;
      episode.sourcePath = entry.path;
      episode.title ||= entry.title || titleFromPath(entry.path);
      show.owned = true;
      show.sourcePaths = [...new Set([...(show.sourcePaths || []), entry.path])];
      summary.extrasFiled++;
      touched.add(show.id);
    }

    for (const entry of completion.deadLinks || []) {
      const episode = save.items[entry.showId]?.episodes?.[entry.episodeId];
      if (!episode || episode.sourcePath !== entry.path) continue;
      episode.linkStatus = "missing";
      episode.linkCheckedAt = new Date().toISOString();
      summary.deadLinksFlagged++;
    }

    // Episode slots with no file that no catalog lists: leftovers from an older import.
    // Anything with a watch state, rating, note or title is kept, and every removal is logged.
    for (const entry of completion.retireEpisodes || []) {
      const show = save.items[entry.showId], episode = show?.episodes?.[entry.episodeId];
      if (!episode || episode.sourcePath || episode.status === "completed" || episode.rating
          || String(episode.note || "").trim() || episode.completedAt || episode.playbackSeconds
          || String(episode.title || "").trim()) continue;
      const meta = (save.metadata.tv ||= {});
      meta.retiredEpisodes ||= [];
      meta.retiredEpisodes.push({ showId: entry.showId, showTitle: entry.showTitle, episode: JSON.parse(JSON.stringify(episode)), retiredAt: new Date().toISOString(), reason: "no file, and no episode with that number in the catalog" });
      delete show.episodes[entry.episodeId];
      summary.phantomEpisodesRetired++;
      touched.add(show.id);
    }

    for (const entry of [...(completion.reassign || []), ...(completion.sweep || [])]) {
      const show = save.items[entry.showId];
      if (show?.wing !== "tv") continue;
      const episode = episodeAt(show, entry.season, entry.number);
      if (episode.sourcePath && episode.sourcePath !== entry.path) {
        episode.alternatePaths = [...new Set([...(episode.alternatePaths || []), entry.path])];
        continue;
      }
      if (!episode.sourcePath) {
        episode.sourcePath = entry.path;
        show.owned = true;
        show.sourcePaths = [...new Set([...(show.sourcePaths || []), entry.path])];
        if (completion.reassign?.includes(entry)) summary.filesReassigned++; else summary.sweptIn++;
        touched.add(show.id);
      }
    }

    for (const entry of completion.retire || []) {
      const item = save.items[entry.id];
      if (!item) continue;
      save.metadata.removedCards ||= [];
      save.metadata.removedCards.push({ id: entry.id, item: JSON.parse(JSON.stringify(item)), title: item.title || entry.title, wing: "tv", removedAt: new Date().toISOString(), reason: "scan record named after a folder; its files were reassigned" });
      delete save.items[entry.id];
      summary.junkRetired++;
    }

    // Hand-mapped entries are appended after the automatic ones, so the last wins.
    const enrichment = new Map((metadata?.series || []).map(record => [record.id, record]));
    for (const record of enrichment.values()) {
      const show = save.items[record.id];
      if (show?.wing !== "tv") continue;
      const generic = !(show.genres || []).length || (show.genres || []).every(genre => String(genre).toLowerCase() === "television");
      if (generic && record.genres?.length) show.genres = record.genres.slice(0, 10);
      if (!filled(show.year) && record.year) show.year = record.year;
      if (!filled(show.endYear) && record.endYear) show.endYear = record.endYear;
      if (!filled(show.network) && record.network) show.network = record.network;
      if (!filled(show.description) && record.description) show.description = record.description;
      if (!filled(show.artwork) && record.localArt) { show.artwork = record.localArt; summary.postersApplied++; }
      if (record.seasonArt) {
        // Season posters you approved yourself are never replaced.
        show.seasonArtwork ||= {};
        for (const [season, path] of Object.entries(record.seasonArt)) {
          if (!filled(show.seasonArtwork[season])) { show.seasonArtwork[season] = path; summary.seasonPostersApplied++; }
        }
      }
      show.tvMeta = { ...(show.tvMeta || {}), tvmazeId: record.tvmazeId, catalogEnriched: true, catalogSource: "TVMaze",
                      sourceUrl: record.sourceUrl || show.tvMeta?.sourceUrl || "", officialUrl: record.officialUrl || show.tvMeta?.officialUrl || "",
                      publicationStatus: record.status || show.tvMeta?.publicationStatus || "unknown", catalogUpdatedAt: new Date().toISOString() };
      delete show.tvMeta.needsMetadata;
      for (const detail of record.episodes || []) {
        const episode = Object.values(show.episodes || {}).find(value => Number(value.season) === Number(detail.season) && Number(value.number) === Number(detail.number));
        if (!episode) continue;
        let changed = false;
        if (!filled(episode.title) && detail.title) { episode.title = detail.title; changed = true; }
        if (!filled(episode.airDate) && detail.airDate) { episode.airDate = detail.airDate; changed = true; }
        if (!filled(episode.runtimeMinutes) && detail.runtimeMinutes) { episode.runtimeMinutes = detail.runtimeMinutes; changed = true; }
        if (!filled(episode.description) && detail.description) { episode.description = detail.description; changed = true; }
        if (changed) { episode.metadataSource = "TVMaze"; summary.episodeDetailsFilled++; }
      }
      summary.seriesEnriched++;
      touched.add(show.id);
    }

    for (const id of touched) if (save.items[id]) refreshProgress(save.items[id]);
    save.metadata.maintenance ||= {};
    save.metadata.maintenance[FLAG] = { completedAt: new Date().toISOString(), ...summary };
  });

  // Episodes whose file carries the title in its name get it now, offline.
  summary.titlesFromFilenames = fillTitlesFromFiles();
  update(save => { save.metadata.maintenance[FLAG].titlesFromFilenames = summary.titlesFromFilenames; });
  await flushPersistence();
  return summary;
}
