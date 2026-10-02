import { emit } from "../core/events.js";
import { getState, update } from "../core/store.js";
import { toast } from "../ui/notifications.js";
import { buildReconciliationProposals } from "./reconciliationLab.js";

let scanInFlight = false;
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);
const normalizePath = value => String(value || "").replaceAll("/", "\\").toLowerCase();
const basename = value => String(value || "").replaceAll("/", "\\").split("\\").pop().toLowerCase();

function currentRoute() {
  return location.hash.replace(/^#\//, "") || "home";
}

export function ensureSentinelStyles() {
  if (document.querySelector("link[data-sentinel-styles]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./css/sentinel.css";
  link.dataset.sentinelStyles = "";
  document.head.append(link);
}

export function compareSentinelInventory(inventory) {
  const state = getState();
  const owners = new Map();
  for (const show of Object.values(state.items || {}).filter(item => item.wing === "tv")) {
    for (const episode of Object.values(show.episodes || {})) {
      if (!episode.sourcePath) continue;
      const key = normalizePath(episode.sourcePath);
      if (!owners.has(key)) owners.set(key, []);
      owners.get(key).push({ showId: show.id, episodeId: episode.id, title: show.title, path: episode.sourcePath });
    }
  }
  const files = inventory.files || [];
  const inventoryByPath = new Map(files.map(file => [normalizePath(file.path), file]));
  const present = [...owners.keys()].filter(path => inventoryByPath.has(path));
  const missing = [...owners.entries()].filter(([path]) => !inventoryByPath.has(path)).flatMap(([, entries]) => entries);
  const untracked = files.filter(file => !owners.has(normalizePath(file.path)));
  const duplicates = [...owners.entries()].filter(([, entries]) => entries.length > 1).map(([path, entries]) => ({ path, owners: entries }));
  const untrackedByName = new Map();
  for (const file of untracked) {
    const key = basename(file.path);
    if (!untrackedByName.has(key)) untrackedByName.set(key, []);
    untrackedByName.get(key).push(file);
  }
  const moves = missing.flatMap(entry => {
    const candidates = untrackedByName.get(basename(entry.path)) || [];
    return candidates.length === 1 ? [{ from: entry.path, to: candidates[0].path, showId: entry.showId, episodeId: entry.episodeId }] : [];
  });
  return {
    scannedAt: inventory.scannedAt,
    root: inventory.root,
    durationMs: inventory.durationMs,
    inventoryFiles: files.length,
    linkedPaths: owners.size,
    linkedPresent: present.length,
    missingCount: missing.length,
    untrackedCount: untracked.length,
    duplicateCount: duplicates.length,
    likelyMoveCount: moves.length,
    missing: missing.slice(0, 200),
    untracked: untracked.slice(0, 200),
    duplicates: duplicates.slice(0, 100),
    likelyMoves: moves.slice(0, 200),
    samplesTruncated: {
      missing: Math.max(0, missing.length - 200),
      untracked: Math.max(0, untracked.length - 200),
      duplicates: Math.max(0, duplicates.length - 100),
      likelyMoves: Math.max(0, moves.length - 200)
    }
  };
}

export async function runSentinelScan({ quiet = false } = {}) {
  if (scanInFlight) throw new Error("A Sentinel scan is already running.");
  scanInFlight = true;
  if (!quiet) {
    toast("SENTINEL DEPLOYED", "Reading D:\\TV Shows. No files will be changed.");
    renderSentinelPage();
  }
  try {
    const response = await fetch("/__vault/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Vault-Request": "scan-tv-library" },
      body: "{}"
    });
    if (!response.ok) throw new Error(`Library inventory returned ${response.status}.`);
    const inventory = await response.json();
    const report = compareSentinelInventory(inventory);
    buildReconciliationProposals(inventory, report);
    update(save => {
      save.metadata.stage4 ||= { startedAt: new Date().toISOString(), automaticDailyScan: true, reports: [] };
      save.metadata.stage4.lastReport = report;
      save.metadata.stage4.lastScanAt = report.scannedAt;
      save.metadata.stage4.reports = [...(save.metadata.stage4.reports || []), {
        scannedAt: report.scannedAt,
        inventoryFiles: report.inventoryFiles,
        linkedPresent: report.linkedPresent,
        missingCount: report.missingCount,
        untrackedCount: report.untrackedCount,
        likelyMoveCount: report.likelyMoveCount
      }].slice(-90);
    });
    emit("LIBRARY_SCAN_COMPLETED", {
      wing: "tv",
      meta: { title: `${report.inventoryFiles} files inventoried`, missing: report.missingCount, untracked: report.untrackedCount }
    });
    if (!quiet) toast("SENTINEL REPORT FILED", `${report.linkedPresent} linked files confirmed present.`);
    return report;
  } catch (error) {
    update(save => {
      save.metadata.stage4 ||= { startedAt: new Date().toISOString(), automaticDailyScan: true, reports: [] };
      save.metadata.stage4.lastError = { message: error.message, at: new Date().toISOString() };
    });
    if (!quiet) toast("SENTINEL COULD NOT SCAN", error.message, 6000);
    throw error;
  } finally {
    scanInFlight = false;
    renderSentinelPage();
  }
}

function fileList(title, records, renderer, extra = 0) {
  return `<details class="sentinel-drawer panel"><summary><span><b>${title}</b><small>${records.length}${extra ? ` SHOWN · ${extra} MORE` : ""}</small></span></summary>
    <div class="sentinel-file-list">${records.length ? records.map(renderer).join("") : `<div class="empty"><b>NONE DETECTED</b>This section is clear.</div>`}</div></details>`;
}

export function renderSentinel() {
  const stage4 = getState().metadata.stage4 || {};
  const report = stage4.lastReport;
  if (!report) return `<section class="sentinel-hero panel"><div><span class="eyebrow">STAGE 4 // READ-ONLY WATCH</span><h2>LIBRARY SENTINEL</h2>
    <p>No inventory has been filed yet. The Sentinel observes ` + "`D:\\TV Shows`" + ` and never changes media or episode links.</p>
    <button class="button primary" data-sentinel-scan>${scanInFlight ? "SCANNING..." : "RUN FIRST INVENTORY"}</button></div><div class="sentinel-eye">◉</div></section>`;
  return `<section class="sentinel-hero panel"><div><span class="eyebrow">STAGE 4 // READ-ONLY WATCH</span><h2>LIBRARY SENTINEL</h2>
    <p>Last inventory ${new Date(report.scannedAt).toLocaleString()} · ${Math.round(report.durationMs / 100) / 10}s · ${esc(report.root)}</p>
    <button class="button primary" data-sentinel-scan ${scanInFlight ? "disabled" : ""}>${scanInFlight ? "SCANNING..." : "RUN NEW INVENTORY"}</button></div><div class="sentinel-eye">◉</div></section>
    <div class="sentinel-vitals">
      <div class="panel good"><b>${report.linkedPresent}</b><span>LINKED PRESENT</span></div>
      <div class="panel ${report.missingCount ? "warn" : "good"}"><b>${report.missingCount}</b><span>LINKS MISSING</span></div>
      <div class="panel ${report.untrackedCount ? "warn" : ""}"><b>${report.untrackedCount}</b><span>UNTRACKED FILES</span></div>
      <div class="panel"><b>${report.likelyMoveCount}</b><span>LIKELY MOVES</span></div>
      <div class="panel"><b>${report.duplicateCount}</b><span>DUPLICATE OWNERS</span></div>
    </div>
    <section class="panel sentinel-notice"><b>OBSERVATION ONLY</b><span>No paths were relinked and no files were changed.</span></section>
    <div class="sentinel-drawers">
      ${fileList("LIKELY MOVES", report.likelyMoves, item => `<article><b>${esc(item.from)}</b><span>→ ${esc(item.to)}</span></article>`, report.samplesTruncated.likelyMoves)}
      ${fileList("MISSING LINKED FILES", report.missing, item => `<article><b>${esc(item.title)}</b><span>${esc(item.path)}</span></article>`, report.samplesTruncated.missing)}
      ${fileList("UNTRACKED VIDEO FILES", report.untracked, item => `<article><b>${esc(item.name)}</b><span>${esc(item.path)}</span></article>`, report.samplesTruncated.untracked)}
      ${fileList("DUPLICATE PATH OWNERS", report.duplicates, item => `<article><b>${esc(item.path)}</b><span>${item.owners.length} EPISODE RECORDS</span></article>`, report.samplesTruncated.duplicates)}
    </div>`;
}

export function renderSentinelPage() {
  if (currentRoute() !== "sentinel") return;
  document.querySelector("#view").innerHTML = renderSentinel();
  document.querySelector("#view-title").textContent = "Library Sentinel";
  document.querySelector("#view-code").textContent = "VAULT://SENTINEL";
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  ensureSentinelStyles();
  if (!getState().metadata.stage4) {
    update(save => {
      save.metadata.stage4 = { startedAt: new Date().toISOString(), automaticDailyScan: true, reports: [], lastScanAt: null };
    });
  }
  document.addEventListener("click", event => {
    if (!event.target.closest("[data-sentinel-scan]")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    runSentinelScan().catch(() => {});
  }, true);
  window.addEventListener("hashchange", () => setTimeout(renderSentinelPage, 0));
  setTimeout(renderSentinelPage, 0);
  setTimeout(() => {
    const stage4 = getState().metadata.stage4;
    const last = stage4.lastScanAt ? new Date(stage4.lastScanAt).getTime() : 0;
    if (!getState().metadata.stage10 && stage4.automaticDailyScan !== false && Date.now() - last >= 86400000) runSentinelScan({ quiet: true }).catch(() => {});
  }, 60000);
  return true;
}

function schedule(attempt = 0) {
  if (install() || attempt >= 200) return;
  setTimeout(() => schedule(attempt + 1), 25);
}

setTimeout(() => schedule(), 0);
