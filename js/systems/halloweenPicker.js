import { getState } from "../core/store.js";
import { escapeHtml as esc } from "../ui/safeHtml.js";
import { HALLOWEEN_CATALOG } from "./halloweenCatalog.js?v=20261002-pool-v2";

const state = {
  kind: "",
  pick: null,
  lastByKind: { movie: "", show: "" },
  notTonight: { movie: new Set(), show: new Set() }
};
const poolCache = new WeakMap();

const isOctober = date => (date || new Date()).getMonth() === 9;
const artFor = item => typeof item?.artwork === "string"
  ? item.artwork
  : item?.artwork?.localPath || item?.artwork?.url || "";
const pathFor = item => item?.sourcePath || (item?.sourcePaths || [])[0] || "";
const horrorTagged = item => (item?.genres || []).some(genre => {
  const value = String(genre || "").trim().toLowerCase();
  if (!value.includes("horror")) return false;
  if (/^sci[- ]?fi,? fantasy (?:&|and) horror$/.test(value)) return false;
  return true;
});
const episodeList = item => Object.values(item?.episodes || {})
  .sort((a,b) => Number(a.season) - Number(b.season) || Number(a.number) - Number(b.number));
const nextEpisode = item => episodeList(item).find(ep => ep.status !== "completed") || null;
const episodeCode = ep => ep ? `S${String(ep.season).padStart(2,"0")}E${String(ep.number).padStart(2,"0")}` : "";
const normalizeTitle = value => String(value || "")
  .toLowerCase()
  .replace(/\bthe\b/g, " ")
  .replace(/&/g, " and ")
  .replace(/[^a-z0-9]+/g, " ")
  .trim()
  .replace(/\s+/g, " ");
const continuityTitle = value => normalizeTitle(String(value || "")
  .replace(/\s*\((?:19|20)\d{2}(?:\s*[–-]\s*(?:\d{2}|\d{4}))?\)\s*$/, ""));

let catalogTitleIndex = null;
function getCatalogTitleIndex() {
  if (catalogTitleIndex) return catalogTitleIndex;
  catalogTitleIndex = new Map();
  for (const entry of HALLOWEEN_CATALOG) {
    const wing = entry.kind === "show" ? "tv" : "movies";
    const key = `${wing}|${continuityTitle(entry.title)}`;
    if (!catalogTitleIndex.has(key)) catalogTitleIndex.set(key, []);
    catalogTitleIndex.get(key).push(entry);
  }
  return catalogTitleIndex;
}

function catalogMatchesItem(item) {
  if (!item?.wing || !item?.title) return false;
  const entries = getCatalogTitleIndex().get(`${item.wing}|${continuityTitle(item.title)}`) || [];
  return entries.some(entry => entryMatchesItem(entry, item));
}

const movieStatus = item => item?.movieMeta?.profiles?.you?.status || item?.status || "backlog";
const watchedMovie = item => movieStatus(item) === "completed";
const isStandaloneSpecial = item =>
  item?.halloweenMeta?.format === "special" ||
  /special/i.test(String(item?.type || "")) ||
  (item?.genres || []).some(genre => /special/i.test(String(genre))) ||
  /\bspecial\b/i.test(String(item?.title || ""));

function sameMovieRecord(a, b) {
  if (!a || !b || a.wing !== "movies" || b.wing !== "movies") return false;
  const sameTitle = continuityTitle(a.title) === continuityTitle(b.title);
  if (!sameTitle) return false;
  return !a.year || !b.year || Number(a.year) === Number(b.year);
}

function watchedIndexHas(index, item) {
  const years = index.get(continuityTitle(item?.title));
  if (!years?.size) return false;
  const year = titleYear(item);
  return !year || years.has(0) || years.has(year);
}

function movieWatchedAnywhere(item, vault, context = null) {
  if (context) return watchedIndexHas(context.watchedMovies, item);
  return Object.values(vault.items || {}).some(other => sameMovieRecord(item, other) && watchedMovie(other));
}

function sameShowRecord(a, b) {
  if (!a || !b || a.wing !== "tv" || b.wing !== "tv") return false;
  if (continuityTitle(a.title) !== continuityTitle(b.title)) return false;
  const ay = titleYear(a), by = titleYear(b);
  return !ay || !by || ay === by;
}

function watchedShow(item) {
  const episodes = episodeList(item);
  if (episodes.length) return episodes.every(episode => episode.status === "completed");
  return item?.status === "completed";
}

