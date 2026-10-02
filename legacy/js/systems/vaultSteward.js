import { emit, on } from "../core/events.js";
import { createId } from "../core/ids.js";
import { getState, getStorageStatus, update } from "../core/store.js";
import { toast } from "../ui/notifications.js";
import { analyzeArchiveEnrichment } from "./archiveEnrichment.js";
import { runHealthCheck } from "./health.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const currentRoute = () => location.hash.replace(/^#\//, "");
let running = false;

function sameLocalDay(value, now = new Date()) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}
function nextDue(lastRunAt, hours) {
  return new Date((lastRunAt ? Date.parse(lastRunAt) : Date.now()) + Math.max(1, Number(hours || 24)) * 3600000).toISOString();
}
export function stewardIsDue(state = getState(), now = Date.now()) {
  const stage = state.metadata.stage35;
  return stage.enabled && (!stage.lastRunAt || !stage.nextDueAt || Date.parse(stage.nextDueAt) <= now);
}

export function buildStewardBrief(state = getState()) {
  const health = runHealthCheck(state), enrichment = analyzeArchiveEnrichment(state), storage = getStorageStatus();
  const items = Object.values(state.items || {}).filter(item => !item.id.startsWith("tv_drive_"));
  const tv = items.filter(item => item.wing === "tv"), episodes = tv.flatMap(show => Object.values(show.episodes || {}));
  const now = new Date(), todayEvents = (state.events || []).filter(event => sameLocalDay(event.timestamp, now));
  const recent = [...(state.events || [])].slice(-8).reverse().map(event => ({ id: event.id, type: event.type, title: event.meta?.title || event.itemId || "", timestamp: event.timestamp }));
  return {
    createdAt: now.toISOString(),
    health: { ok: health.ok, issueCount: health.issues.length, checked: health.checked },
    archive: { records: items.length, tvSeries: tv.length, episodes: episodes.length, favorites: items.filter(item => item.favorite).length },
    enrichment: { average: enrichment.summary.average, active: enrichment.summary.actionable, intentional: enrichment.summary.intentional },
    activity: { today: todayEvents.length, recent },
    storage: { engine: storage.engine, snapshots: storage.snapshotCount, lastPersistedAt: storage.lastPersistedAt },
    safety: { inventoryScanned: false, repairsApplied: false, artworkChanged: false, mediaFilesChanged: false, networkUsed: false }
  };
}

export function runVaultSteward({ force = false, source = "automatic" } = {}) {
  if (running) return null;
  const state = getState();
  if (!force && !stewardIsDue(state)) return state.metadata.stage35.lastBrief;
  running = true;
  try {
    const brief = buildStewardBrief(state), id = createId("steward"), outcome = brief.health.ok ? "passed" : "attention";
    update(save => {
      const stage = save.metadata.stage35;
      stage.lastRunAt = brief.createdAt;
      stage.nextDueAt = nextDue(brief.createdAt, stage.cadenceHours);
      stage.lastBrief = brief;
      stage.runs = [{ id, source, outcome, startedAt: brief.createdAt, finishedAt: new Date().toISOString(), brief }, ...(stage.runs || [])].slice(0, 180);
    });
    emit("STEWARD_CYCLE_COMPLETED", { meta: { title: outcome === "passed" ? "Daily care complete" : "Daily care needs attention", runId: id, outcome } });
    if (force) toast(outcome === "passed" ? "DAILY CARE COMPLETE" : "DAILY CARE FOUND ATTENTION", outcome === "passed" ? "Health, enrichment, activity, and storage were summarized locally." : `${brief.health.issueCount} health issue(s) were reported.`, 6000);
    if (currentRoute() === "steward") renderVaultSteward();
    return brief;
  } finally { running = false; }
}

function setEnabled(enabled) {
  update(save => {
    save.metadata.stage35.enabled = enabled;
    if (enabled && !save.metadata.stage35.nextDueAt) save.metadata.stage35.nextDueAt = new Date().toISOString();
  });
  toast(enabled ? "VAULT STEWARD ENABLED" : "VAULT STEWARD PAUSED", enabled ? "Daily local care runs only while the Vault is open." : "Manual care remains available.");
  renderVaultSteward();
}
function setCadence(hours) {
  const value = Math.max(6, Math.min(168, Number(hours || 24)));
  update(save => {
    const stage = save.metadata.stage35; stage.cadenceHours = value;
    stage.nextDueAt = nextDue(stage.lastRunAt || new Date().toISOString(), value);
  });
  renderVaultSteward();
}

function briefMarkup(brief) {
  if (!brief) return `<div class="empty"><b>NO DAILY BRIEF YET.</b>Run care now, or leave the Steward enabled for its first quiet cycle.</div>`;
  return `<div class="steward-brief"><div><span>ARCHIVE HEALTH</span><b class="${brief.health.ok ? "good" : "danger"}">${brief.health.ok ? "NOMINAL" : `${brief.health.issueCount} ISSUE(S)`}</b><small>${brief.health.checked} records checked</small></div><div><span>ENRICHMENT</span><b>${brief.enrichment.average}%</b><small>${brief.enrichment.active} active opportunities</small></div><div><span>TODAY</span><b>${brief.activity.today}</b><small>canonical events witnessed</small></div><div><span>RECOVERY</span><b>${brief.storage.snapshots}</b><small>local snapshots available</small></div></div>`;
}

