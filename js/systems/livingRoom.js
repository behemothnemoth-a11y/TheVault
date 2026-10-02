import { getState } from "../core/store.js";
import { escapeHtml as esc } from "../ui/safeHtml.js";
import { getLifeDashboardModel } from "./lifeDashboard.js";
import { getPlaybackPrompt } from "./playbackLifecycle.js";

const MEDIA_WINGS = new Set(["movies", "tv", "games", "books"]);
const artFor = item => typeof item?.artwork === "string" ? item.artwork : item?.artwork?.localPath || item?.artwork?.url || "";
const lifePreferences = state => state.metadata?.lifeDashboard?.preferences || {
  timeAvailable: 60, energy: "steady", mood: "open"
};
const hash = value => { let out = 2166136261; for (const char of String(value)) { out ^= char.charCodeAt(0); out = Math.imul(out, 16777619); } return out >>> 0; };
const codeFor = episode => episode ? `S${String(episode.season).padStart(2, "0")}E${String(episode.number).padStart(2, "0")}` : "";
const episodeList = item => Object.values(item.episodes || {}).sort((a, b) => Number(a.season) - Number(b.season) || Number(a.number) - Number(b.number));
const nextEpisode = item => episodeList(item).find(episode => episode.status !== "completed" && episode.sourcePath) || episodeList(item).find(episode => episode.status !== "completed") || null;
const usefulTitle = item => item.title && item.title.length < 110 && !item.id.startsWith("tv_drive_") && !/\bverify\b|^gameplay\s*:/i.test(item.title);

function minutesFor(item, episode) {
  const explicit = Number(item.runtimeMinutes || item.runtime || episode?.runtimeMinutes || 0);
  if (explicit > 0 && explicit < 600) return explicit;
  return item.wing === "tv" ? 30 : item.wing === "movies" ? 110 : item.wing === "books" ? 45 : 60;
}

function candidateFor(item, preferences, state) {
  const episode = item.wing === "tv" ? nextEpisode(item) : null, minutes = minutesFor(item, episode);
  const recentTv = (state.metadata?.stage33?.recentTv || []).find(entry => entry.showId === item.id);
  let score = item.status === "in_progress" ? 70 : item.status === "completed" ? -20 : 5;
  score += item.favorite ? 45 : 0; score += Number(item.rating || 0) * 4; score += item.owned ? 14 : 0;
  score += episode?.sourcePath ? 35 : 0; score += recentTv ? 30 : 0;
  score += minutes <= preferences.timeAvailable ? 22 : -Math.min(30, Math.round((minutes - preferences.timeAvailable) / 3));
  if (preferences.energy === "easy") score += ["tv", "books"].includes(item.wing) ? 18 : -5;
  if (preferences.energy === "high") score += item.wing === "games" ? 24 : item.wing === "movies" ? 10 : 0;
  if (preferences.mood === "comfort") score += item.favorite || item.rating >= 8 ? 35 : item.owned ? 12 : -8;
  if (preferences.mood === "discover") score += item.owned ? -8 : 30;
  if (preferences.mood === "focused") score += item.status === "in_progress" ? 30 : -4;
  const reasons = [];
  if (item.status === "in_progress" || recentTv) reasons.push("You already have momentum here");
  if (item.favorite) reasons.push("One of your explicit favorites");
  if (item.rating) reasons.push(`Rated ${item.rating}/10 by you`);
  if (episode?.sourcePath) reasons.push(`${codeFor(episode)} is ready to play`);
  if (minutes <= preferences.timeAvailable) reasons.push(`Fits your ${preferences.timeAvailable}-minute window`);
  if (!item.owned) reasons.push("A discovery outside your owned shelf");
  if (!reasons.length) reasons.push("A grounded choice from your archive");
  return { item, episode, minutes, score, reasons, artwork: artFor(item) };
}

function choose(deck, used, predicate, lane, fallback, usedWings = null) {
  const available = deck.filter(entry => !used.has(entry.item.id));
  const distinct = usedWings ? available.filter(entry => !usedWings.has(entry.item.wing)) : available;
  const rank = fallback || ((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));
  const match = distinct.filter(predicate).sort(rank)[0]
    || available.filter(predicate).sort(rank)[0]
    || distinct.sort(rank)[0]
    || available.sort(rank)[0];
  if (!match) return null;
  used.add(match.item.id);
  usedWings?.add(match.item.wing);
  return { ...match, lane };
}

