import { on } from "../core/events.js";
import { getState, update } from "../core/store.js";

const passive = new Set(["VAULT_OPENED", "WING_VISITED", "LIBRARY_SCAN_COMPLETED"]);
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function detectPersonalEras(state = getState()) {
  const groups = new Map();
  for (const event of state.events || []) {
    if (passive.has(event.type)) continue;
    const date = new Date(event.timestamp);
    if (!Number.isFinite(date.getTime())) continue;
    const quarter = Math.floor(date.getMonth() / 3) + 1, key = `${date.getFullYear()}-Q${quarter}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  return [...groups.entries()].filter(([, events]) => events.length >= 3).map(([period, events]) => {
    events.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    const wings = new Map(), genres = new Map(), items = new Set();
    for (const event of events) {
      const wing = event.wing || state.items[event.itemId]?.wing;
      if (wing) wings.set(wing, (wings.get(wing) || 0) + 1);
      if (event.itemId) {
        items.add(event.itemId);
        (state.items[event.itemId]?.genres || []).forEach(genre => genres.set(genre, (genres.get(genre) || 0) + 1));
      }
    }
    const topWing = [...wings.entries()].sort((a, b) => b[1] - a[1])[0] || ["archive", 0];
    const topGenre = [...genres.entries()].sort((a, b) => b[1] - a[1])[0] || [null, 0];
    return {
      id: `era_${period.toLowerCase().replace("-", "_")}`, period,
      title: topGenre[0] ? `${topGenre[0]} Season` : `${topWing[0].toUpperCase()} Period`,
      eventCount: events.length, itemCount: items.size, topWing: topWing[0], topGenre: topGenre[0],
      evidence: { eventIds: events.map(event => event.id), firstAt: events[0].timestamp, lastAt: events.at(-1).timestamp }
    };
  }).sort((a, b) => b.period.localeCompare(a.period));
}

export function renderEras() {
  if (location.hash !== "#/eras") return;
  const eras = detectPersonalEras();
  document.querySelector("#view").innerHTML = `<section class="time-hero panel"><div><span class="eyebrow">STAGE 25 // CANONICAL PERIODS</span><h2>PERSONAL ERAS</h2><p>Eras appear only when the reconstructed Vault witnessed at least three meaningful events in a quarter.</p></div><div class="time-clock">E</div></section>
    <section class="panel voice-policy"><b>NO RETROACTIVE DATES.</b><span>Imported records without canonical timestamps cannot create an era.</span></section>
    <div class="era-grid">${eras.map(era => `<article class="panel era-card"><small>${era.period} · ${era.eventCount} EVENTS</small><h3>${esc(era.title)}</h3><p>${era.itemCount} distinct records · strongest wing: ${esc(era.topWing)}</p><details><summary>SHOW EVENT EVIDENCE</summary><pre>${esc(JSON.stringify(era.evidence, null, 2))}</pre></details></article>`).join("") || `<div class="panel empty"><b>NO ERA HAS ENOUGH EVIDENCE YET.</b>The Time Machine will recognize one when canonical history becomes dense enough.</div>`}</div>`;
  document.querySelector("#view-title").textContent = "Personal Eras";
  document.querySelector("#view-code").textContent = "VAULT://ERAS";
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  if (!document.querySelector("link[data-temporal-styles]")) { const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "./css/temporal.css"; link.dataset.temporalStyles = ""; document.head.append(link); }
  if (!getState().metadata.stage25) update(save => { save.metadata.stage25 = { startedAt: new Date().toISOString(), canonicalOnly: true, minimumEvents: 3 }; });
  on("WING_VISITED", event => { if (event.wing === "eras") setTimeout(renderEras, 0); });
  window.addEventListener("hashchange", () => setTimeout(renderEras, 0)); setTimeout(renderEras, 100); return true;
}
function schedule(attempt = 0) { if (install() || attempt >= 200) return; setTimeout(() => schedule(attempt + 1), 25); }
setTimeout(() => schedule(), 0);
