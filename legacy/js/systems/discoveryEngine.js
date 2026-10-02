import { getState, update } from "../core/store.js";

let mode = "chaos";
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const artworkUrl = item => typeof item.artwork === "string" ? item.artwork : item.artwork?.localPath || item.artwork?.url || "";

function completedRatio(item) {
  const episodes = Object.values(item.episodes || {});
  if (episodes.length) return episodes.filter(entry => entry.status === "completed").length / episodes.length;
  return item.status === "completed" ? 1 : 0;
}

export function buildDynamicCollections(candidate = getState()) {
  const items = Object.values(candidate.items || {}).filter(item => !item.id.startsWith("tv_drive_"));
  const collections = [
    { id: "owned_unfinished", title: "Owned & Unfinished", reason: "Ready on your shelves", items: items.filter(item => item.owned && completedRatio(item) < 1) },
    { id: "almost_there", title: "Almost There", reason: "More than 70% complete", items: items.filter(item => { const ratio = completedRatio(item); return ratio >= .7 && ratio < 1; }) },
    { id: "deep_archive", title: "Deep Archive", reason: "Unrated backlog records", items: items.filter(item => item.status !== "completed" && item.rating == null) },
    { id: "favorites", title: "High Signal", reason: "Rated 8 or higher", items: items.filter(item => Number(item.rating) >= 8) }
  ];
  const genreCounts = new Map();
  items.forEach(item => (item.genres || []).forEach(genre => genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1)));
  for (const [genre] of [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    collections.push({
      id: `genre_${genre.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      title: genre, reason: "Genre shelf", items: items.filter(item => (item.genres || []).includes(genre))
    });
  }
  return collections;
}

export function getDiscoveryCandidates(selectedMode = mode, candidate = getState()) {
  const items = Object.values(candidate.items || {}).filter(item => !item.id.startsWith("tv_drive_"));
  const now = Date.now();
  const scored = items.map(item => {
    const ratio = completedRatio(item);
    const eventTimes = (candidate.events || []).filter(event => event.itemId === item.id).map(event => Date.parse(event.timestamp) || now);
    const lastTouch = eventTimes.length ? Math.max(...eventTimes) : Date.parse(item.createdAt || 0) || 0;
    const ageDays = Math.max(0, (now - lastTouch) / 86400000);
    let score = 0;
    let reason = "";
    if (selectedMode === "almost") { score = ratio > 0 && ratio < 1 ? ratio * 100 : -1; reason = `${Math.round(ratio * 100)}% complete`; }
    else if (selectedMode === "comfort") { score = Number(item.rating || 0) * 12 + Number(item.rewatches || 0) * 5; reason = "High personal signal"; }
    else if (selectedMode === "archaeology") { score = ageDays; reason = ageDays ? `Untouched for ${Math.floor(ageDays)} days` : "No recorded activity"; }
    else if (selectedMode === "deepcut") { score = item.rating == null && item.status !== "completed" ? 80 : 0; reason = "Unrated backlog deep cut"; }
    else {
      let hash = 2166136261;
      for (const character of `${item.id}|${new Date().toISOString().slice(0, 10)}`) {
        hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619);
      }
      score = hash >>> 0; reason = "Daily deterministic shuffle";
    }
    return { item, score, reason };
  });
  return scored.filter(entry => entry.score >= 0).sort((a, b) => b.score - a.score).slice(0, 24);
}

export function renderDiscoveryEngine() {
  if (location.hash !== "#/discover") return;
  const state = getState();
  const candidates = getDiscoveryCandidates(mode, state);
  const collections = buildDynamicCollections(state);
  const card = ({ item, reason }) => {
    const art = artworkUrl(item);
    return `<article class="discover-card panel">${art ? `<img src="${esc(art)}" alt="">` : `<div class="discover-placeholder">${esc(item.title.slice(0, 2))}</div>`}<span>${esc(item.wing.toUpperCase())} · ${esc((item.genres || [])[0] || "UNFILED")}</span><b>${esc(item.title)}</b><small>${esc(reason)}</small>${item.wing === "tv" ? `<button class="button" data-open-series="${item.id}">OPEN SERIES</button>` : ""}</article>`;
  };
  document.querySelector("#view").innerHTML = `<section class="ops-hero panel"><span class="eyebrow">STAGE 8 // EXPLAINABLE DISCOVERY</span><h2>DISCOVERY ENGINE</h2><p>Five different lenses prevent one algorithm from deciding what your archive means.</p></section>
    <section class="panel discover-modes">${[
      ["chaos", "CHAOS"], ["archaeology", "ARCHAEOLOGY"], ["almost", "ALMOST THERE"], ["comfort", "COMFORT"], ["deepcut", "DEEP CUT"]
    ].map(([id, label]) => `<button class="button ${mode === id ? "primary" : ""}" data-discovery-mode="${id}">${label}</button>`).join("")}</section>
    <div class="discover-grid">${candidates.map(card).join("")}</div>
    <section class="panel discover-shelves"><h3>LIVE COLLECTIONS</h3><div>${collections.map(collection => `<article><b>${esc(collection.title)}</b><span>${collection.items.length} RECORDS</span><small>${esc(collection.reason)}</small></article>`).join("")}</div></section>`;
  document.querySelector("#view-title").textContent = "Discovery Engine";
  document.querySelector("#view-code").textContent = "VAULT://DISCOVER";
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  if (!document.querySelector("link[data-discovery-styles]")) {
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "./css/discovery-engine.css"; link.dataset.discoveryStyles = ""; document.head.append(link);
  }
  if (!getState().metadata.stage8) update(save => { save.metadata.stage8 = { startedAt: new Date().toISOString(), dynamicCollections: true, modes: ["chaos", "archaeology", "almost", "comfort", "deepcut"] }; });
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-discovery-mode]");
    if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation();
    mode = button.dataset.discoveryMode;
    renderDiscoveryEngine();
  }, true);
  window.addEventListener("hashchange", () => setTimeout(renderDiscoveryEngine, 0));
  setTimeout(renderDiscoveryEngine, 0);
  return true;
}
function schedule(attempt = 0) {
  if (install() || attempt >= 200) return;
  setTimeout(() => schedule(attempt + 1), 25);
}
setTimeout(() => schedule(), 0);
