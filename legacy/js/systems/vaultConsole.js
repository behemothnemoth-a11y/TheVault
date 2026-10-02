import { emit, on } from "../core/events.js";
import { getState, update } from "../core/store.js";
import { openModal } from "../ui/modals.js";
import { runHealthCheck } from "./health.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

function showRecords(title, records, reason) {
  openModal({
    title,
    body: `<p>${esc(reason)}</p>${records.slice(0, 30).map(item => `<article class="snapshot-row"><div><b>${esc(item.title)}</b><small>${esc(item.wing.toUpperCase())} · ${esc((item.genres || []).join(" · ") || "UNFILED")} · ${item.year || "YEAR UNKNOWN"}</small></div></article>`).join("") || `<div class="empty"><b>NO RECORDS ANSWERED.</b>Try a broader command.</div>`}`
  });
}

function parseQuery(query) {
  const state = getState();
  const items = Object.values(state.items || {}).filter(item => !item.id.startsWith("tv_drive_"));
  if (query === "basement") return {
    label: "basement", hint: "CLASSIFIED ROUTE", run: () => { location.hash = "#/basement"; }
  };
  if (query === "health") return {
    label: "health", hint: "RUN ARCHIVE HEALTH", run: () => {
      const result = runHealthCheck();
      openModal({ title: result.ok ? "ARCHIVE HEALTH: NOMINAL" : "ARCHIVE HEALTH: ATTENTION", body: result.ok ? `<p>${result.checked} records and ${result.episodes} episodes passed.</p>` : `<p>${result.issues.map(esc).join("<br>")}</p>` });
    }
  };
  const random = query.match(/^random(?:\s+(.+))?$/);
  if (random) {
    const filter = (random[1] || "").trim();
    const candidates = items.filter(item => !filter || item.wing === filter || (item.genres || []).some(genre => genre.toLowerCase().includes(filter)));
    return { label: query, hint: `${candidates.length} ELIGIBLE`, run: () => {
      if (!candidates.length) return showRecords("THE VAULT FOUND NOTHING", [], query);
      let hash = 2166136261; for (const char of `${query}|${new Date().toISOString().slice(0, 10)}`) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
      showRecords("THE VAULT HAS SELECTED", [candidates[(hash >>> 0) % candidates.length]], filter ? `Matched ${filter}.` : "Daily deterministic selection.");
    }};
  }
  const show = query.match(/^show\s+(unfinished\s+)?(?:(.+?)\s+)?before\s+(\d{4})$/);
  if (show) {
    const unfinished = Boolean(show[1]), filter = (show[2] || "").trim(), year = Number(show[3]);
    const records = items.filter(item => (!unfinished || item.status !== "completed") && Number(item.year) < year &&
      (!filter || item.wing === filter || (item.genres || []).some(genre => genre.toLowerCase().includes(filter))));
    return { label: query, hint: `${records.length} MATCHES`, run: () => showRecords("STRUCTURED ARCHIVE QUERY", records, `${unfinished ? "Unfinished · " : ""}${filter || "any wing"} · before ${year}`) };
  }
  if (/^oldest(?:\s+\w+)?$/.test(query)) {
    const wing = query.split(/\s+/)[1];
    const records = items.filter(item => !wing || item.wing === wing || item.type === wing).sort((a, b) => Number(a.year || 9999) - Number(b.year || 9999));
    return { label: query, hint: "OLDEST RECORD", run: () => showRecords("OLDEST ARCHIVE RECORD", records.slice(0, 10), wing ? `Wing: ${wing}` : "All wings") };
  }
  return null;
}

export function renderBasement() {
  if (location.hash !== "#/basement") return;
  const state = getState();
  if (!state.metadata.stage14.basementFoundAt) {
    update(save => { save.metadata.stage14.basementFoundAt = new Date().toISOString(); });
    emit("BASEMENT_FOUND", { meta: { title: "The Basement" } });
  }
  const abandoned = Object.values(state.items || {}).filter(item => item.status === "abandoned").length;
  const untitled = Object.values(state.items || {}).filter(item => !item.year).length;
  document.querySelector("#view").innerHTML = `<section class="basement panel"><span class="eyebrow">CLEARANCE ???</span><h2>THE BASEMENT</h2><p>You found the part of the archive that insists it was never built.</p>
    <div><article><b>${abandoned}</b><span>ABANDONED RECORDS</span></article><article><b>${untitled}</b><span>DATELESS OBJECTS</span></article><article><b>${state.metadata.stage5?.summary?.unmatchedFiles || 0}</b><span>FILES WITHOUT NAMES WE TRUST</span></article></div><small>There is nothing useful down here. That is not the same as nothing.</small></section>`;
  document.querySelector("#view-title").textContent = "???";
  document.querySelector("#view-code").textContent = "VAULT://BASEMENT";
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  if (!document.querySelector("link[data-basement-styles]")) { const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "./css/basement.css"; link.dataset.basementStyles = ""; document.head.append(link); }
  if (!getState().metadata.stage14) update(save => { save.metadata.stage14 = { startedAt: new Date().toISOString(), structuredConsole: true, basementFoundAt: null }; });
  window.vaultStructuredCommand = raw => parseQuery(String(raw || "").trim().toLowerCase());
  on("WING_VISITED", event => { if (event.wing === "basement") setTimeout(renderBasement, 0); });
  window.addEventListener("hashchange", () => setTimeout(renderBasement, 0));
  setTimeout(renderBasement, 100);
  return true;
}
function schedule(attempt = 0) { if (install() || attempt >= 200) return; setTimeout(() => schedule(attempt + 1), 25); }
setTimeout(() => schedule(), 0);
