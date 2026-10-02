import { on } from "../core/events.js";
import { getState, update } from "../core/store.js";

const rooms = {
  youtube: ["YOU TUBE VAULT", "Recovered viewing history will live here without being mixed into movies or television."],
  music: ["LISTENING ROOM", "Albums, songs, concerts, and listening memories."],
  podcasts: ["RADIO ARCHIVE", "Shows, episodes, notes, and abandoned queues."],
  manga: ["MANGA STACKS", "Volumes, chapters, editions, and reading progress."],
  food: ["TEST KITCHEN", "Recipes, restaurants, experiments, and meals worth remembering."],
  trips: ["WORLD MAP", "Trips, places, photographs, and real-world archive events."],
  calendar: ["ARCHIVE CALENDAR", "Canonical activity arranged by month and year."]
};
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
let selectedYear = "all";

function renderRoom(route) {
  const state = getState();
  const items = Object.values(state.items || {}).filter(item => item.wing === route);
  const events = (state.events || []).filter(event => event.wing === route);
  const [title, description] = rooms[route];
  const recent = events.slice(-12).reverse();
  document.querySelector("#view").innerHTML = `<section class="room-hero panel room-${route}"><span class="eyebrow">STAGE 16 // EXPANDABLE WING</span><h2>${title}</h2><p>${description}</p></section>
    <div class="voice-vitals"><div class="panel"><b>${items.length}</b><span>RECORDS</span></div><div class="panel"><b>${events.length}</b><span>EVENTS</span></div><div class="panel"><b>${items.filter(item => item.status === "completed").length}</b><span>ARCHIVED</span></div></div>
    <section class="panel">${items.length ? `<div class="discover-grid">${items.slice(0, 60).map(item => `<article class="discover-card panel"><span>${esc(item.type || route)}</span><b>${esc(item.title)}</b><small>${item.year || "UNDATED"}</small></article>`).join("")}</div>` : `<div class="empty"><b>THIS WING IS READY, NOT FABRICATED.</b>No ${route} records have been imported yet. Its stable schema and event channel are waiting.</div>`}</section>
    ${recent.length ? `<section class="panel ops-history"><h3>RECENT WING SIGNALS</h3>${recent.map(event => `<article class="ops-ledger"><span>${new Date(event.timestamp).toLocaleString()}</span><b>${esc(event.type.replaceAll("_", " "))}</b><small>${esc(event.meta?.title || "")}</small></article>`).join("")}</section>` : ""}`;
  document.querySelector("#view-title").textContent = title;
  document.querySelector("#view-code").textContent = `VAULT://${route.toUpperCase()}`;
}

export function getArchiveReport(state = getState(), year = selectedYear) {
  const events = (state.events || []).filter(event => year === "all" || new Date(event.timestamp).getFullYear() === Number(year));
  const items = Object.values(state.items || {}).filter(item => !item.id.startsWith("tv_drive_"));
  const wingCounts = new Map(), typeCounts = new Map(), genreCounts = new Map();
  events.forEach(event => wingCounts.set(event.wing || "system", (wingCounts.get(event.wing || "system") || 0) + 1));
  items.forEach(item => {
    typeCounts.set(item.wing, (typeCounts.get(item.wing) || 0) + 1);
    (item.genres || []).forEach(genre => genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1));
  });
  const rated = items.filter(item => Number(item.rating) >= 1);
  return {
    events, items,
    completed: items.filter(item => item.status === "completed").length,
    average: rated.length ? (rated.reduce((sum, item) => sum + Number(item.rating), 0) / rated.length).toFixed(1) : "—",
    wings: [...typeCounts.entries()].sort((a, b) => b[1] - a[1]),
    activeWings: [...wingCounts.entries()].sort((a, b) => b[1] - a[1]),
    genres: [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  };
}

function renderStats() {
  const state = getState();
  const years = [...new Set((state.events || []).map(event => new Date(event.timestamp).getFullYear()))].filter(Number.isFinite).sort((a, b) => b - a);
  const report = getArchiveReport(state);
  document.querySelector("#view").innerHTML = `<section class="ops-hero panel"><span class="eyebrow">STAGE 16 // PERSONAL YEARBOOK</span><h2>ARCHIVE STATISTICS</h2><p>Counts come from current records; activity comes only from canonical events the reconstructed Vault witnessed.</p></section>
    <section class="panel stats-filter"><button class="button ${selectedYear === "all" ? "primary" : ""}" data-stats-year="all">ALL TIME</button>${years.map(year => `<button class="button ${selectedYear === String(year) ? "primary" : ""}" data-stats-year="${year}">${year}</button>`).join("")}</section>
    <div class="voice-vitals"><div class="panel"><b>${report.items.length}</b><span>RECORDS</span></div><div class="panel"><b>${report.completed}</b><span>ARCHIVED</span></div><div class="panel"><b>${report.events.length}</b><span>${selectedYear === "all" ? "CANONICAL EVENTS" : `${selectedYear} EVENTS`}</span></div></div>
    <div class="stats-columns"><section class="panel"><h3>WING POPULATION</h3>${report.wings.map(([wing, count]) => `<div><span>${esc(wing.toUpperCase())}</span><b>${count}</b></div>`).join("")}</section>
    <section class="panel"><h3>ACTIVITY SIGNAL</h3>${report.activeWings.map(([wing, count]) => `<div><span>${esc(wing.toUpperCase())}</span><b>${count}</b></div>`).join("") || "<p>THE ARCHIVE HAS BEEN QUIET.</p>"}</section>
    <section class="panel"><h3>LARGEST SHELVES</h3>${report.genres.map(([genre, count]) => `<div><span>${esc(genre)}</span><b>${count}</b></div>`).join("")}</section></div>`;
  document.querySelector("#view-title").textContent = "Archive Statistics";
  document.querySelector("#view-code").textContent = "VAULT://STATS";
}

function renderCurrent() {
  const route = location.hash.replace(/^#\//, "");
  if (route === "stats") renderStats();
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  if (!document.querySelector("link[data-expanded-styles]")) {
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "./css/expanded-archive.css"; link.dataset.expandedStyles = ""; document.head.append(link);
  }
  if (!getState().metadata.stage16) update(save => { save.metadata.stage16 = { startedAt: new Date().toISOString(), expandableWings: Object.keys(rooms), truthfulReports: true }; });
  on("WING_VISITED", event => { if (event.wing === "stats") setTimeout(renderCurrent, 0); });
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-stats-year]");
    if (!button) return;
    selectedYear = button.dataset.statsYear; renderStats();
  }, true);
  window.addEventListener("hashchange", () => setTimeout(renderCurrent, 0));
  setTimeout(renderCurrent, 100);
  return true;
}
function schedule(attempt = 0) { if (install() || attempt >= 200) return; setTimeout(() => schedule(attempt + 1), 25); }
setTimeout(() => schedule(), 0);
