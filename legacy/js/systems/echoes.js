import { on } from "../core/events.js";
import { getState, update } from "../core/store.js";

const passive = new Set(["VAULT_OPENED", "WING_VISITED", "LIBRARY_SCAN_COMPLETED"]);

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function buildEchoReport(state = getState(), now = new Date()) {
  const canonical = (state.events || [])
    .filter(event => !passive.has(event.type) && Number.isFinite(Date.parse(event.timestamp)))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const anniversaries = canonical.filter(event => {
    const date = new Date(event.timestamp);
    return date.getFullYear() < now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  });
  const yearly = new Map(), ratings = new Map(), visits = new Map();
  for (const event of canonical) {
    const year = new Date(event.timestamp).getFullYear();
    yearly.set(year, (yearly.get(year) || 0) + 1);
    const rating = Number(event.meta?.to);
    if (["ITEM_RATED", "RATING_CHANGED"].includes(event.type) && Number.isFinite(rating) && rating >= 1) {
      if (!ratings.has(year)) ratings.set(year, []);
      ratings.get(year).push(rating);
    }
    if (event.itemId && ["ITEM_COMPLETED", "EPISODE_COMPLETED", "RATING_CHANGED"].includes(event.type)) {
      if (!visits.has(event.itemId)) visits.set(event.itemId, []);
      visits.get(event.itemId).push(event);
    }
  }
  const ratingYears = [...ratings.entries()].map(([year, values]) => ({ year, count: values.length, average: values.reduce((a, b) => a + b, 0) / values.length })).sort((a, b) => a.year - b.year);
  const revisits = [...visits.entries()].filter(([, events]) => events.length >= 2).map(([itemId, events]) => ({ itemId, title: state.items[itemId]?.title || itemId, count: events.length, firstAt: events[0].timestamp, lastAt: events.at(-1).timestamp }));
  return { anniversaries, yearly: [...yearly.entries()].sort((a, b) => b[0] - a[0]), ratingYears, revisits };
}

export function renderEchoes() {
  if (location.hash !== "#/echoes") return;
  const report = buildEchoReport();
  document.querySelector("#view").innerHTML = `<section class="time-hero panel"><div><span class="eyebrow">STAGE 26 // ANNIVERSARIES & CHANGE</span><h2>ARCHIVAL ECHOES</h2><p>Comparisons use canonical dates and recorded rating changes only.</p></div><div class="time-clock">⌛</div></section>
    <div class="voice-vitals"><div class="panel"><b>${report.anniversaries.length}</b><span>ON THIS DAY</span></div><div class="panel"><b>${report.revisits.length}</b><span>REVISITED RECORDS</span></div><div class="panel"><b>${report.ratingYears.length}</b><span>RATED YEARS</span></div></div>
    <div class="echo-columns"><section class="panel"><h3>ON THIS DAY</h3>${report.anniversaries.map(event => `<p><b>${esc(event.meta?.title || event.type)}</b><small>${new Date(event.timestamp).toLocaleDateString()}</small></p>`).join("") || "<p>NO ARCHIVAL ECHO TODAY.</p>"}</section>
    <section class="panel"><h3>TASTE EVOLUTION</h3>${report.ratingYears.map(row => `<p><b>${row.year}</b><span>${row.average.toFixed(1)} AVG · ${row.count} RATINGS</span></p>`).join("") || "<p>NOT ENOUGH TIMESTAMPED RATINGS.</p>"}</section>
    <section class="panel"><h3>REVISITS</h3>${report.revisits.slice(0, 30).map(row => `<p><b>${esc(row.title)}</b><span>${row.count} SIGNALS · ${new Date(row.firstAt).toLocaleDateString()} → ${new Date(row.lastAt).toLocaleDateString()}</span></p>`).join("") || "<p>NO REVISITS WITNESSED YET.</p>"}</section></div>`;
  document.querySelector("#view-title").textContent = "Archival Echoes"; document.querySelector("#view-code").textContent = "VAULT://ECHOES";
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  if (!getState().metadata.stage26) update(save => { save.metadata.stage26 = { startedAt: new Date().toISOString(), canonicalOnly: true, importedDatesExcluded: true }; });
  on("WING_VISITED", event => { if (event.wing === "echoes") setTimeout(renderEchoes, 0); });
  window.addEventListener("hashchange", () => setTimeout(renderEchoes, 0)); setTimeout(renderEchoes, 100); return true;
}
function schedule(attempt = 0) { if (install() || attempt >= 200) return; setTimeout(() => schedule(attempt + 1), 25); }
setTimeout(() => schedule(), 0);
