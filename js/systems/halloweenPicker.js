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
const nextEpisode = item => episodeList(item).find(ep => ep.status !== "completed" && ep.sourcePath)
  || episodeList(item).find(ep => ep.sourcePath)
  || episodeList(item).find(ep => ep.status !== "completed")
  || null;
const episodeCode = ep => ep ? `S${String(ep.season).padStart(2,"0")}E${String(ep.number).padStart(2,"0")}` : "";

function defaultPool(kind, vault = getState()) {
  const wing = kind === "show" ? "tv" : "movies";
  return Object.values(vault.items || {}).filter(item =>
    item.wing === wing &&
    item.title &&
    !item.id?.startsWith("tv_drive_") &&
    horrorTagged(item)
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
