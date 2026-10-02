import { emit, on } from "../core/events.js";
import { createId } from "../core/ids.js";
import { CURRENT_SCHEMA_VERSION, migrateSave } from "../core/migrations.js";
import {
  createArchiveSnapshot, exportSave, flushPersistence, getArchiveSnapshots,
  getState, getStorageStatus, restoreArchiveSnapshot, update
} from "../core/store.js";
import { toast } from "../ui/notifications.js";
import { getGraphSummary } from "./relationshipGraph.js";
import { askVault } from "./vaultOracle.js";
import { runHealthCheck } from "./health.js";
import { runSentinelScan } from "./sentinel.js";

export const FINAL_AUDIT_CATEGORIES = [
  "migration", "corruption", "restore", "performance", "accessibility",
  "recovery", "live_library", "seal"
];
export const KNOWN_LIMITS = [
  "Automatic work runs only while the local Vault launcher and page are open.",
  "Loose and unmapped video files are treated as intentional DVD-rip material, not an active repair queue.",
  "The Vault Oracle understands bounded local query patterns; it is not a general web or prediction engine.",
  "External service exports must still be downloaded manually before Import Station can inspect them.",
  "Artwork is local-first and never auto-attached without an explicit protected action.",
  "The browser cannot directly launch episode files unless Open The Vault is running."
];

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const clone = value => value == null ? value : structuredClone(value);
let auditInFlight = false;

