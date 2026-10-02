import { flushPersistence, getState, update } from "../core/store.js";

// Episode details, filled from two local-first sources and never overwriting your own
// edits: the filename on disk first (instant, offline), then the TVMaze catalog through
// the local server. Re-runnable: a per-series ledger skips anything checked recently.
const LEDGER_DAYS = 7;

const RELEASE_TAGS = /\b(1080p|720p|480p|360p|2160p|4k|bluray|blu-ray|brrip|bdrip|dvdrip|dvd|webrip|web-dl|webdl|hdtv|hdrip|x264|x265|h264|h265|hevc|xvid|divx|aac|ac3|dd5[. ]?1|dts|flac|mp3|10bits?|8bits?|dual-?audio|multi|subbed|dubbed|eng(?:lish)?[- ]?sub|remux|repack|proper|internal|uncensored|uncut|complete|season\s*\d+|s\d{1,2}e\d{1,3}|\d{1,2}x\d{2,3})\b/gi;
const BRACKETED = /[\[\(\{][^\]\)\}]*[\]\)\}]/g;
// A leading code is removed only when a separator follows, so "000 Intro" keeps its I
// while "101-a Red" loses the part marker.
const LEADING_CODE = /^\s*(?:s\d{1,2}\s*e\d{1,3}|\d{1,2}x\d{2,3}|e(?:p(?:isode)?)?\s*\d{1,3}|\d{1,3}(?:[-–_][a-d])?)(?=[\s\-–_.:])[\s\-–_.:]+/i;

export function titleFromFilename(path, showTitle = "") {
  if (!path) return "";
  const stem = String(path).split(/[\\/]/).pop().replace(/\.[a-z0-9]{2,4}$/i, "");
  let text = stem.replace(BRACKETED, " ").replace(/[._]+/g, " ").replace(RELEASE_TAGS, " ");
  const words = String(showTitle).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (words.length >= 3) {
    const pattern = words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "[^a-z0-9]+");
    text = text.replace(new RegExp(`^\\s*${pattern}(?![a-z])\\s*[-–_:]*\\s*`, "i"), " ");
  }
  text = text.replace(LEADING_CODE, "").replace(/^\s*[-–_:]+\s*/, "").replace(/\s*[-–_]\s*$/, "");
  text = text.replace(/\s{2,}/g, " ").replace(/^[\s\-–_.]+|[\s\-–_.]+$/g, "");
  if (text.length < 2 || /^[\d\W]+$/.test(text)) return "";
  return text.slice(0, 140);
}

/** Fill episode titles from the filenames already on disk. Offline and instant. */
export function fillTitlesFromFiles() {
  let filled = 0;
  update(save => {
    for (const show of Object.values(save.items || {})) {
      if (show.wing !== "tv") continue;
      for (const episode of Object.values(show.episodes || {})) {
        if (String(episode.title || "").trim() || !episode.sourcePath) continue;
        const title = titleFromFilename(episode.sourcePath, show.title);
        if (!title) continue;
        episode.title = title;
        episode.titleSource = "filename";
        filled++;
      }
    }
  });
  return filled;
}

const stale = entry => !entry?.checkedAt || Date.now() - Date.parse(entry.checkedAt) > LEDGER_DAYS * 86400000;

function seriesNeedingDetails(force) {
  const state = getState(), ledger = state.metadata?.tv?.episodeDetails?.items || {};
  return Object.values(state.items || {}).filter(show => {
    if (show.wing !== "tv" || !show.title) return false;
    const episodes = Object.values(show.episodes || {}).filter(episode => Number(episode.season) > 0);
    if (!episodes.length) return false;
    const incomplete = episodes.some(episode => !String(episode.title || "").trim() || !episode.airDate || !episode.description);
    return incomplete && (force || stale(ledger[show.id]));
  });
}