export function renderVaultSteward() {
  if (currentRoute() !== "steward") return;
  const stage = getState().metadata.stage35, brief = stage.lastBrief, due = stewardIsDue(), runs = stage.runs || [];
  document.querySelector("#view").innerHTML = `<section class="steward-hero panel"><div><span class="eyebrow">CHECKPOINT 35 // OPERATIONAL AUTOMATION</span><h2>QUIET CARE, ONLY WHILE OPEN.</h2><p>The Steward checks archive health and prepares a useful local brief. It never inventories DVD rips, repairs links, changes artwork, touches media, or uses the network.</p><div class="button-row"><button class="button primary" data-steward-run ${running ? "disabled" : ""}>RUN CARE NOW</button><button class="button" data-steward-toggle="${stage.enabled ? "off" : "on"}">${stage.enabled ? "PAUSE" : "ENABLE"} STEWARD</button></div></div><div class="steward-state ${stage.enabled ? "on" : "off"}"><b>${stage.enabled ? (due ? "DUE" : "READY") : "PAUSED"}</b><span>${stage.enabled ? `EVERY ${stage.cadenceHours} HOURS` : "MANUAL ONLY"}</span></div></section>
    <section class="panel steward-schedule"><div><b>CARE SCHEDULE</b><p>Runs only while this local Vault page is open. Closing the Vault pauses the clock without a background service.</p></div><label>CADENCE<select data-steward-cadence ${stage.enabled ? "" : "disabled"}><option value="12" ${stage.cadenceHours === 12 ? "selected" : ""}>EVERY 12 HOURS</option><option value="24" ${stage.cadenceHours === 24 ? "selected" : ""}>ONCE A DAY</option><option value="72" ${stage.cadenceHours === 72 ? "selected" : ""}>EVERY 3 DAYS</option><option value="168" ${stage.cadenceHours === 168 ? "selected" : ""}>ONCE A WEEK</option></select></label><small>NEXT ${stage.enabled && stage.nextDueAt ? new Date(stage.nextDueAt).toLocaleString() : "MANUAL"}</small></section>
    <section class="panel"><div class="panel__header"><h2>LATEST DAILY BRIEF</h2><span class="panel__code">${brief ? new Date(brief.createdAt).toLocaleString() : "WAITING"}</span></div>${briefMarkup(brief)}${brief?.activity.recent?.length ? `<div class="steward-signals">${brief.activity.recent.slice(0, 6).map(event => `<article><span>${new Date(event.timestamp).toLocaleString()}</span><b>${esc(event.type.replaceAll("_", " "))}</b><small>${esc(event.title)}</small></article>`).join("")}</div>` : ""}</section>
    <section class="panel steward-policy"><div class="panel__header"><h2>HARD LIMITS</h2><span class="panel__code">LOCAL / READ ONLY</span></div><div class="steward-limits"><span>NO DVD-RIP INVENTORY</span><span>NO LINK REPAIR</span><span>NO POSTER CHANGES</span><span>NO MEDIA CHANGES</span><span>NO NETWORK</span></div></section>
    <section class="panel ops-history"><h3>CARE LEDGER</h3>${runs.slice(0, 30).map(run => `<article class="ops-ledger"><span>${new Date(run.startedAt).toLocaleString()}</span><b>${run.outcome.toUpperCase()}</b><em>${run.source.toUpperCase()}</em><small>${run.brief.health.checked} RECORDS · ${run.brief.enrichment.average}% ENRICHMENT · ZERO MEDIA CHANGES</small></article>`).join("") || `<p>THE STEWARD HAS NOT RUN YET.</p>`}</section>`;
  document.querySelector("#view-title").textContent = "Vault Steward";
  document.querySelector("#view-code").textContent = "VAULT://STEWARD";
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  if (!document.querySelector("link[data-steward-styles]")) {
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "./css/vault-steward.css"; link.dataset.stewardStyles = ""; document.head.append(link);
  }
  on("WING_VISITED", event => { if (event.wing === "steward") setTimeout(renderVaultSteward, 0); });
  window.addEventListener("hashchange", () => setTimeout(renderVaultSteward, 0));
  document.addEventListener("click", event => {
    if (event.target.closest("[data-steward-run]")) { runVaultSteward({ force: true, source: "manual" }); return; }
    const toggle = event.target.closest("[data-steward-toggle]")?.dataset.stewardToggle;
    if (toggle) setEnabled(toggle === "on");
  }, true);
  document.addEventListener("change", event => {
    const cadence = event.target.closest("[data-steward-cadence]"); if (cadence) setCadence(cadence.value);
  }, true);
  setTimeout(() => { runVaultSteward({ source: "automatic" }); renderVaultSteward(); }, 2500);
  setInterval(() => runVaultSteward({ source: "automatic" }), 15 * 60 * 1000);
  setTimeout(renderVaultSteward, 100);
  return true;
}
function schedule(attempt = 0) { if (install() || attempt >= 200) return; setTimeout(() => schedule(attempt + 1), 25); }
setTimeout(() => schedule(), 0);