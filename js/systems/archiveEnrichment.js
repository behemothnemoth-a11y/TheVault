import { on } from "../core/events.js";
import { getState, update } from "../core/store.js";
import { toast } from "../ui/notifications.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const route = () => location.hash.replace(/^#\//, "");
const artFor = item => typeof item.artwork === "string" ? item.artwork : item.artwork?.localPath || item.artwork?.url || "";
const fields = [
  { id: "title", label: "TITLE", weight: 10, test: item => Boolean(item.title?.trim()) },
  { id: "artwork", label: "POSTER", weight: 30, test: item => Boolean(artFor(item)) },
  { id: "year", label: "YEAR", weight: 15, test: item => Number(item.year) > 0 },
  { id: "genres", label: "GENRES", weight: 15, test: item => Boolean(item.genres?.length && !item.genres.every(genre => /unfiled/i.test(genre))) },
  { id: "description", label: "DESCRIPTION", weight: 20, test: item => Boolean(item.description?.trim()) },
  { id: "episode_titles", label: "EPISODE TITLES", weight: 10, applies: item => item.wing === "tv", test: item => {
    const episodes = Object.values(item.episodes || {});
    return !episodes.length || episodes.filter(episode => episode.title?.trim()).length / episodes.length >= .8;
  } }
];
let selectedWing = "all";
let selectedField = "all";
let selectedMode = "active";

function exclusionKey(itemId, field) { return `${itemId}:${field}`; }
function exclusionsFor(state) { return new Set((state.metadata.stage34?.exclusions || []).map(entry => entry.key)); }

export function analyzeArchiveEnrichment(state = getState()) {
  const excluded = exclusionsFor(state);
  const records = Object.values(state.items || {}).filter(item => !item.id.startsWith("tv_drive_")).map(item => {
    const applicable = fields.filter(field => !field.applies || field.applies(item));
    const passed = applicable.filter(field => field.test(item));
    const possible = applicable.reduce((sum, field) => sum + field.weight, 0);
    const earned = passed.reduce((sum, field) => sum + field.weight, 0);
    const missing = applicable.filter(field => !field.test(item)).map(field => field.id);
    const intentional = missing.filter(field => excluded.has(exclusionKey(item.id, field)));
    const actionable = missing.filter(field => !excluded.has(exclusionKey(item.id, field)));
    return { item, score: possible ? Math.round(earned / possible * 100) : 100, missing, intentional, actionable };
  });
  const countWith = field => records.filter(record => !record.missing.includes(field)).length;
  const scoreTotal = records.reduce((sum, record) => sum + record.score, 0);
  return {
    records,
    summary: {
      records: records.length,
      average: records.length ? Math.round(scoreTotal / records.length) : 100,
      complete: records.filter(record => !record.missing.length).length,
      actionable: records.reduce((sum, record) => sum + record.actionable.length, 0),
      intentional: records.reduce((sum, record) => sum + record.intentional.length, 0),
      artwork: countWith("artwork"),
      descriptions: countWith("description")
    }
  };
}

function fieldLabel(id) { return fields.find(field => field.id === id)?.label || id.replaceAll("_", " ").toUpperCase(); }
function itemSearchText(item) { return `${item.title} ${item.year || ""} ${item.wing} ${(item.genres || []).join(" ")}`.toLowerCase(); }

function renderRecord(record, mode) {
  const { item, score } = record;
  const taskFields = mode === "intentional" ? record.intentional : record.actionable;
  const art = artFor(item);
  return `<article class="enrichment-card panel"><div class="enrichment-poster" style="--h:${[...item.title].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 360}">${art ? `<img src="${esc(art)}" alt="">` : esc(item.title.slice(0, 2))}</div><div class="enrichment-copy"><span class="eyebrow">${esc(item.wing.toUpperCase())} // ${score}% COMPLETE</span><h3>${esc(item.title)}</h3><small>${item.year || "UNDATED"} · ${esc(item.genres?.join(" · ") || "UNFILED")}</small><div class="enrichment-fields">${taskFields.map(field => mode === "intentional" ? `<button data-enrichment-restore="${esc(exclusionKey(item.id, field))}" title="Return this field to the active queue">${fieldLabel(field)} · RESTORE</button>` : `<button data-enrichment-exclude="${esc(exclusionKey(item.id, field))}" title="Mark this blank as intentional">${fieldLabel(field)} · INTENTIONAL?</button>`).join("")}</div><div class="button-row"><button class="button primary" data-workbench-edit="${item.id}">EDIT RECORD</button>${item.wing === "tv" && taskFields.includes("episode_titles") ? `<button class="button" data-open-series="${item.id}">OPEN EPISODES</button>` : ""}${taskFields.includes("artwork") ? `<button class="button" data-artwork-review>POSTER CURATOR</button>` : ""}</div></div></article>`;
}