function showWatchedAnywhere(item, vault, context = null) {
  if (context) return watchedIndexHas(context.watchedShows, item);
  return Object.values(vault.items || {}).some(other => sameShowRecord(item, other) && watchedShow(other));
}

function prerequisiteWatched(item, vault, context = null) {
  return item?.wing === "tv"
    ? showWatchedAnywhere(item, vault, context)
    : movieWatchedAnywhere(item, vault, context);
}

function titleYear(item) {
  if (Number(item?.year)) return Number(item.year);
  const match = String(item?.title || "").match(/\(((?:19|20)\d{2})(?:\s*[–-]\s*(?:\d{2}|\d{4}))?\)\s*$/);
  return match ? Number(match[1]) : 0;
}

function entryMatchesItem(entry, item) {
  if (!entry || !item) return false;
  const wing = entry.kind === "show" ? "tv" : "movies";
  if (item.wing !== wing) return false;
  if (continuityTitle(entry.title) !== continuityTitle(item.title)) return false;
  const expectedYear = Number(entry.year || 0), actualYear = titleYear(item);
  return !expectedYear || !actualYear || expectedYear === actualYear;
}

function catalogItem(entry) {
  const id = `halloween_catalog_${entry.kind}_${continuityTitle(entry.title).replace(/\s+/g, "_")}_${entry.year || "na"}`;
  return {
    id,
    wing: entry.kind === "show" ? "tv" : "movies",
    type: entry.format === "special" ? "special" : entry.kind === "show" ? "series" : "movie",
    title: entry.title,
    year: entry.year || null,
    status: "catalog",
    genres: ["Horror", ...(entry.tags || [])],
    halloweenMeta: {
      catalogOnly: true,
      format: entry.format || (entry.kind === "show" ? "series" : "movie"),
      series: entry.series || "",
      requires: entry.requires || []
    }
  };
}

function curatedHalloweenMovieIds(vault) {
  const ids = new Set();
  for (const collection of Object.values(vault.collections || {})) {
    if (collection?.wing !== "movies") continue;
    const category = String(collection.legacy?.category || "");
    if (!["Horror", "Creature Features & Syfy"].includes(category)) continue;
    for (const id of collection.itemIds || collection.items || []) ids.add(id);
  }
  return ids;
}

