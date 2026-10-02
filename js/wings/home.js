import { getState } from "../core/store.js";
import { getStorageStatus } from "../core/store.js";
import { renderCinemaShell, renderCinemaMedia } from "../ui/homeCinema.js?v=20261001-home-final-v1";
import { escapeHtml as esc } from "../ui/safeHtml.js";
import { runHealthCheck } from "../systems/health.js";
// Same specifier as every other importer: a different ?v= would load a second
// instance of this module, with its own weather state and refresh timer.
import { renderHomeCommandCenter } from "../systems/homeCommandCenter.js?v=20261001-home-city-v2";
import { masterScanSummary, masterScanSuggestions } from "../systems/masterScan.js?v=20260912-master-scan-v1";
import { missingFileReviewCount } from "../systems/missingFileReview.js?v=20261001-review-v4";
import { renderHomeArchiveCards } from "../systems/homeArchiveCards.js?v=20261001-home-final-v1";
import { renderHomeCuriosities } from "../systems/homeCuriosities.js?v=20261001-home-city-v3";
import { renderHomeNow } from "../systems/homeNow.js?v=20261001-home-final-v2";
import { renderHalloweenPicker } from "../systems/halloweenPicker.js?v=20261002-halloween-picker-v1";

// Home presents the collection first; maintenance stays available below it.

const count = (state, test) => Object.values(state.items || {}).filter(test).length;

function functionButton({ hook, label, note, badge = "", primary = false }) {
  return `<button class="home-function${primary ? " primary" : ""}" ${hook}>
    <b>${esc(label)}</b>${badge ? `<i>${esc(String(badge))}</i>` : ""}<small>${esc(note)}</small>
  </button>`;
}

function renderHomeStatusStrip({ health, scan, missingFiles, waiting }) {
  const last = scan?.lastRun || {};
  const changes = ["added", "moved", "changed", "removed"]
    .reduce((total, key) => total + Number(last[key] || 0), 0);
  const scanText = !scan
    ? "NOT SCANNED"
    : last.baseline || last.baselineOnly
      ? `${scan.fileCount.toLocaleString()} FILES BASELINED`
      : `${changes} CHANGE${changes === 1 ? "" : "S"} LAST SCAN`;
  const healthText = health.ok ? "ARCHIVE HEALTHY" : "HEALTH NEEDS ATTENTION";

  return `<section class="home-status-strip" aria-label="Vault status">
    <button class="${health.ok ? "good" : "warn"}" data-health><i></i><b>${esc(healthText)}</b></button>
    <button data-master-scan><span>D:</span><b>${esc(scanText)}</b></button>
    ${missingFiles
      ? `<button class="warn" data-missing-file-review><span>PATHS</span><b>${missingFiles} TO REVIEW</b></button>`
      : `<span class="good"><span>PATHS</span><b>CLEAN</b></span>`}
    ${waiting
      ? `<button class="warn" data-master-sort><span>SCAN QUEUE</span><b>${waiting} TO SORT</b></button>`
      : `<span class="good"><span>SCAN QUEUE</span><b>CLEAR</b></span>`}
  </section>`;
}

export function renderHome() {
  const state = getState();
  const health = runHealthCheck();
  const storage = getStorageStatus();
  const usage = storage.usage ? `${(storage.usage / 1024 / 1024).toFixed(1)} MB` : "LOCAL";
  const scan = masterScanSummary(state);

  const artworkPending = (state.metadata?.artworkApprovals?.queue || []).filter(entry => entry.status === "pending").length;
  const importPending = (state.metadata?.games?.importReview || []).filter(entry => entry.status === "pending").length;
  const removedCards = (state.metadata?.removedCards || []).length;
  const missingFiles = missingFileReviewCount(state);
  const records = count(state, () => true);

  const scanNote = scan
    ? `${scan.fileCount.toLocaleString()} files remembered · last run ${new Date(scan.scannedAt).toLocaleDateString()}`
    : "Never run. First pass reads D: and remembers what it finds.";

  const waiting = scan?.pendingReview || 0;
  const suggested = masterScanSuggestions(state).reduce((total, group) => total + group.entries.length, 0);

  const functions = [
    { hook: "data-master-scan", label: "SCAN D: DRIVE", note: scanNote, badge: waiting, primary: true },
    ...(waiting ? [{
      hook: "data-master-sort", label: "SORT WHAT WAS FOUND",
      note: suggested
        ? `${suggested} sorted and waiting for your call · ${waiting - suggested} not looked at yet.`
        : `${waiting} new files the Vault has not placed yet.`,
      badge: waiting
    }] : []),
    ...(suggested ? [{
      hook: "data-master-suggestions", label: "REVIEW SUGGESTIONS",
      note: "What the AI worked out but would not file on its own.", badge: suggested
    }] : []),
    { hook: "data-artwork-review", label: "ARTWORK REVIEW", note: "Approve or reject verified cover art.", badge: artworkPending },
    { hook: "data-games-import-review", label: "IMPORT REVIEW", note: "Games found on the drives, waiting to be confirmed.", badge: importPending },
    { hook: "data-removed-cards", label: "REMOVED CARDS", note: "Everything the Vault has taken out, restorable.", badge: removedCards },
    ...(missingFiles ? [{ hook: "data-missing-file-review", label: "MISSING FILE REVIEW", note: "Review old paths that no longer exist and approve relinks.", badge: missingFiles }] : []),
    { hook: "data-snapshot-create", label: "TAKE A SNAPSHOT", note: "A protected copy of the archive as it stands." },
    { hook: "data-snapshot-manager", label: "SNAPSHOTS", note: "Browse and restore protected copies." },
    { hook: "data-export", label: "EXPORT ARCHIVE", note: "Write the whole archive out to a file." },
    { hook: "data-import", label: "IMPORT ARCHIVE", note: "Read an exported archive back in." },
    { hook: "data-health", label: "HEALTH CHECK", note: "What the Vault thinks is wrong right now." },
    { hook: "data-command", label: "SEARCH / COMMANDS", note: "Everything the Vault can do, by name." }
  ];

  // Keep existing card actions and data sources inside the cinema layout.
  const primaryHome = `${renderHomeStatusStrip({ health, scan, missingFiles, waiting })}${renderHalloweenPicker(state)}${renderHomeNow(state)}`;
  const content = `<div class="cinema-layout"><div class="cinema-main">
    ${renderCinemaMedia(state, primaryHome)}
    ${renderHomeArchiveCards({ cinema: true })}
    </div><aside class="cinema-aside" aria-label="Weather and trivia">${renderHomeCommandCenter()}</aside></div>
    <section class="cinema-discover"><header><h2>A little further afield</h2><p>The sky, daily discoveries, and things to look forward to.</p></header>${renderHomeCuriosities()}</section>
    <details class="cinema-tools"><summary><b>Archive tools</b><span>Manage your collection</span></summary>
    <section class="home-control-head">
      <div><h2>Your archive</h2></div>
      <div class="home-control-state">
        <span class="${health.ok ? "good" : "warn"}"><i></i>${health.ok ? "ALL CORE SYSTEMS READY" : "NEEDS ATTENTION"}</span>
        <small>${records.toLocaleString()} RECORDS · ${esc(usage)} · ${esc(storage.engine || "local")}</small>
      </div>
    </section>

    <section class="home-functions" aria-label="Vault functions">
      ${functions.map(functionButton).join("")}
    </section>
  </details>`;

  return renderCinemaShell(content);
}