export function buildTonightDeck(state = getState()) {
  const preferences = lifePreferences(state);
  const candidates = Object.values(state.items || {}).filter(item => MEDIA_WINGS.has(item.wing) && usefulTitle(item)).map(item => candidateFor(item, preferences, state));
  const used = new Set(), usedWings = new Set(), dateSeed = new Date().toLocaleDateString("en-CA");
  return [
    choose(candidates, used, entry => entry.item.status === "in_progress" || Boolean(entry.episode?.sourcePath), "CONTINUE", null, usedWings),
    choose(candidates, used, entry => entry.item.favorite || Number(entry.item.rating) >= 8 || entry.item.owned, "COMFORT", null, usedWings),
    choose(candidates, used, entry => entry.minutes <= Math.min(45, preferences.timeAvailable) && entry.item.wing !== "movies", "SHORT", null, usedWings),
    choose(candidates, used, entry => !entry.item.owned && entry.item.status !== "completed", "DISCOVER", null, usedWings),
    choose(candidates, used, () => true, "WILDCARD", (a, b) => (hash(`${dateSeed}|${b.item.id}`) % 1000 + b.score) - (hash(`${dateSeed}|${a.item.id}`) % 1000 + a.score), usedWings)
  ].filter(Boolean);
}

export function getTonightModel(state = getState()) {
  const preferences = lifePreferences(state);
  const deck = buildTonightDeck(state), playback = getPlaybackPrompt(state), life = getLifeDashboardModel(state);
  const prioritized = [...deck.map(entry => entry.item), ...Object.values(state.items || {}).filter(item => item.favorite || item.status === "in_progress")];
  const artwork = [...new Map(prioritized.filter(item => MEDIA_WINGS.has(item.wing) && !artFor(item) && usefulTitle(item)).map(item => [item.id, item])).values()].slice(0, 8);
  const tv = Object.values(state.items || {}).filter(item => item.wing === "tv" && usefulTitle(item)).map(item => candidateFor(item, preferences, state)).filter(entry => entry.episode?.sourcePath).sort((a, b) => b.score - a.score).slice(0, 8);
  const ids = Object.keys(state.items || {}), identity = { records: ids.length, unique: new Set(ids).size, missingArtwork: Object.values(state.items || {}).filter(item => MEDIA_WINGS.has(item.wing) && !artFor(item)).length };
  return { deck, playback, artwork, tv, identity, pulse: state.metadata?.lifeDashboard?.libraryPulse || null, life, preferences };
}

function poster(item, artwork) {
  return `<i class="tonight-poster" style="--h:${hash(item.title) % 360}">${artwork ? `<img src="${esc(artwork)}" alt="">` : `<span>${esc(item.title.split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase())}</span>`}</i>`;
}

function choiceCard(entry, featured = false) {
  const { item, episode } = entry;
  return `<article class="tonight-choice ${featured ? "featured" : ""}">${poster(item, entry.artwork)}<div class="tonight-choice__copy"><span class="eyebrow">${entry.lane} // ${esc(item.wing.toUpperCase())}</span><h3>${esc(item.title)}</h3><p>${esc(entry.reasons[0])}</p><div class="tonight-choice__meta"><span>~${entry.minutes} MIN</span>${episode ? `<span>${codeFor(episode)}</span>` : ""}${item.genres?.[0] ? `<span>${esc(item.genres[0])}</span>` : ""}</div><details><summary>WHY THIS?</summary><p>${esc(entry.reasons.join(" · "))}</p></details><div class="button-row">${episode?.sourcePath ? `<button class="button primary couch-action" data-living-play data-show-id="${esc(item.id)}" data-episode-id="${esc(episode.id)}" data-media-path="${esc(episode.sourcePath)}">PLAY ${codeFor(episode)}</button>` : `<button class="button primary couch-action" data-route="record/${encodeURIComponent(item.id)}">OPEN</button>`}${item.wing === "tv" ? `<button class="button couch-action" data-route="tv/${encodeURIComponent(item.id)}">SERIES</button>` : `<button class="button couch-action" data-route="record/${encodeURIComponent(item.id)}">DETAILS</button>`}</div></div></article>`;
}

function playbackPrompt(prompt) {
  if (!prompt) return "";
  return `<section class="playback-followup"><div><span class="eyebrow">WELCOME BACK</span><h2>DID YOU FINISH ${esc(prompt.code)}?</h2><p><b>${esc(prompt.show.title)}</b>${prompt.episode.title ? ` · ${esc(prompt.episode.title)}` : ""}. The Vault will only update it when you choose.</p></div><div class="playback-followup__rating"><span>EPISODE RATING</span><div>${Array.from({ length: 10 }, (_, index) => `<button class="couch-action ${prompt.rating >= index + 1 ? "active" : ""}" data-playback-rating="${index + 1}" data-playback-session="${esc(prompt.id)}" aria-label="Rate episode ${index + 1} of 10">${index + 1}</button>`).join("")}</div></div><div class="button-row"><button class="button primary couch-action" data-playback-decision="finished" data-playback-session="${esc(prompt.id)}">YES, FINISHED</button><button class="button couch-action" data-playback-decision="not_yet" data-playback-session="${esc(prompt.id)}">NOT YET</button></div></section>`;
}