export function renderArchiveEnrichment() {
  if (route() !== "enrichment") return;
  const state = getState(), report = analyzeArchiveEnrichment(state), query = (document.querySelector("#global-search")?.value || "").trim().toLowerCase();
  const wings = [...new Set(report.records.map(record => record.item.wing))].sort();
  let records = report.records.filter(record => selectedMode === "intentional" ? record.intentional.length : record.actionable.length);
  if (selectedWing !== "all") records = records.filter(record => record.item.wing === selectedWing);
  if (selectedField !== "all") records = records.filter(record => (selectedMode === "intentional" ? record.intentional : record.actionable).includes(selectedField));
  if (query) records = records.filter(record => itemSearchText(record.item).includes(query));
  records.sort((a, b) => {
    const artworkPriority = Number(b.actionable.includes("artwork")) - Number(a.actionable.includes("artwork"));
    return selectedMode === "active" && artworkPriority ? artworkPriority : a.score - b.score || a.item.title.localeCompare(b.item.title);
  });
  const visible = records.slice(0, 80), summary = report.summary;
  document.querySelector("#view").innerHTML = `<section class="enrichment-hero panel"><div><span class="eyebrow">CHECKPOINT 34 // ARCHIVE ENRICHMENT</span><h2>MAKE GOOD RECORDS BETTER.</h2><p>Prioritized local editing for posters and useful catalog facts. The Vault never guesses, downloads, or requires personal notes and ratings.</p></div><div class="enrichment-score"><b>${summary.average}%</b><span>ARCHIVE COVERAGE</span></div></section>
    <div class="enrichment-vitals"><div class="panel"><b>${summary.artwork}</b><span>POSTERS</span></div><div class="panel"><b>${summary.descriptions}</b><span>DESCRIPTIONS</span></div><div class="panel"><b>${summary.complete}</b><span>COMPLETE RECORDS</span></div><div class="panel"><b>${summary.actionable}</b><span>ACTIVE OPPORTUNITIES</span></div></div>
    <section class="panel enrichment-controls"><div class="tv-filter-row"><button class="button ${selectedMode === "active" ? "primary" : ""}" data-enrichment-mode="active">ACTIVE QUEUE</button><button class="button ${selectedMode === "intentional" ? "primary" : ""}" data-enrichment-mode="intentional">INTENTIONAL BLANKS · ${summary.intentional}</button></div><label>WING<select data-enrichment-filter="wing"><option value="all">ALL WINGS</option>${wings.map(wing => `<option value="${wing}" ${selectedWing === wing ? "selected" : ""}>${esc(wing.toUpperCase())}</option>`).join("")}</select></label><label>FIELD<select data-enrichment-filter="field"><option value="all">ALL FIELDS</option>${fields.filter(field => field.id !== "title").map(field => `<option value="${field.id}" ${selectedField === field.id ? "selected" : ""}>${field.label}</option>`).join("")}</select></label><span>${records.length} MATCHING RECORDS</span></section>
    <div class="enrichment-list">${visible.map(record => renderRecord(record, selectedMode)).join("") || `<div class="panel empty"><b>THIS QUEUE IS CLEAR.</b>No records match the current filters.</div>`}</div>${records.length > visible.length ? `<div class="panel enrichment-more">SHOWING THE FIRST ${visible.length} OF ${records.length}. NARROW BY WING, FIELD, OR SEARCH.</div>` : ""}`;
  document.querySelector("#view-title").textContent = "Archive Enrichment";
  document.querySelector("#view-code").textContent = "VAULT://ENRICHMENT";
}

function setExcluded(key, excluded) {
  const split = key.lastIndexOf(":"), itemId = key.slice(0, split), field = key.slice(split + 1);
  if (!getState().items[itemId] || !fields.some(definition => definition.id === field)) return;
  update(save => {
    const current = save.metadata.stage34.exclusions || [];
    save.metadata.stage34.exclusions = excluded ? [...current.filter(entry => entry.key !== key), { key, itemId, field, excludedAt: new Date().toISOString() }] : current.filter(entry => entry.key !== key);
    save.metadata.stage34.changeLog = [...(save.metadata.stage34.changeLog || []), { key, action: excluded ? "exclude" : "restore", at: new Date().toISOString() }].slice(-1000);
  });
  toast(excluded ? "BLANK MARKED INTENTIONAL" : "FIELD RETURNED TO QUEUE", `${getState().items[itemId].title} · ${fieldLabel(field)}`);
  renderArchiveEnrichment();
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  if (!document.querySelector("link[data-enrichment-styles]")) {
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "./css/archive-enrichment.css"; link.dataset.enrichmentStyles = ""; document.head.append(link);
  }
  on("WING_VISITED", event => { if (event.wing === "enrichment") setTimeout(renderArchiveEnrichment, 0); });
  window.addEventListener("hashchange", () => setTimeout(renderArchiveEnrichment, 0));
  document.querySelector("#global-search")?.addEventListener("input", () => { if (route() === "enrichment") setTimeout(renderArchiveEnrichment, 0); });
  document.addEventListener("click", event => {
    const mode = event.target.closest("[data-enrichment-mode]")?.dataset.enrichmentMode;
    if (mode) { selectedMode = mode; renderArchiveEnrichment(); return; }
    const exclude = event.target.closest("[data-enrichment-exclude]")?.dataset.enrichmentExclude;
    if (exclude) { setExcluded(exclude, true); return; }
    const restore = event.target.closest("[data-enrichment-restore]")?.dataset.enrichmentRestore;
    if (restore) setExcluded(restore, false);
  }, true);
  document.addEventListener("change", event => {
    const filter = event.target.closest("[data-enrichment-filter]"); if (!filter) return;
    if (filter.dataset.enrichmentFilter === "wing") selectedWing = filter.value;
    if (filter.dataset.enrichmentFilter === "field") selectedField = filter.value;
    renderArchiveEnrichment();
  }, true);
  setTimeout(renderArchiveEnrichment, 100);
  return true;
}
function schedule(attempt = 0) { if (install() || attempt >= 200) return; setTimeout(() => schedule(attempt + 1), 25); }
setTimeout(() => schedule(), 0);