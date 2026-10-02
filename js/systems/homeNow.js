import { escapeHtml as esc } from "../ui/safeHtml.js";
import { buildTonightDeck } from "./livingRoom.js";
import { DAILY_DESK_MODES, getDailyDeskModel } from "./dailyDesk.js";

const localArtwork = item => {
  const value = typeof item?.artwork === "string"
    ? item.artwork
    : item?.artwork?.localPath || item?.artwork?.url || "";
  return /^(?:\.\/)?assets\//.test(value) || /^\/assets\//.test(value) ? value : "";
};

const initials = title => String(title || "")
  .split(/\s+/).filter(Boolean).slice(0, 2)
  .map(word => word[0]).join("").toUpperCase();

const codeFor = episode => episode
  ? `S${String(episode.season).padStart(2, "0")}E${String(episode.number).padStart(2, "0")}`
  : "";

function pickCard(entry) {
  const item = entry.item, episode = entry.episode, art = localArtwork(item);
  const action = episode?.sourcePath
    ? `<button class="home-now-primary" data-living-play data-show-id="${esc(item.id)}" data-episode-id="${esc(episode.id)}" data-media-path="${esc(episode.sourcePath)}">PLAY ${esc(codeFor(episode))}</button>`
    : `<button class="home-now-primary" data-route="record/${encodeURIComponent(item.id)}">OPEN</button>`;  return `<article class="home-now-pick">
    <i class="home-now-art">${art ? `<img src="${esc(art)}" alt="">` : `<span>${esc(initials(item.title))}</span>`}</i>
    <div class="home-now-pick-copy">
      <span class="eyebrow">${esc(entry.lane)} · ${esc(item.wing.toUpperCase())}</span>
      <h3>${esc(item.title)}</h3>
      <p>${esc(entry.reasons?.[0] || "A grounded choice from your archive.")}</p>
      <small>~${entry.minutes} MIN${episode ? ` · ${esc(codeFor(episode))}` : ""}</small>
      <div class="home-now-actions">${action}</div>
    </div>
  </article>`;
}

function controlGroup(label, key, values, active, formatter = value => String(value).toUpperCase()) {
  return `<div class="home-now-control"><span>${esc(label)}</span><div>${values.map(value =>
    `<button class="${String(active) === String(value) ? "active" : ""}" data-life-pref="${esc(key)}" data-life-value="${esc(String(value))}">${esc(formatter(value))}</button>`
  ).join("")}</div></div>`;
}

function todayEntry(entry) {
  const item = entry.item;
  return `<button class="home-today-entry" data-route="record/${encodeURIComponent(item.id)}">
    <span>${esc(String(entry.lane || "").toUpperCase())} · ${esc(item.wing.toUpperCase())}</span>
    <b>${esc(item.title)}</b>
    <small>${esc(entry.reasons?.[0] || "Ready from Today's plan.")}</small>
  </button>`;
}export function renderHomeNow(state) {
  const preferences = state.metadata?.lifeDashboard?.preferences || {
    timeAvailable: 60, energy: "steady", mood: "open"
  };
  const deck = buildTonightDeck(state).slice(0, 4);
  const desk = getDailyDeskModel(state);
  const today = desk.entries.slice(0, 2);
  const mode = DAILY_DESK_MODES[desk.mode]?.label || String(desk.mode || "balanced").toUpperCase();

  return `<section class="home-now">
    <header class="home-now-head">
      <div><span class="eyebrow">RIGHT NOW // SHARED WITH TONIGHT</span><h2>WHAT FITS RIGHT NOW?</h2>
      <p>Change the time, energy, or mood here and Tonight uses the same settings.</p></div>
      <button class="home-now-open" data-route="tonight">OPEN TONIGHT</button>
    </header>
    <div class="home-now-controls">
      ${controlGroup("TIME", "timeAvailable", [30, 60, 120], preferences.timeAvailable, value => `${value} MIN`)}
      ${controlGroup("ENERGY", "energy", ["easy", "steady", "high"], preferences.energy)}
      ${controlGroup("MOOD", "mood", ["open", "comfort", "discover", "focused"], preferences.mood)}
    </div>
    <div class="home-now-grid">${deck.map(pickCard).join("") || `<div class="home-now-empty">No eligible picks yet.</div>`}</div>
  </section>
  <section class="home-today-strip">
    <header><div><span class="eyebrow">TODAY // ${esc(mode)}</span><h2>NEXT UP TODAY</h2></div>
    <button data-route="today">OPEN TODAY</button></header>
    <div>${today.map(todayEntry).join("") || `<p>Today's plan has no eligible records yet.</p>`}</div>
  </section>`;
}