function fnv(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function stateFingerprint(state = getState()) {
  const copy = clone(state);
  delete copy.updatedAt;
  return fnv(JSON.stringify(copy));
}

function archiveCounts(state = getState()) {
  const records = Object.values(state.items || {}).filter(item => !item.id.startsWith("tv_drive_"));
  const episodes = records.flatMap(item => Object.values(item.episodes || {}));
  return {
    records: records.length,
    episodes: episodes.length,
    linkedEpisodes: episodes.filter(episode => episode.sourcePath).length,
    collections: Object.keys(state.collections || {}).length,
    relationships: Object.keys(state.relationships || {}).length,
    events: (state.events || []).length
  };
}

function makeCheck(id, category, label, outcome, detail, metrics = {}, evidence = {}) {
  return {
    id, category, label, outcome, detail, metrics: clone(metrics), evidence: clone(evidence),
    checkedAt: new Date().toISOString()
  };
}

function getAudit(auditId, state = getState()) {
  return state.metadata.stage32.audits.find(entry => entry.id === auditId);
}

function recordCheck(auditId, check) {
  update(save => {
    const audit = save.metadata.stage32.audits.find(entry => entry.id === auditId);
    if (!audit) throw new Error("The running final audit ledger was not found.");
    audit.checks.push(check);
  });
  renderFinalAudit();
  return check;
}

async function protectedCheck(auditId, id, category, label, operation) {
  try {
    const output = await operation();
    return recordCheck(auditId, makeCheck(id, category, label, output.outcome || "passed", output.detail, output.metrics, output.evidence));
  } catch (error) {
    return recordCheck(auditId, makeCheck(id, category, label, "failed", error.message, {}, { error: error.name || "Error" }));
  }
}

function migrationDrill() {
  const state = getState();
  const sample = Object.values(state.items).find(item => item.wing === "movies" && !item.id.startsWith("tv_drive_"));
  if (!sample) throw new Error("No stable sample record is available for the migration drill.");
  const legacySeed = {
    schemaVersion: 0,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    profile: clone(state.profile),
    items: { [sample.id]: clone(sample) },
    events: [], achievements: {}, preferences: {}, expeditions: {}, metadata: {}
  };
  const migratedLegacy = migrateSave(legacySeed);
  const legacyHealth = runHealthCheck(migratedLegacy);
  const boundaries = [1, 11, 17, 24, 27, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41];
  const boundaryResults = boundaries.map(version => {
    const candidate = clone(state);
    candidate.schemaVersion = version;
    const migrated = migrateSave(candidate);
    return { from: version, to: migrated.schemaVersion, stage32: Boolean(migrated.metadata?.stage32) };
  });
  let futureRejected = false;
  try { migrateSave({ ...legacySeed, schemaVersion: CURRENT_SCHEMA_VERSION + 1 }); }
  catch (error) { futureRejected = /newer/.test(error.message); }
  if (!legacyHealth.ok || migratedLegacy.schemaVersion !== CURRENT_SCHEMA_VERSION ||
      boundaryResults.some(entry => entry.to !== CURRENT_SCHEMA_VERSION || !entry.stage32) || !futureRejected) {
    throw new Error(`Migration matrix failed: ${legacyHealth.issues.slice(0, 4).join(" | ") || "boundary mismatch"}`);
  }
  return {
    detail: `Schema 0 and ${boundaries.length} historical boundaries migrated to schema ${CURRENT_SCHEMA_VERSION}; a future schema was rejected safely.`,
    metrics: { legacyFrom: 0, boundaries: boundaries.length, currentSchema: CURRENT_SCHEMA_VERSION },
    evidence: { boundaryResults, futureRejected, legacyHealthIssues: legacyHealth.issues }
  };
}

function corruptionDrill() {
  const candidate = clone(getState());
  const item = Object.values(candidate.items).find(entry => !entry.id.startsWith("tv_drive_"));
  item.rating = 99;
  candidate.events.push({ id: "evt_stage32_orphan_probe", type: "STAGE32_PROBE", timestamp: new Date().toISOString(), itemId: "missing_stage32_record" });
  candidate.metadata.stage30.externalInference = true;
  candidate.metadata.stage31.policy.mediaFileChangesAllowed = true;
  candidate.metadata.stage33.missingLinksRequireAttention = true;
  candidate.metadata.stage35.policy.mediaInventoryAllowed = true;
  candidate.metadata.stage36.policy.inventedDatesAllowed = true;
  candidate.metadata.stage37.policy.externalInference = true;
  candidate.metadata.stage38.policy.negativeInferenceAllowed = true;
  candidate.metadata.stage39.policy.automaticCompletion = true;
  candidate.metadata.stage40.policy.editsRemainExplicit = false;
  candidate.metadata.stage41.policy.networkAllowed = true;
  candidate.metadata.stage42.policy.explicitApprovalRequired = false;
  const report = runHealthCheck(candidate);
  const detections = {
    rating: report.issues.some(issue => issue.includes(`Invalid item rating: ${item.id}`)),
    orphan: report.issues.some(issue => issue.includes("Orphan event references missing_stage32_record")),
    oracle: report.issues.some(issue => issue.includes("Stage 30 Oracle metadata")),
    automation: report.issues.some(issue => issue.includes("Stage 31 supervision policy")),
    dvdBoundary: report.issues.some(issue => issue.includes("Stage 33 Daily Driver metadata")),
    steward: report.issues.some(issue => issue.includes("Stage 35 Steward metadata")),
    museum: report.issues.some(issue => issue.includes("Stage 36 Living Museum metadata")),
    dailyDesk: report.issues.some(issue => issue.includes("Stage 37 Daily Desk metadata")),
    calibration: report.issues.some(issue => issue.includes("Stage 38 Taste Calibration metadata")),
    sessionPlanner: report.issues.some(issue => issue.includes("Stage 39 Session Planner metadata")),
    universalRecord: report.issues.some(issue => issue.includes("Stage 40 Universal Record metadata")),
    quietHost: report.issues.some(issue => issue.includes("Stage 41 Quiet Host metadata")),
    personalAutopilot: report.issues.some(issue => issue.includes("Stage 42 Personal Autopilot metadata"))
  };
  if (Object.values(detections).some(value => !value)) throw new Error("The health system failed to detect every isolated corruption probe.");
  if (!runHealthCheck(getState()).ok) throw new Error("The corruption drill escaped its isolated clone.");
  return {
    detail: "Thirteen isolated probes verified archive integrity plus the explicit-input, no-auto-completion, universal-route, while-open, no-network, and approval-required Phase III boundaries.",
    metrics: { probes: 13, detected: 13, liveStateMutated: 0 }, evidence: detections
  };
}

function performanceDrill() {
  const healthStart = performance.now();
  const health = runHealthCheck();
  const healthMs = performance.now() - healthStart;
  const oracleStart = performance.now();
  const questions = [
    "How many horror movies are in the archive?",
    "How many TV episodes are in the archive?",
    "What happened recently?",
    "What have I imported?"
  ];
  const answers = questions.map(question => askVault(question));
  const oracleMs = performance.now() - oracleStart;
  const graphStart = performance.now();
  const graph = getGraphSummary();
  const graphMs = performance.now() - graphStart;
  const serializationStart = performance.now();
  const serialized = exportSave();
  JSON.parse(serialized);
  const serializationMs = performance.now() - serializationStart;
  const metrics = {
    healthMs: Math.round(healthMs * 10) / 10,
    oracleFourQueriesMs: Math.round(oracleMs * 10) / 10,
    graphSummaryMs: Math.round(graphMs * 10) / 10,
    exportRoundTripMs: Math.round(serializationMs * 10) / 10,
    exportBytes: new Blob([serialized]).size
  };
  if (!health.ok || answers.some(answer => !["answered", "unsupported", "insufficient"].includes(answer.status))) throw new Error("Performance drill produced an invalid answer or health result.");
  if (healthMs > 2500 || oracleMs > 1500 || graphMs > 1500 || serializationMs > 6000) throw new Error(`Interactive performance budget exceeded: ${JSON.stringify(metrics)}`);
  return {
    detail: `Health, four grounded questions, graph summary, and full export round-trip remained inside the local interaction budgets.`,
    metrics, evidence: { answers: answers.map(answer => ({ intent: answer.intent, status: answer.status, citations: answer.citations.length })), graph }
  };
}

function accessibilityDrill() {
  const nameFor = element => (element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent || "").trim();
  const unnamedButtons = [...document.querySelectorAll("button")].filter(button => !nameFor(button));
  const unnamedInputs = [...document.querySelectorAll("input:not([type=hidden]), select, textarea")].filter(control => {
    if (control.getAttribute("aria-label") || control.getAttribute("aria-labelledby")) return false;
    if (control.id && document.querySelector(`label[for="${CSS.escape(control.id)}"]`)) return false;
    return !control.closest("label");
  });
  const externalStyles = [...document.querySelectorAll('link[rel="stylesheet"]')].filter(link => new URL(link.href, location.href).origin !== location.origin);
  const evidence = {
    language: document.documentElement.lang,
    mainLandmark: Boolean(document.querySelector("main")),
    navigationLabel: document.querySelector("#main-nav")?.getAttribute("aria-label") || null,
    liveRegions: document.querySelectorAll('[aria-live]').length,
    skipLink: Boolean(document.querySelector('.skip-link[href="#view"]')),
    unnamedButtons: unnamedButtons.length,
    unnamedInputs: unnamedInputs.length,
    externalStylesheets: externalStyles.length,
    reducedMotionRule: [...document.styleSheets].some(sheet => {
      try { return [...(sheet.cssRules || [])].some(rule => rule.conditionText?.includes("prefers-reduced-motion")); }
      catch { return false; }
    })
  };
  if (evidence.language !== "en" || !evidence.mainLandmark || !evidence.navigationLabel || !evidence.liveRegions || !evidence.skipLink || unnamedButtons.length || unnamedInputs.length || externalStyles.length || !evidence.reducedMotionRule) {
    throw new Error(`Accessibility or offline-style audit failed: ${JSON.stringify(evidence)}`);
  }
  return {
    detail: "The audit room has named controls, keyboard entry, landmarks, live regions, reduced-motion support, and no external stylesheet dependency.",
    metrics: { namedButtons: document.querySelectorAll("button").length, namedInputs: document.querySelectorAll("input:not([type=hidden]), select, textarea").length },
    evidence
  };
}

async function restoreDrill(auditId) {
  const snapshot = await createArchiveSnapshot(`Protected Stage 32 restore drill ${auditId}`, {
    kind: "stage32_restore_drill", protected: true
  });
  if (!snapshot?.id) throw new Error("The restore drill could not create a protected snapshot.");
  const beforeFingerprint = stateFingerprint();
  const beforeCounts = archiveCounts();
  const probeId = createId("restoreprobe");
  update(save => { save.metadata.stage32.restoreProbe = { id: probeId, createdAt: new Date().toISOString() }; });
  await flushPersistence();
  await restoreArchiveSnapshot(snapshot.id);
  const afterFingerprint = stateFingerprint();
  const afterCounts = archiveCounts();
  const probeRemoved = !getState().metadata.stage32.restoreProbe;
  if (!probeRemoved || beforeFingerprint !== afterFingerprint || JSON.stringify(beforeCounts) !== JSON.stringify(afterCounts)) {
    throw new Error("Snapshot restore did not reproduce the pre-probe state exactly.");
  }
  return {
    detail: `Protected snapshot ${snapshot.id} restored exactly and removed the temporary audit marker.`,
    metrics: { snapshotsCreated: 2, records: afterCounts.records, episodes: afterCounts.episodes, linkedEpisodes: afterCounts.linkedEpisodes },
    evidence: { snapshotId: snapshot.id, beforeFingerprint, afterFingerprint, probeRemoved, beforeCounts, afterCounts }
  };
}

async function liveLibraryDrill() {
  const dvdPolicy = getState().metadata.stage33;
  if (dvdPolicy?.dvdRipsAreIntentional === true && dvdPolicy?.missingLinksRequireAttention === false && dvdPolicy?.untrackedVideoFilesRequireAttention === false) {
    const counts = archiveCounts();
    return {
      detail: "Intentional DVD-rip inventory is excluded from active maintenance. Archive counts were verified without scanning or changing media.",
      metrics: { inventorySkipped: true, records: counts.records, episodes: counts.episodes, linkedEpisodes: counts.linkedEpisodes },
      evidence: { intentionalDvdRips: true, missingLinksRequireAttention: false, untrackedVideoFilesRequireAttention: false, mediaFilesChanged: false }
    };
  }
  const before = archiveCounts();
  const report = await runSentinelScan({ quiet: true });
  const after = archiveCounts();
  if (!/^d:\\tv shows$/i.test(report.root || "")) throw new Error(`Sentinel scanned an unexpected root: ${report.root || "unknown"}`);
  if (before.records !== after.records || before.episodes !== after.episodes || before.linkedEpisodes !== after.linkedEpisodes) throw new Error("The read-only library scan changed archive records or episode links.");
  return {
    detail: `${report.inventoryFiles.toLocaleString()} files inventoried on D:\\TV Shows; ${report.linkedPresent.toLocaleString()} linked files confirmed present. No media or episode links changed.`,
    metrics: {
      inventoryFiles: report.inventoryFiles, linkedPaths: report.linkedPaths,
      linkedPresent: report.linkedPresent, missing: report.missingCount,
      untracked: report.untrackedCount, likelyMoves: report.likelyMoveCount,
      durationMs: report.durationMs
    },
    evidence: { root: report.root, scannedAt: report.scannedAt, archiveCountsBefore: before, archiveCountsAfter: after }
  };
}

async function recoveryDrill() {
  const exported = exportSave();
  const parsed = JSON.parse(exported);
  const exportHealth = runHealthCheck(parsed);
  const snapshots = await getArchiveSnapshots();
  const protectedSnapshots = snapshots.filter(snapshot => snapshot.protected);
  const storage = getStorageStatus();
  if (!exportHealth.ok || !protectedSnapshots.length || !storage.ready) throw new Error(`Recovery surfaces are incomplete: ${exportHealth.issues.slice(0, 4).join(" | ")}`);
  return {
    detail: `A ${new Blob([exported]).size.toLocaleString()}-byte export round-tripped cleanly; ${protectedSnapshots.length} protected snapshots are indexed.`,
    metrics: {
      exportBytes: new Blob([exported]).size, snapshots: snapshots.length,
      protectedSnapshots: protectedSnapshots.length, storageUsage: storage.usage,
      storageQuota: storage.quota
    },
    evidence: { engine: storage.engine, ready: storage.ready, schemaVersion: parsed.schemaVersion, exportHealth: exportHealth.ok }
  };
}

export async function runCompleteSystemAudit({ source = "manual", includeLiveLibrary = true, includeRestore = true } = {}) {
  if (auditInFlight) throw new Error("A complete-system audit is already running.");
  auditInFlight = true;
  const auditId = createId("finalaudit");
  const startedAt = new Date().toISOString();
  update(save => {
    save.metadata.stage32.audits.push({
      id: auditId, source, startedAt, finishedAt: null, status: "running",
      schemaVersion: save.schemaVersion, checks: [], knownLimits: clone(KNOWN_LIMITS)
    });
    save.metadata.stage32.audits = save.metadata.stage32.audits.slice(-24);
  });
  renderFinalAudit();
  try {
    await protectedCheck(auditId, "migration_matrix", "migration", "Migration matrix", async () => migrationDrill());
    await protectedCheck(auditId, "corruption_detection", "corruption", "Corruption detection", async () => corruptionDrill());
    await protectedCheck(auditId, "performance_budget", "performance", "Local performance budget", async () => performanceDrill());
    await protectedCheck(auditId, "accessibility_runtime", "accessibility", "Accessibility and offline runtime", async () => accessibilityDrill());
    if (includeRestore) await protectedCheck(auditId, "snapshot_restore", "restore", "Protected snapshot restore", async () => restoreDrill(auditId));
    else recordCheck(auditId, makeCheck("snapshot_restore", "restore", "Protected snapshot restore", "attention", "Restore drill was explicitly skipped for this audit run."));
    if (includeLiveLibrary) await protectedCheck(auditId, "live_tv_inventory", "live_library", "Live D-drive inventory", async () => liveLibraryDrill());
    else recordCheck(auditId, makeCheck("live_tv_inventory", "live_library", "Live D-drive inventory", "attention", "Live library drill was explicitly skipped for this audit run."));
    await protectedCheck(auditId, "export_snapshot_recovery", "recovery", "Export and snapshot recovery", async () => recoveryDrill());
    await protectedCheck(auditId, "final_health", "seal", "Final archive health", async () => {
      const health = runHealthCheck();
      if (!health.ok) throw new Error(health.issues.slice(0, 8).join(" | "));
      return { detail: `${health.checked} records and ${health.episodes} episodes passed the final schema ${CURRENT_SCHEMA_VERSION} health gate.`, metrics: health, evidence: { issues: health.issues } };
    });
    const audit = getAudit(auditId);
    const status = audit.checks.some(check => check.outcome === "failed") ? "failed" :
      audit.checks.some(check => check.outcome === "attention") ? "attention" : "passed";
    const finishedAt = new Date().toISOString();
    update(save => {
      const live = save.metadata.stage32.audits.find(entry => entry.id === auditId);
      live.status = status; live.finishedAt = finishedAt;
      save.metadata.stage32.lastAuditAt = finishedAt;
      save.metadata.stage32.lastOutcome = status;
    });
    const sealedHealth = runHealthCheck();
    if (!sealedHealth.ok) {
      recordCheck(auditId, makeCheck("sealed_ledger_validation", "seal", "Sealed ledger validation", "failed", sealedHealth.issues.slice(0, 8).join(" | ")));
      update(save => { save.metadata.stage32.audits.find(entry => entry.id === auditId).status = "failed"; save.metadata.stage32.lastOutcome = "failed"; });
    }
    const completed = clone(getAudit(auditId));
    emit("FINAL_SYSTEM_AUDIT_COMPLETED", { meta: { title: `Stage 32 ${completed.status}`, auditId, outcome: completed.status } });
    return completed;
  } finally {
    auditInFlight = false;
    renderFinalAudit();
  }
}

function checkMarkup(check) {
  return `<article class="final-check ${check.outcome}"><span>${esc(check.category.replaceAll("_", " ").toUpperCase())}</span><div><b>${esc(check.label)}</b><p>${esc(check.detail)}</p></div><em>${esc(check.outcome.toUpperCase())}</em><details><summary>VERIFICATION EVIDENCE</summary><pre>${esc(JSON.stringify({ metrics: check.metrics, evidence: check.evidence }, null, 2))}</pre></details></article>`;
}

export function renderFinalAudit() {
  if (location.hash !== "#/audit") return;
  const stage = getState().metadata.stage32;
  const audits = [...(stage.audits || [])].reverse();
  const latest = audits[0] || null;
  const counts = archiveCounts();
  const passed = latest?.checks?.filter(check => check.outcome === "passed").length || 0;
  document.querySelector("#view").innerHTML = `<section class="final-hero panel"><div><span class="eyebrow">STAGE 32 // COMPLETE-SYSTEM PROOF</span><h2>FINAL AUDIT</h2><p>Migration, isolated corruption, protected restore, local performance, accessibility, recovery, and the intentional DVD-rip boundary are tested as one system. The audit verifies archive counts without scanning, repairing, or changing media files.</p></div><div class="final-seal ${latest?.status || "ready"}">${latest?.status === "passed" ? "SYSTEM\nSEALED" : latest?.status?.toUpperCase() || "READY\nTO TEST"}</div></section>
    <section class="final-vitals"><article class="panel"><b>${counts.records.toLocaleString()}</b><span>RECORDS</span></article><article class="panel"><b>${counts.episodes.toLocaleString()}</b><span>EPISODES</span></article><article class="panel"><b>${counts.linkedEpisodes.toLocaleString()}</b><span>FILE LINKS</span></article><article class="panel"><b>${passed}/${latest?.checks?.length || FINAL_AUDIT_CATEGORIES.length}</b><span>LATEST PASSES</span></article></section>
    <section class="panel final-controls"><div><b>FULL LOCAL DRILL</b><p>Creates protected restore evidence and validates the intentional DVD-rip boundary without scanning or changing media.</p></div><button class="button primary" data-run-final-audit ${auditInFlight ? "disabled" : ""}>${auditInFlight ? "AUDIT RUNNING..." : "RUN COMPLETE AUDIT"}</button></section>
    ${latest ? `<section class="panel final-latest"><header><div><small>${new Date(latest.startedAt).toLocaleString()} / ${esc(latest.id)}</small><h3>LATEST SYSTEM LEDGER</h3></div><em>${esc(latest.status.toUpperCase())}</em></header><div class="final-checks">${latest.checks.map(checkMarkup).join("") || `<p>THE FIRST CHECK IS STARTING.</p>`}</div></section>` : `<section class="panel final-empty"><b>NO COMPLETE-SYSTEM AUDIT RECORDED.</b><p>Run the final drill once the local launcher is open.</p></section>`}
    <section class="panel final-limits"><h3>KNOWN LIMITS — EXPLICITLY RETAINED</h3>${KNOWN_LIMITS.map((limit, index) => `<article><span>${String(index + 1).padStart(2, "0")}</span><p>${esc(limit)}</p></article>`).join("")}</section>
    <section class="panel final-history"><h3>FINAL AUDIT HISTORY</h3>${audits.map(audit => `<article><time>${new Date(audit.startedAt).toLocaleString()}</time><b>${esc(audit.status.toUpperCase())}</b><span>${audit.checks.filter(check => check.outcome === "passed").length}/${audit.checks.length} PASSED</span><small>${esc(audit.id)}</small></article>`).join("") || "<p>NO FINAL AUDITS YET.</p>"}</section>`;
  document.querySelector("#view-title").textContent = "Final Audit";
  document.querySelector("#view-code").textContent = "VAULT://AUDIT";
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  if (!document.querySelector("link[data-final-audit-styles]")) {
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "./css/final-audit.css"; link.dataset.finalAuditStyles = ""; document.head.append(link);
  }
  if (!getState().metadata.stage32) update(save => {
    save.metadata.stage32 = {
      startedAt: new Date().toISOString(), audits: [], completeSystem: true,
      knownLimitsAcknowledged: true, mediaFilesReadOnly: true,
      policy: { restoreDrillProtected: true, corruptionDrillIsolated: true, liveLibraryReadOnly: true }
    };
  });
  document.addEventListener("click", async event => {
    const button = event.target.closest("[data-run-final-audit]");
    if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation();
    try {
      const result = await runCompleteSystemAudit();
      toast(result.status === "passed" ? "COMPLETE SYSTEM SEALED" : "FINAL AUDIT NEEDS ATTENTION", `${result.checks.filter(check => check.outcome === "passed").length}/${result.checks.length} checks passed`, 8000);
    } catch (error) { toast("FINAL AUDIT STOPPED", error.message, 8000); }
  }, true);
  on("WING_VISITED", event => { if (event.wing === "audit") setTimeout(renderFinalAudit, 0); });
  window.addEventListener("hashchange", () => setTimeout(renderFinalAudit, 0));
  setTimeout(renderFinalAudit, 100);
  return true;
}
function schedule(attempt = 0) { if (install() || attempt >= 200) return; setTimeout(() => schedule(attempt + 1), 25); }
setTimeout(() => schedule(), 0);