export function renderTonight() {
  const model = getTonightModel(), prefs = model.preferences;
  return `<div class="tonight-shell">${playbackPrompt(model.playback)}<section class="tonight-hero"><div><span class="eyebrow">LIVING ROOM EDITION</span><h2>WHAT FITS<br><span>TONIGHT?</span></h2><p>Five grounded choices, built from your actual archive, current mood, available time, and explicit taste.</p></div><div class="tonight-controls"><div><span>TIME</span>${[30,60,120].map(value => `<button class="couch-action ${prefs.timeAvailable === value ? "active" : ""}" data-life-pref="timeAvailable" data-life-value="${value}">${value} MIN</button>`).join("")}</div><div><span>ENERGY</span>${["easy","steady","high"].map(value => `<button class="couch-action ${prefs.energy === value ? "active" : ""}" data-life-pref="energy" data-life-value="${value}">${value.toUpperCase()}</button>`).join("")}</div><div><span>MOOD</span>${["open","comfort","discover","focused"].map(value => `<button class="couch-action ${prefs.mood === value ? "active" : ""}" data-life-pref="mood" data-life-value="${value}">${value.toUpperCase()}</button>`).join("")}</div><button class="button couch-action" data-couch-mode>FULL SCREEN</button></div></section>
  <section class="tonight-deck">${model.deck.map((entry, index) => choiceCard(entry, index === 0)).join("")}</section>
  <section class="tonight-tv"><div class="tonight-section-heading"><div><span class="eyebrow">TELEVISION FIRST</span><h2>READY TO PLAY</h2></div><button class="button couch-action" data-route="tv">ALL TELEVISION</button></div><div class="tonight-tv-rail">${model.tv.map(entry => `<article>${poster(entry.item, entry.artwork)}<b>${esc(entry.item.title)}</b><small>${codeFor(entry.episode)} · ~${entry.minutes} MIN</small><button class="button primary couch-action" data-living-play data-show-id="${esc(entry.item.id)}" data-episode-id="${esc(entry.episode.id)}" data-media-path="${esc(entry.episode.sourcePath)}">PLAY</button></article>`).join("")}</div></section>
  <section class="living-foundation-grid"><article class="panel"><span class="eyebrow">LIBRARY AWARENESS</span><h3>${model.pulse ? `${model.pulse.fileCount} FILES OBSERVED` : "READY FOR FIRST CHECK"}</h3><p>${model.pulse ? `${model.pulse.linkedKnown} known episode files. ${model.pulse.informationalCount} intentional/unfiled files remain informational.` : "Compare the TV archive with D: without moving, renaming, or deleting anything."}</p><button class="button couch-action" data-life-library-check>CHECK LIBRARY</button></article><article class="panel"><span class="eyebrow">ARTWORK & IDENTITY</span><h3>${model.artwork.length ? `${model.artwork.length} PRIORITY POSTERS` : "PRIORITY ARTWORK COMPLETE"}</h3><p>${model.identity.unique}/${model.identity.records} stable record identities are unique. ${model.identity.missingArtwork} media records have no artwork yet.</p><div class="button-row">${model.artwork.slice(0, 3).map(item => `<button class="button couch-action" data-workbench-edit="${esc(item.id)}">${esc(item.title)}</button>`).join("") || `<button class="button couch-action" data-artwork-review>OPEN ARTWORK</button>`}</div></article><article class="panel"><span class="eyebrow">PERSONAL MEMORY</span><h3>${model.life.memories.length ? "YOUR HISTORY IS GROWING" : "READY TO REMEMBER"}</h3><p>${model.life.memories[0] ? `${esc(model.life.memories[0].title)} is one of your latest explicit moments.` : "Ratings, completed episodes, sessions, and favorites become truthful personal history."}</p><button class="button couch-action" data-route="timeline">OPEN MEMORY</button></article><article class="panel"><span class="eyebrow">DEVICE TRANSFER</span><h3>LOCAL FIRST</h3><p>Prepare a portable full-archive copy for another device. Live cloud sync stays off until you explicitly choose a provider later.</p><button class="button couch-action" data-life-transfer>PREPARE COPY</button></article></section></div>`;
}
