import { getState } from "../core/store.js";
import { escapeHtml as esc } from "../ui/safeHtml.js";

const state = {
  kind: "",
  pick: null,
  lastByKind: { movie: "", show: "" },
  notTonight: { movie: new Set(), show: new Set() }
};

const isOctober = date => (date || new Date()).getMonth() === 9;
const artFor = item => typeof item?.artwork === "string"
  ? item.artwork
  : item?.artwork?.localPath || item?.artwork?.url || "";
const pathFor = item => item?.sourcePath || (item?.sourcePaths || [])[0] || "";
const horrorTagged = item => (item?.genres || []).some(genre => /horror/i.test(String(genre)));
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
const movieStatus = item => item?.movieMeta?.profiles?.you?.status || item?.status || "backlog";
const watchedMovie = item => movieStatus(item) === "completed";
const isStandaloneSpecial = item =>
  /special/i.test(String(item?.type || "")) ||
  (item?.genres || []).some(genre => /special/i.test(String(genre))) ||
  /\bspecial\b/i.test(String(item?.title || ""));

function sameMovieRecord(a, b) {
  if (!a || !b || a.wing !== "movies" || b.wing !== "movies") return false;
  const sameTitle = continuityTitle(a.title) === continuityTitle(b.title);
  if (!sameTitle) return false;
  return !a.year || !b.year || Number(a.year) === Number(b.year);
}

function movieWatchedAnywhere(item, vault) {
  return Object.values(vault.items || {}).some(other => sameMovieRecord(item, other) && watchedMovie(other));
}

function franchiseCollectionForMovie(item, vault) {
  const collections = Object.values(vault.collections || {}).filter(collection => {
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

function explicitPrerequisiteItems(item, vault) {
  const rules = explicitPrerequisites.get(continuityTitle(item.title));
  if (!rules) return null;
  const movies = Object.values(vault.items || {}).filter(candidate => candidate.wing === "movies");
  return rules.map(rule => {
    const titleMatches = movies.filter(candidate => continuityTitle(candidate.title) === rule.title);
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

function franchiseCollectionForShow(item, vault) {
  const title = continuityTitle(item.title);
  if (!title) return null;
  const candidates = Object.values(vault.collections || {}).filter(collection => {
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

function prerequisiteItems(item, kind, vault) {
  const explicit = explicitPrerequisiteItems(item, vault);
  if (explicit) return explicit;

  if (kind === "show") {
    const collection = franchiseCollectionForShow(item, vault);
    if (!collection) return [];
    const showYear = Number(item.year || item.tvMeta?.premiered?.slice?.(0, 4) || 0);
    const movies = (collection.itemIds || collection.items || [])
      .map(id => vault.items?.[id])
      .filter(Boolean)
      .filter(movie => !showYear || !movie.year || Number(movie.year) < showYear);
    return dedupePrerequisites(movies);
  }

  if (kind !== "movie") return [];
  const collection = franchiseCollectionForMovie(item, vault);
  if (!collection) return [];
  const ids = collection.itemIds || collection.items || [];
  const position = ids.indexOf(item.id);
  if (position <= 0) return [];
  return dedupePrerequisites(ids.slice(0, position).map(id => vault.items?.[id]).filter(Boolean));
}

export function getHalloweenPrerequisites(item, kind, vault = getState()) {
  return prerequisiteItems(item, kind, vault).map(prior => ({
    id: prior.id,
    title: prior.title,
    year: prior.year || null,
    watched: movieWatchedAnywhere(prior, vault)
  }));
}

export function isHalloweenCandidateEligible(item, kind, vault = getState()) {
  if (!item || isStandaloneSpecial(item)) return Boolean(item);
  return getHalloweenPrerequisites(item, kind, vault).every(prior => prior.watched);
}

function defaultPool(kind, vault = getState()) {
  const wing = kind === "show" ? "tv" : "movies";
  return Object.values(vault.items || {}).filter(item =>
    item.wing === wing &&
    item.title &&
    !item.id?.startsWith("tv_drive_") &&
    horrorTagged(item) &&
    isHalloweenCandidateEligible(item, kind, vault)
  );
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
    reason: "Tagged Horror in your Vault"
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
    kind === "movie" ? "MOVIE" : "SHOW",
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