function buildItemTitleIndex(vault) {
  const index = new Map();
  for (const item of Object.values(vault.items || {})) {
    if (!item?.wing || !item?.title) continue;
    const key = `${item.wing}|${continuityTitle(item.title)}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(item);
  }
  return index;
}

function buildEligibilityContext(vault) {
  const items = Object.values(vault.items || {});
  const itemTitleIndex = buildItemTitleIndex(vault);
  const watchedMovies = new Map();
  const watchedShows = new Map();
  const movieCollections = Object.values(vault.collections || {}).filter(collection => collection?.wing === "movies");
  const movieCollectionsByItem = new Map();

  const mark = (index, item) => {
    const key = continuityTitle(item.title);
    if (!index.has(key)) index.set(key, new Set());
    index.get(key).add(titleYear(item) || 0);
  };

  for (const item of items) {
    if (item?.wing === "movies" && watchedMovie(item)) mark(watchedMovies, item);
    if (item?.wing === "tv" && watchedShow(item)) mark(watchedShows, item);
  }
  for (const collection of movieCollections) {
    for (const id of collection.itemIds || collection.items || []) {
      if (!movieCollectionsByItem.has(id)) movieCollectionsByItem.set(id, []);
      movieCollectionsByItem.get(id).push(collection);
    }
  }

  return { items, itemTitleIndex, watchedMovies, watchedShows, movieCollections, movieCollectionsByItem };
}

function resolvedCatalogItems(kind, vault, itemIndex = buildItemTitleIndex(vault)) {
  const wing = kind === "show" ? "tv" : "movies";
  return HALLOWEEN_CATALOG
    .filter(entry => entry.kind === kind)
    .map(entry => {
      const candidates = itemIndex.get(`${wing}|${continuityTitle(entry.title)}`) || [];
      return candidates.find(item => entryMatchesItem(entry, item)) || catalogItem(entry);
    });
}

function franchiseCollectionForMovie(item, vault, context = null) {
  const collections = context
    ? (context.movieCollectionsByItem.get(item.id) || []).filter(collection => (collection.itemIds || collection.items || []).length > 1)
    : Object.values(vault.collections || {}).filter(collection => {
        if (collection?.wing !== "movies") return false;
        const ids = collection.itemIds || collection.items || [];
        return ids.includes(item.id) && ids.length > 1;
      });
  if (!collections.length) return null;
  const id = String(item.id || "");
  const best = collections
    .map(collection => {
      const key = String(collection.id || "").replace(/^collection_legacy_mov_/, "");
      let score = 0;
      if (key && id.includes(`_m_${key}_`)) score += 100;
      const collectionTitle = continuityTitle(collection.title || collection.name);
      const itemTitle = continuityTitle(item.title);
      if (collectionTitle && itemTitle.includes(collectionTitle)) score += 30;
      const category = continuityTitle(collection.legacy?.category || "");
      const thematic = value => /(?:^| )(?:directors?|actors?|icons?|wishlist|grab bag|one offs?|hall of shame|ladders?|already out|still coming|video store|misfires?|watch orders?|fx|stunt legends?)(?: |$)/.test(value);
      if (/^\d{4}$/.test(collectionTitle)) score -= 120;
      if (thematic(collectionTitle) || thematic(category)) score -= 120;
      return { collection, score };
    })
    .sort((a,b) => b.score - a.score)[0];
  return best?.score >= 50 ? best.collection : null;
}

const explicitPrerequisites = new Map([
  ["evil dead ii", [{ title: "evil dead", year: 1981 }]],
  ["army of darkness", [
    { title: "evil dead", year: 1981 },
    { title: "evil dead ii", year: 1987 }
  ]],
  ["ash vs evil dead", [
    { title: "evil dead", year: 1981 },
    { title: "evil dead ii", year: 1987 },
    { title: "army of darkness", year: 1992 }
  ]]
]);

function explicitPrerequisiteItems(item, vault, context = null) {
  const rules = explicitPrerequisites.get(continuityTitle(item.title));
  if (!rules) return null;
  const itemIndex = context?.itemTitleIndex || buildItemTitleIndex(vault);
  return rules.map(rule => {
    const titleMatches = itemIndex.get(`movies|${rule.title}`) || [];
    if (!rule.year) return titleMatches[0] || null;
    return titleMatches.find(candidate => Number(candidate.year) === Number(rule.year))
      || titleMatches.find(candidate => !candidate.year)
      || null;
  }).filter(Boolean);
}

function dedupePrerequisites(items) {
  const seen = new Set();
  return items.filter(candidate => {
    const key = `${continuityTitle(candidate.title)}|${candidate.year || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function franchiseCollectionForShow(item, vault, context = null) {
  const title = continuityTitle(item.title);
  if (!title) return null;
  const candidates = (context?.movieCollections || Object.values(vault.collections || {})).filter(collection => {
    if (collection?.wing !== "movies") return false;
    const ids = collection.itemIds || collection.items || [];
    if (ids.length < 1) return false;
    const name = continuityTitle(collection.title || collection.name);
    if (name.length < 4 || /^\d{4}$/.test(name)) return false;
    return title.includes(name) || name.includes(title);
  });
  return candidates.sort((a,b) =>
    continuityTitle(b.title || b.name).length - continuityTitle(a.title || a.name).length
  )[0] || null;
}

function prerequisiteItems(item, kind, vault, context = null) {
  const catalogRules = item?.halloweenMeta?.requires;
  if (Array.isArray(catalogRules) && catalogRules.length) {
    const itemIndex = context?.itemTitleIndex || buildItemTitleIndex(vault);
    return catalogRules.map(rule => {
      const wing = rule.kind === "show" ? "tv" : "movies";
      const titleMatches = itemIndex.get(`${wing}|${continuityTitle(rule.title)}`) || [];
      const found = !rule.year
        ? titleMatches[0]
        : titleMatches.find(candidate => Number(titleYear(candidate)) === Number(rule.year))
          || titleMatches.find(candidate => !titleYear(candidate));
      return found || {
        id: `halloween_prerequisite_${wing}_${continuityTitle(rule.title).replace(/\s+/g, "_")}_${rule.year || "na"}`,
        wing,
        title: rule.title,
        year: rule.year || null,
        status: "catalog"
      };
    });
  }
  const explicit = explicitPrerequisiteItems(item, vault, context);
  if (explicit) return explicit;

  if (kind === "show") {
    const collection = franchiseCollectionForShow(item, vault, context);
    if (!collection) return [];
    const showYear = Number(item.year || item.tvMeta?.premiered?.slice?.(0, 4) || 0);
    const movies = (collection.itemIds || collection.items || [])
      .map(id => vault.items?.[id])
      .filter(Boolean)
      .filter(movie => !showYear || !movie.year || Number(movie.year) < showYear);
    return dedupePrerequisites(movies);
  }

  if (kind !== "movie") return [];
  const collection = franchiseCollectionForMovie(item, vault, context);
  if (!collection) return [];
  const ids = collection.itemIds || collection.items || [];
  const position = ids.indexOf(item.id);
  if (position <= 0) return [];
  return dedupePrerequisites(ids.slice(0, position).map(id => vault.items?.[id]).filter(Boolean));
}

function prerequisiteRows(item, kind, vault, context) {
  return prerequisiteItems(item, kind, vault, context).map(prior => ({
    id: prior.id,
    title: prior.title,
    year: prior.year || null,
    watched: prerequisiteWatched(prior, vault, context)
  }));
}

function candidateEligible(item, kind, vault, context) {
  if (!item || isStandaloneSpecial(item)) return Boolean(item);
  return prerequisiteRows(item, kind, vault, context).every(prior => prior.watched);
}

export function getHalloweenPrerequisites(item, kind, vault = getState()) {
  return prerequisiteRows(item, kind, vault, buildEligibilityContext(vault));
}

export function isHalloweenCandidateEligible(item, kind, vault = getState()) {
  return candidateEligible(item, kind, vault, buildEligibilityContext(vault));
}

function buildPool(kind, vault) {
  const wing = kind === "show" ? "tv" : "movies";
  const curatedMovieIds = kind === "movie" ? curatedHalloweenMovieIds(vault) : new Set();
  const context = buildEligibilityContext(vault);
  const real = context.items.filter(item =>
    item.wing === wing &&
    item.title &&
    !item.id?.startsWith("tv_drive_") &&
    (horrorTagged(item) || curatedMovieIds.has(item.id) || catalogMatchesItem(item)) &&
    candidateEligible(item, kind, vault, context)
  );
  const supplemental = resolvedCatalogItems(kind, vault, context.itemTitleIndex)
    .filter(item => candidateEligible(item, kind, vault, context));
  const best = new Map();
  for (const item of [...real, ...supplemental]) {
    const key = `${continuityTitle(item.title)}|${titleYear(item) || ""}|${item.halloweenMeta?.format || wing}`;
    const score = (item.halloweenMeta?.catalogOnly ? 0 : 100)
      + (pathFor(item) ? 20 : 0)
      + (item.owned ? 10 : 0)
      + (artFor(item) ? 5 : 0);
    const current = best.get(key);
    if (!current || score > current.score) best.set(key, { item, score });
  }
  return [...best.values()].map(entry => entry.item);
}

function defaultPool(kind, vault = getState()) {
  if (!vault || typeof vault !== "object") return [];
  let cached = poolCache.get(vault);
  if (!cached) {
    cached = { movie: null, show: null };
    poolCache.set(vault, cached);
  }
  if (!cached[kind]) cached[kind] = buildPool(kind, vault);
  return cached[kind];
}

export function getHalloweenPoolEntries(kind, vault = getState()) {
  if (!["movie","show"].includes(kind)) return [];
  return defaultPool(kind, vault);
}

export function getHalloweenPoolSummary(vault = getState()) {
  const summarize = kind => {
    const entries = defaultPool(kind, vault);
    return {
      total: entries.length,
      local: entries.filter(item => !item.halloweenMeta?.catalogOnly).length,
      catalogOnly: entries.filter(item => item.halloweenMeta?.catalogOnly).length,
      specials: entries.filter(item => item.halloweenMeta?.format === "special").length
    };
  };
  return { movie: summarize("movie"), show: summarize("show") };
}

function candidate(item, kind) {
  const episode = kind === "show" ? nextEpisode(item) : null;
  const runtime = Number(item.runtimeMinutes || item.runtime || episode?.runtimeMinutes || 0);
  return {
    kind,
    item,
    episode,
    artwork: artFor(item),
    path: kind === "movie" ? pathFor(item) : episode?.sourcePath || "",
    minutes: runtime > 0 && runtime < 600 ? runtime : null,
    reason: item.halloweenMeta?.catalogOnly
      ? "Halloween catalog pick · nothing has been downloaded"
      : "Halloween pool record from your Vault"
  };
}function available(kind, vault = getState()) {
  const excluded = state.notTonight[kind];
  const last = state.lastByKind[kind];
  const pool = defaultPool(kind, vault)
    .filter(item => !excluded.has(item.id))
    .filter(item => item.id !== last);
  if (pool.length) return pool;
  return defaultPool(kind, vault).filter(item => !excluded.has(item.id));
}

function randomPick(kind, vault = getState()) {
  const pool = available(kind, vault);
  if (!pool.length) {
    state.kind = kind;
    state.pick = null;
    return null;
  }
  const item = pool[Math.floor(Math.random() * pool.length)];
  state.kind = kind;
  state.pick = candidate(item, kind);
  state.lastByKind[kind] = item.id;
  return state.pick;
}

export function chooseHalloweenKind(kind, vault = getState()) {
  if (!["movie","show"].includes(kind)) return null;
  return randomPick(kind, vault);
}

export function rerollHalloweenPick(vault = getState()) {
  if (!state.kind) return null;
  return randomPick(state.kind, vault);
}

export function skipHalloweenPick(vault = getState()) {
  if (!state.kind || !state.pick?.item?.id) return null;
  state.notTonight[state.kind].add(state.pick.item.id);
  return randomPick(state.kind, vault);
}

export function getHalloweenPickerState() {
  return {
    kind: state.kind,
    pick: state.pick,
    notTonight: {
      movie: state.notTonight.movie.size,
      show: state.notTonight.show.size
    }
  };
}

function primaryAction(entry) {
  const { item, episode, kind, path } = entry;
  if (item.halloweenMeta?.catalogOnly) {
    return `<span class="halloween-catalog-only">CATALOG ONLY</span>`;
  }
  if (kind === "show" && path && episode) {
    return `<button class="button primary halloween-primary" data-living-play data-show-id="${esc(item.id)}" data-episode-id="${esc(episode.id)}" data-media-path="${esc(path)}">PLAY ${esc(episodeCode(episode))}</button>`;
  }
  if (kind === "movie" && path) {
    return `<button class="button primary halloween-primary" data-movie-play="${esc(item.id)}">PLAY</button>`;
  }
  const route = kind === "show" ? `tv/${encodeURIComponent(item.id)}` : `record/${encodeURIComponent(item.id)}`;
  return `<button class="button primary halloween-primary" data-route="${route}">OPEN</button>`;
}export function renderHalloweenPicker(vault = getState(), date = new Date()) {
  if (!isOctober(date)) return "";
  const pick = state.pick;
  const picker = `<section class="halloween-picker panel" aria-label="Halloween random picker">
    <header class="halloween-picker-head">
      <div><span class="eyebrow">OCTOBER // RANDOM PICK</span><h2>HALLOWEEN PICK</h2><p>Choose a lane. Nothing is scheduled and nothing is marked watched until you actually watch it.</p></div>
      <div class="halloween-kind">
        <button class="button ${state.kind === "movie" ? "primary" : ""}" data-halloween-kind="movie">MOVIE</button>
        <button class="button ${state.kind === "show" ? "primary" : ""}" data-halloween-kind="show">SHOW</button>
      </div>
    </header>
    ${pick ? renderPick(pick) : `<div class="halloween-empty"><b>MOVIE OR SHOW?</b><span>Pick one and the Vault will pull a random Halloween option.</span></div>`}
  </section>`;
  return picker;
}

function renderPick(entry) {
  const { item, episode, artwork, minutes, reason, kind } = entry;
  const meta = [
    item.halloweenMeta?.format === "special" ? "SPECIAL" : kind === "movie" ? "MOVIE" : "SHOW",
    minutes ? `${minutes} MIN` : "",
    episode ? episodeCode(episode) : "",
    (item.genres || []).find(genre => /horror/i.test(String(genre))) || ""
  ].filter(Boolean);
  return `<article class="halloween-pick">
    <div class="halloween-art">${artwork ? `<img src="${esc(artwork)}" alt="">` : `<span aria-hidden="true">☾</span>`}</div>
    <div class="halloween-copy">
      <span class="eyebrow">${esc(meta.join(" // "))}</span>
      <h3>${esc(item.title)}</h3>
      ${episode ? `<p>${esc(episode.title || episodeCode(episode))}</p>` : ""}
      <small>${esc(reason)}</small>
      <div class="halloween-actions">
        ${primaryAction(entry)}
        <button class="button" data-halloween-reroll>ROLL AGAIN</button>
        <button class="button" data-halloween-skip>NOT TONIGHT</button>
      </div>
    </div>
  </article>`;
}