/** Fill missing episode details for one series from TVMaze, through the local server. */
export async function fillSeriesFromCatalog(showId) {
  const show = getState().items[showId];
  if (!show?.title) return { filled: 0, status: "missing_series" };
  let payload = null;
  try {
    const response = await fetch("./__vault/tv/episodes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Vault-Request": "tv-episodes" },
      body: JSON.stringify({ title: show.title, year: show.year || 0 })
    });
    payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "episode_catalog_unavailable");
  } catch (error) {
    update(save => {
      const target = (save.metadata.tv ||= {});
      target.episodeDetails ||= { items: {} };
      target.episodeDetails.items[showId] = { checkedAt: new Date().toISOString(), status: "unavailable", message: String(error.message || error) };
    });
    return { filled: 0, status: "unavailable" };
  }
  let filled = 0, retired = 0;
  update(save => {
    const target = save.items[showId];
    if (!target) return;
    // Slots with no file that the catalog does not list are leftovers from an older
    // import. Only completely empty ones go, never more than a third of a series at
    // once (a bad catalog match must not be able to empty a show), and each is logged.
    const known = new Set((payload.episodes || []).map(detail => `${Number(detail.season)}x${Number(detail.number)}`));
    if (known.size >= 5) {
      const episodes = Object.values(target.episodes || {});
      const strays = episodes.filter(episode => Number(episode.season) > 0 && !episode.sourcePath
        && !known.has(`${Number(episode.season)}x${Number(episode.number)}`)
        && episode.status !== "completed" && !episode.rating && !String(episode.note || "").trim()
        && !episode.completedAt && !episode.playbackSeconds && !String(episode.title || "").trim());
      if (strays.length && strays.length <= episodes.length / 3) {
        const meta = (save.metadata.tv ||= {});
        meta.retiredEpisodes ||= [];
        for (const episode of strays) {
          meta.retiredEpisodes.push({ showId, showTitle: target.title, episode: JSON.parse(JSON.stringify(episode)), retiredAt: new Date().toISOString(), reason: "no file, and no episode with that number in the catalog" });
          delete target.episodes[episode.id];
          retired++;
        }
      }
    }
    for (const detail of payload.episodes || []) {
      const episode = Object.values(target.episodes || {}).find(value => Number(value.season) === Number(detail.season) && Number(value.number) === Number(detail.number));
      if (!episode) continue;
      let changed = false;
      // Anything already filled — by you, by the filename, or by an earlier run — stays.
      if (!String(episode.title || "").trim() && detail.title) { episode.title = detail.title; changed = true; }
      if (!episode.airDate && detail.airDate) { episode.airDate = detail.airDate; changed = true; }
      if (!episode.runtimeMinutes && detail.runtimeMinutes) { episode.runtimeMinutes = detail.runtimeMinutes; changed = true; }
      if (!String(episode.description || "").trim() && detail.description) { episode.description = detail.description; changed = true; }
      if (changed) { episode.metadataSource = payload.sourceName || "TVMaze"; filled++; }
    }
    const meta = (save.metadata.tv ||= {});
    meta.episodeDetails ||= { items: {} };
    meta.episodeDetails.items[showId] = { checkedAt: new Date().toISOString(), status: "checked", filled, retired };
    const record = save.items[showId];
    record.tvMeta = { ...(record.tvMeta || {}), episodeMetadataSource: payload.sourceName || "TVMaze", episodeMetadataUpdatedAt: new Date().toISOString() };
    const episodes = Object.values(record.episodes || {});
    const done = episodes.filter(episode => episode.status === "completed").length;
    record.progress = { completed: done, total: episodes.length };
  });
  return { filled, retired, status: "checked" };
}

/**
 * Fill every episode detail that can be filled: filenames first, then the catalog.
 * Safe to run repeatedly; recently checked series are skipped unless forced.
 */
export async function fillEpisodeDetails({ onProgress = () => {}, force = false, control = null } = {}) {
  onProgress({ phase: "READING FILENAMES", detail: "No network needed for this step.", current: 0, total: 1 });
  const fromFiles = fillTitlesFromFiles();
  const targets = seriesNeedingDetails(force);
  let filled = 0, checked = 0, unavailable = 0, retired = 0;
  for (let index = 0; index < targets.length; index++) {
    await (control || globalThis.__vaultActiveJobControl)?.checkpoint?.();
    const show = targets[index];
    onProgress({ phase: `CHECKING ${String(show.title).toUpperCase()}`, detail: `${fromFiles} titles from filenames · ${filled} details from the catalog · ${retired} empty slots retired · ${unavailable} unavailable`, current: index, total: targets.length });
    const result = await fillSeriesFromCatalog(show.id);
    filled += result.filled;
    retired += result.retired || 0;
    if (result.status === "checked") checked++; else unavailable++;
  }
  update(save => {
    const meta = (save.metadata.tv ||= {});
    meta.episodeDetails = { ...(meta.episodeDetails || { items: {} }), completedAt: new Date().toISOString(), fromFiles, fromCatalog: filled, phantomsRetired: retired, seriesChecked: checked, seriesUnavailable: unavailable };
  });
  await flushPersistence();
  onProgress({ phase: "EPISODE DETAILS COMPLETE", detail: `${fromFiles} from filenames · ${filled} from the catalog · ${retired} empty slots retired`, current: targets.length, total: targets.length });
  return { fromFiles, fromCatalog: filled, phantomsRetired: retired, seriesChecked: checked, seriesUnavailable: unavailable, seriesConsidered: targets.length };
}

/** How much is still missing, for the button label and the report. */
export function episodeDetailGaps(state = getState()) {
  const shows = Object.values(state.items || {}).filter(show => show.wing === "tv");
  const episodes = shows.flatMap(show => Object.values(show.episodes || {}));
  return {
    episodes: episodes.length,
    untitled: episodes.filter(episode => !String(episode.title || "").trim()).length,
    untitledWithFile: episodes.filter(episode => !String(episode.title || "").trim() && episode.sourcePath).length,
    withoutAirDate: episodes.filter(episode => !episode.airDate).length,
    withoutDescription: episodes.filter(episode => !String(episode.description || "").trim()).length
  };
}
