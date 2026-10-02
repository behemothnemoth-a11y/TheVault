import { emit, on } from "../core/events.js";
import { createId } from "../core/ids.js";
import { createArchiveSnapshot, getState, update } from "../core/store.js";
import { toast } from "../ui/notifications.js";
import { runHealthCheck } from "./health.js";

const MIN_CONFIDENCE = 0.95;
const JOBS = [
  {
    id: "health_audit", label: "Archive health audit", confidence: 1,
    mutates: false, reversible: true, risk: "READ ONLY",
    preview: "Validate records, episodes, history, imports, relationships, and safety policies.", selected: true
  },
  {
    id: "import_integrity", label: "Import manifest audit", confidence: 0.99,
    mutates: false, reversible: true, risk: "READ ONLY",
    preview: "Verify every active import batch still owns its declared records and evidence links.", selected: true
  },
  {
    id: "relationship_integrity", label: "Relationship evidence audit", confidence: 0.99,
    mutates: false, reversible: true, risk: "READ ONLY",
    preview: "Verify every filed relationship points to a live record and carries source evidence.", selected: true
  },
  {
    id: "refresh_archive_summary", label: "Refresh maintenance summary", confidence: 0.98,
    mutates: true, reversible: true, risk: "VAULT METADATA ONLY",
    preview: "Refresh a compact operations summary. No record, artwork, episode path, or media file changes.", selected: true
  },
  {
    id: "isolation_probe", label: "Failure-isolation drill", confidence: 1,
    mutates: false, reversible: true, risk: "DIAGNOSTIC / INTENTIONAL FAILURE",
    preview: "Throw a contained diagnostic error so later read-only steps can prove they remain isolated.", diagnostic: true
  }
];
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const clone = value => value == null ? value : structuredClone(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
let executionInFlight = false;

function getStage(state = getState()) {
  return state.metadata?.stage31 || { plans: [], runs: [], policy: {} };
}

export function getSupervisedJobs({ includeDiagnostics = false } = {}) {
  return JOBS.filter(job => includeDiagnostics || !job.diagnostic).map(clone);
}

function auditImports(state) {
  const issues = [];
  const batches = state.metadata?.stage28?.batches || [];
  for (const batch of batches.filter(entry => entry.status === "applied")) {
    for (const itemId of batch.itemIds || []) {
      if (!state.items[itemId] || state.items[itemId]?.import?.batchId !== batch.id) issues.push(`${batch.id} lost record ${itemId}`);
    }
    for (const relationshipId of batch.relationshipIds || []) {
      if (!state.relationships?.[relationshipId] || state.relationships[relationshipId]?.sourceBatchId !== batch.id) issues.push(`${batch.id} lost relationship ${relationshipId}`);
    }
  }
  return { issues, batches: batches.length, active: batches.filter(entry => entry.status === "applied").length };
}

function auditRelationships(state) {
  const issues = [];
  const relationships = Object.values(state.relationships || {});
  for (const relationship of relationships) {
    if (!state.items[relationship.fromItemId]) issues.push(`${relationship.id} has no source record`);
    if (!relationship.source || !relationship.evidence || typeof relationship.evidence !== "object") issues.push(`${relationship.id} has no evidence`);
  }
  return { issues, relationships: relationships.length };
}

export function buildArchiveSummary(state = getState()) {
  const items = Object.values(state.items || {}).filter(item => !item.id.startsWith("tv_drive_"));
  const episodes = items.flatMap(item => Object.values(item.episodes || {}));
  const importAudit = auditImports(state);
  const relationshipAudit = auditRelationships(state);
  return {
    generatedAt: new Date().toISOString(),
    schemaVersion: state.schemaVersion,
    records: items.length,
    episodes: episodes.length,
    linkedEpisodes: episodes.filter(episode => episode.sourcePath).length,
    collections: Object.keys(state.collections || {}).length,
    canonicalEvents: (state.events || []).length,
    activeImportBatches: importAudit.active,
    relationships: relationshipAudit.relationships,
    integrityIssues: importAudit.issues.length + relationshipAudit.issues.length
  };
}

function makePlanStep(job, confidenceOverride) {
  const confidence = confidenceOverride == null ? job.confidence : Math.max(0, Math.min(1, Number(confidenceOverride)));
  return {
    id: createId("superstep"), jobId: job.id, label: job.label, preview: job.preview,
    confidence, threshold: MIN_CONFIDENCE, blocked: confidence < MIN_CONFIDENCE,
    mutates: job.mutates, reversible: job.reversible, risk: job.risk,
    status: "pending"
  };
}

export function createSupervisedPlan(jobIds, options = {}) {
  const requested = [...new Set(jobIds || [])];
  if (!requested.length) throw new Error("Select at least one supervised job.");
  const jobs = requested.map(id => JOBS.find(job => job.id === id));
  if (jobs.some(job => !job)) throw new Error("The plan contains an unknown maintenance job.");
  if (jobs.some(job => job.diagnostic) && options.allowDiagnostics !== true) throw new Error("Diagnostic jobs are unavailable from the regular control room.");
  const steps = jobs.map(job => makePlanStep(job, options.confidenceOverrides?.[job.id]));
  const now = new Date().toISOString();
  const plan = {
    id: createId("superplan"), title: String(options.title || "Supervised maintenance plan").trim(),
    createdAt: now, dryRunAt: now, status: steps.some(step => step.blocked) ? "blocked" : "dry_run",
    approvalRequired: true, approvedAt: null, executedAt: null,
    policyVersion: 1, steps, containsMutation: steps.some(step => step.mutates),
    safety: { repairsAllowed: false, artworkAllowed: false, mediaFileChangesAllowed: false }
  };
  update(save => {
    save.metadata.stage31.plans.push(plan);
    save.metadata.stage31.plans = save.metadata.stage31.plans.slice(-80);
  });
  emit("SUPERVISED_DRY_RUN_CREATED", { meta: { title: plan.title, planId: plan.id, status: plan.status } });
  return clone(plan);
}

export function approveSupervisedPlan(planId) {
  const plan = getStage().plans.find(entry => entry.id === planId);
  if (!plan) throw new Error("That supervised plan was not found.");
  if (plan.status === "blocked") throw new Error("This plan is below the confidence threshold and cannot be approved.");
  if (plan.status !== "dry_run") throw new Error("Only a reviewed dry run can be approved.");
  const approvedAt = new Date().toISOString();
  update(save => {
    const live = save.metadata.stage31.plans.find(entry => entry.id === planId);
    live.status = "approved";
    live.approvedAt = approvedAt;
  });
  emit("SUPERVISED_PLAN_APPROVED", { meta: { title: plan.title, planId } });
  return clone(getStage().plans.find(entry => entry.id === planId));
}

function appendStepResult(runId, stepResult) {
  update(save => {
    const run = save.metadata.stage31.runs.find(entry => entry.id === runId);
    run.steps.push(stepResult);
  });
}

async function runStep(jobId, runId) {
  if (jobId === "health_audit") {
    const health = runHealthCheck();
    return {
      outcome: health.ok ? "passed" : "attention",
      detail: health.ok ? `${health.checked} records and ${health.episodes} episodes passed schema ${getState().schemaVersion}.` : health.issues.slice(0, 6).join(" | ")
    };
  }
  if (jobId === "import_integrity") {
    const audit = auditImports(getState());
    return { outcome: audit.issues.length ? "attention" : "passed", detail: audit.issues.length ? audit.issues.slice(0, 6).join(" | ") : `${audit.active} active of ${audit.batches} import batches retain complete manifests.` };
  }
  if (jobId === "relationship_integrity") {
    const audit = auditRelationships(getState());
    return { outcome: audit.issues.length ? "attention" : "passed", detail: audit.issues.length ? audit.issues.slice(0, 6).join(" | ") : `${audit.relationships} explicit relationships retain records and evidence.` };
  }
  if (jobId === "refresh_archive_summary") {
    const after = buildArchiveSummary(getState());
    update(save => {
      const beforeExists = Object.prototype.hasOwnProperty.call(save.metadata.stage31, "archiveSummary");
      const before = beforeExists ? clone(save.metadata.stage31.archiveSummary) : null;
      save.metadata.stage31.archiveSummary = clone(after);
      const run = save.metadata.stage31.runs.find(entry => entry.id === runId);
      run.journal.push({
        id: createId("superjournal"), path: "metadata.stage31.archiveSummary",
        before: { exists: beforeExists, value: before }, after: clone(after), reversible: true
      });
    });
    return { outcome: "passed", detail: `Summary refreshed for ${after.records} records, ${after.episodes} episodes, and ${after.relationships} relationships.` };
  }
  if (jobId === "isolation_probe") throw new Error("Intentional diagnostic failure remained inside its supervised step.");
  throw new Error("Unknown supervised job.");
}

export async function executeSupervisedPlan(planId) {
  if (executionInFlight) throw new Error("A supervised plan is already running.");
  const plan = getStage().plans.find(entry => entry.id === planId);
  if (!plan) throw new Error("That supervised plan was not found.");
  if (plan.status !== "approved" || !plan.approvedAt) throw new Error("Run the dry preview and explicitly approve it before execution.");
  if (plan.steps.some(step => step.confidence < MIN_CONFIDENCE || step.blocked)) throw new Error("The plan contains a step below the confidence threshold.");
  executionInFlight = true;
  const startedAt = new Date().toISOString();
  const runId = createId("superrun");
  let snapshotId = null;
  try {
    if (plan.containsMutation) {
      const snapshot = await createArchiveSnapshot(`Protected snapshot before supervised plan ${plan.id}`, {
        kind: "pre_supervised_automation", protected: true
      });
      snapshotId = snapshot.id || null;
    }
    update(save => {
      const livePlan = save.metadata.stage31.plans.find(entry => entry.id === planId);
      livePlan.status = "running";
      save.metadata.stage31.runs.push({
        id: runId, planId, startedAt, finishedAt: null, outcome: "running",
        snapshotId, steps: [], journal: [], status: "running", rolledBackAt: null
      });
      save.metadata.stage31.runs = save.metadata.stage31.runs.slice(-120);
    });
    let unsafeToMutate = false;
    for (const step of plan.steps) {
      const stepStartedAt = new Date().toISOString();
      if (unsafeToMutate && step.mutates) {
        appendStepResult(runId, { stepId: step.id, jobId: step.jobId, startedAt: stepStartedAt, finishedAt: new Date().toISOString(), outcome: "skipped", detail: "Mutation skipped because an earlier step failed or required attention." });
        continue;
      }
      try {
        const output = await runStep(step.jobId, runId);
        appendStepResult(runId, { stepId: step.id, jobId: step.jobId, startedAt: stepStartedAt, finishedAt: new Date().toISOString(), ...output });
        if (output.outcome !== "passed") unsafeToMutate = true;
      } catch (error) {
        appendStepResult(runId, { stepId: step.id, jobId: step.jobId, startedAt: stepStartedAt, finishedAt: new Date().toISOString(), outcome: "failed", detail: error.message });
        unsafeToMutate = true;
      }
    }
    const liveRun = getStage().runs.find(entry => entry.id === runId);
    const failed = liveRun.steps.some(step => step.outcome === "failed");
    const attention = liveRun.steps.some(step => ["attention", "skipped"].includes(step.outcome));
    const outcome = failed ? "failed" : attention ? "attention" : "passed";
    const finishedAt = new Date().toISOString();
    update(save => {
      const run = save.metadata.stage31.runs.find(entry => entry.id === runId);
      run.finishedAt = finishedAt; run.outcome = outcome; run.status = "completed";
      const livePlan = save.metadata.stage31.plans.find(entry => entry.id === planId);
      livePlan.status = outcome === "passed" ? "completed" : outcome;
      livePlan.executedAt = finishedAt; livePlan.runId = runId;
    });
    emit("SUPERVISED_RUN_COMPLETED", { meta: { title: plan.title, planId, runId, outcome } });
    return clone(getStage().runs.find(entry => entry.id === runId));
  } finally {
    executionInFlight = false;
  }
}

export async function rollbackSupervisedRun(runId) {
  const run = getStage().runs.find(entry => entry.id === runId);
  if (!run) throw new Error("That supervised run was not found.");
  if (run.status === "rolled_back") throw new Error("That run has already been rolled back.");
  if (!run.journal?.length) throw new Error("This run made no reversible Vault metadata changes.");
  for (const entry of run.journal) {
    if (entry.path !== "metadata.stage31.archiveSummary") throw new Error("The rollback journal contains an unsupported path.");
    if (!same(getState().metadata.stage31.archiveSummary, entry.after)) throw new Error("The maintenance summary changed after this run. Rollback stopped to preserve the newer value.");
  }
  await createArchiveSnapshot(`Protected snapshot before rolling back supervised run ${runId}`, {
    kind: "pre_supervised_rollback", protected: true
  });
  const rolledBackAt = new Date().toISOString();
  update(save => {
    const liveRun = save.metadata.stage31.runs.find(entry => entry.id === runId);
    for (const entry of [...liveRun.journal].reverse()) {
      if (entry.before.exists) save.metadata.stage31.archiveSummary = clone(entry.before.value);
      else delete save.metadata.stage31.archiveSummary;
    }
    liveRun.status = "rolled_back"; liveRun.rolledBackAt = rolledBackAt;
    const plan = save.metadata.stage31.plans.find(entry => entry.id === liveRun.planId);
    if (plan) plan.status = "rolled_back";
  });
  emit("SUPERVISED_RUN_ROLLED_BACK", { meta: { title: runId, runId } });
  return clone(getStage().runs.find(entry => entry.id === runId));
}

function planMarkup(plan) {
  if (!plan) return `<section class="panel supervision-empty"><b>NO DRY RUN YET.</b><p>Select maintenance checks and create a preview. Nothing in the archive will be changed by the preview.</p></section>`;
  const action = plan.status === "dry_run" ? `<button class="button primary" data-supervision-approve="${plan.id}">APPROVE THIS PLAN</button>`
    : plan.status === "approved" ? `<button class="button primary" data-supervision-execute="${plan.id}">EXECUTE APPROVED PLAN</button>` : "";
  return `<section class="panel supervision-plan"><header><div><small>${esc(plan.id)}</small><h3>${esc(plan.title)}</h3></div><em>${esc(plan.status.toUpperCase())}</em></header>
    <div class="supervision-steps">${plan.steps.map((step, index) => `<article class="${step.blocked ? "blocked" : ""}"><span>${index + 1}</span><div><b>${esc(step.label)}</b><small>${esc(step.preview)}</small></div><strong>${Math.round(step.confidence * 100)}%</strong><em>${esc(step.risk)}</em></article>`).join("")}</div>
    <footer><span>${plan.containsMutation ? "PROTECTED SNAPSHOT REQUIRED BEFORE EXECUTION" : "READ-ONLY EXECUTION"}</span>${action}</footer></section>`;
}

export function renderSupervisedAutomation() {
  if (location.hash !== "#/supervision") return;
  const stage = getStage();
  const plan = stage.plans.at(-1) || null;
  const runs = [...stage.runs].reverse().slice(0, 30);
  const summary = stage.archiveSummary;
  document.querySelector("#view").innerHTML = `<section class="supervision-hero panel"><div><span class="eyebrow">STAGE 31 // HUMAN-GATED MAINTENANCE</span><h2>SUPERVISION DECK</h2><p>Build a dry run, inspect confidence and impact, approve it explicitly, then execute. Failures stay isolated and every metadata mutation carries a protected rollback journal.</p></div><div class="supervision-lock">APPROVAL<br>REQUIRED</div></section>
    <section class="supervision-policy"><article class="panel"><b>95%</b><span>MINIMUM CONFIDENCE</span></article><article class="panel"><b>ALWAYS</b><span>EXPLICIT APPROVAL</span></article><article class="panel"><b>NEVER</b><span>MEDIA FILE CHANGES</span></article><article class="panel"><b>ON</b><span>FAILURE ISOLATION</span></article></section>
    <section class="panel supervision-builder"><h3>BUILD A DRY RUN</h3><div>${getSupervisedJobs().map(job => `<label><input type="checkbox" data-supervision-job="${job.id}" ${job.selected ? "checked" : ""}><span><b>${esc(job.label)}</b><small>${esc(job.preview)}</small></span><em>${Math.round(job.confidence * 100)}%</em></label>`).join("")}</div><button class="button" data-supervision-preview>CREATE DRY PREVIEW</button></section>
    ${planMarkup(plan)}
    ${summary ? `<section class="panel supervision-summary"><h3>LAST MAINTENANCE SUMMARY</h3>${Object.entries(summary).map(([key, value]) => `<article><span>${esc(key.replaceAll("_", " ").toUpperCase())}</span><b>${esc(value)}</b></article>`).join("")}</section>` : ""}
    <section class="panel ops-history supervision-runs"><h3>SUPERVISED RUN LEDGER</h3>${runs.map(run => `<article class="supervision-run"><header><time>${new Date(run.startedAt).toLocaleString()}</time><b>${esc(run.outcome.toUpperCase())}</b><span>${run.steps.length} STEPS</span>${run.journal.length && run.status !== "rolled_back" ? `<button class="button" data-supervision-rollback="${run.id}">ROLL BACK METADATA</button>` : ""}</header>${run.steps.map(step => `<small>${esc(step.jobId.replaceAll("_", " ").toUpperCase())} / ${esc(step.outcome.toUpperCase())} / ${esc(step.detail)}</small>`).join("")}</article>`).join("") || "<p>NO SUPERVISED RUNS YET.</p>"}</section>`;
  document.querySelector("#view-title").textContent = "Supervision Deck";
  document.querySelector("#view-code").textContent = "VAULT://SUPERVISION";
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  if (!document.querySelector("link[data-oracle-supervision-styles]")) {
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "./css/oracle-supervision.css"; link.dataset.oracleSupervisionStyles = ""; document.head.append(link);
  }
  if (!getState().metadata.stage31) update(save => {
    save.metadata.stage31 = {
      startedAt: new Date().toISOString(), plans: [], runs: [],
      policy: {
        minimumConfidence: MIN_CONFIDENCE, dryRunRequired: true, explicitApprovalRequired: true,
        failureIsolation: true, stopMutationsAfterFailure: true, protectedRollback: true,
        repairsAllowed: false, artworkAllowed: false, mediaFileChangesAllowed: false
      }
    };
  });
  document.addEventListener("click", async event => {
    const preview = event.target.closest("[data-supervision-preview]");
    const approve = event.target.closest("[data-supervision-approve]");
    const execute = event.target.closest("[data-supervision-execute]");
    const rollback = event.target.closest("[data-supervision-rollback]");
    if (!preview && !approve && !execute && !rollback) return;
    event.preventDefault(); event.stopImmediatePropagation();
    try {
      if (preview) {
        const jobs = [...document.querySelectorAll("[data-supervision-job]:checked")].map(input => input.dataset.supervisionJob);
        createSupervisedPlan(jobs);
        toast("DRY PREVIEW READY", "Review every step and confidence score before approval.", 6000);
      } else if (approve) {
        approveSupervisedPlan(approve.dataset.supervisionApprove);
        toast("PLAN APPROVED", "Execution is now unlocked for this exact plan.", 6000);
      } else if (execute) {
        const run = await executeSupervisedPlan(execute.dataset.supervisionExecute);
        toast(run.outcome === "passed" ? "SUPERVISED RUN COMPLETE" : "SUPERVISED RUN CONTAINED", run.outcome.toUpperCase(), 6500);
      } else {
        await rollbackSupervisedRun(rollback.dataset.supervisionRollback);
        toast("SUPERVISED CHANGE ROLLED BACK", "Only the run-owned metadata was restored.", 6500);
      }
      renderSupervisedAutomation();
    } catch (error) { toast("SUPERVISION STOPPED", error.message, 7500); }
  }, true);
  on("WING_VISITED", event => { if (event.wing === "supervision") setTimeout(renderSupervisedAutomation, 0); });
  window.addEventListener("hashchange", () => setTimeout(renderSupervisedAutomation, 0));
  setTimeout(renderSupervisedAutomation, 100);
  return true;
}
function schedule(attempt = 0) { if (install() || attempt >= 200) return; setTimeout(() => schedule(attempt + 1), 25); }
setTimeout(() => schedule(), 0);
