import { createId } from "../core/ids.js";
import { createArchiveSnapshot, getState, update } from "../core/store.js";
import { toast } from "../ui/notifications.js";
import { runHealthCheck } from "./health.js";
import { runSentinelScan } from "./sentinel.js";

let jobInFlight = null;
const jobs = [
  { id: "health", label: "Archive health check", safe: "READ ONLY" },
  { id: "snapshot", label: "Protected maintenance snapshot", safe: "VAULT DATA ONLY" },
  { id: "sentinel", label: "DVD inventory boundary", safe: "POLICY ONLY" }
];
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

export async function runOperationsJob(jobId, { quiet = false, source = "manual" } = {}) {
  if (jobInFlight) throw new Error(`${jobInFlight} is already running.`);
  const job = jobs.find(entry => entry.id === jobId);
  if (!job) throw new Error("Unknown operations job.");
  jobInFlight = jobId;
  const startedAt = new Date().toISOString();
  let outcome = "passed";
  let detail = "";
  try {
    if (jobId === "health") {
      const result = runHealthCheck();
      outcome = result.ok ? "passed" : "attention";
      detail = result.ok ? `${result.checked} records and ${result.episodes} episodes passed.` : result.issues.slice(0, 4).join(" | ");
    } else if (jobId === "snapshot") {
      const snapshot = await createArchiveSnapshot("Protected operations snapshot", { kind: "operations", protected: true });
      detail = `Snapshot ${snapshot.id || "sealed"}.`;
    } else {
      const policy = getState().metadata.stage33;
      if (policy?.dvdRipsAreIntentional && policy?.missingLinksRequireAttention === false && policy?.untrackedVideoFilesRequireAttention === false) {
        detail = "DVD-rip inventory skipped by intentional archive policy; no files scanned.";
      } else {
        const report = await runSentinelScan({ quiet: true });
        detail = `${report.inventoryFiles} files; ${report.missingCount} missing links; ${report.untrackedCount} untracked.`;
      }
    }
  } catch (error) {
    outcome = "failed";
    detail = error.message;
    throw error;
  } finally {
    const finishedAt = new Date().toISOString();
    update(save => {
      save.metadata.stage9 ||= { startedAt, jobs: {}, runs: [] };
      save.metadata.stage9.jobs[jobId] = { lastRunAt: finishedAt, lastOutcome: outcome };
      save.metadata.stage9.runs.push({
        id: createId("jobrun"), jobId, source, startedAt, finishedAt, outcome, detail
      });
      save.metadata.stage9.runs = save.metadata.stage9.runs.slice(-180);
    });
    jobInFlight = null;
    if (!quiet) toast(outcome === "passed" ? "JOB COMPLETE" : "JOB NEEDS ATTENTION", detail, 6000);
  }
  return { jobId, outcome, detail };
}

export function renderOperationsCenter() {
  if (location.hash !== "#/operations") return;
  const stage9 = getState().metadata.stage9 || { jobs: {}, runs: [] };
  const runs = [...(stage9.runs || [])].reverse();
  document.querySelector("#view").innerHTML = `<section class="ops-hero panel"><span class="eyebrow">STAGE 9 // OBSERVABLE MAINTENANCE</span><h2>OPERATIONS CENTER</h2>
    <p>Safe maintenance jobs, explicit schedules, and a durable run ledger. Automatic work happens only while the local Vault is open.</p></section>
    <div class="ops-list">${jobs.map(job => { const state = stage9.jobs?.[job.id]; return `<article class="panel ops-row"><div><b>${esc(job.label)}</b><span>${job.safe}</span><small>${state?.lastRunAt ? `LAST ${new Date(state.lastRunAt).toLocaleString()} · ${state.lastOutcome.toUpperCase()}` : "NEVER RUN"}</small></div><button class="button primary" data-run-job="${job.id}" ${jobInFlight ? "disabled" : ""}>RUN NOW</button></article>`; }).join("")}</div>
    <section class="panel ops-history"><h3>RUN LEDGER</h3>${runs.slice(0, 60).map(run => `<article class="ops-ledger"><span>${new Date(run.startedAt).toLocaleString()}</span><b>${esc(run.jobId.toUpperCase())}</b><em>${run.outcome.toUpperCase()}</em><small>${esc(run.detail)}</small></article>`).join("") || "<p>NO OPERATIONS RECORDED.</p>"}</section>`;
  document.querySelector("#view-title").textContent = "Operations Center";
  document.querySelector("#view-code").textContent = "VAULT://OPERATIONS";
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  if (!getState().metadata.stage9) update(save => {
    save.metadata.stage9 = {
      startedAt: new Date().toISOString(), jobs: {}, runs: [],
      policy: { automaticWorkRequiresOpenVault: true, destructiveJobsAllowed: false }
    };
  });
  document.addEventListener("click", async event => {
    const button = event.target.closest("[data-run-job]");
    if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation();
    try { await runOperationsJob(button.dataset.runJob); }
    catch (error) { toast("JOB FAILED", error.message, 6500); }
    renderOperationsCenter();
  }, true);
  window.addEventListener("hashchange", () => setTimeout(renderOperationsCenter, 0));
  setTimeout(renderOperationsCenter, 0);
  return true;
}
function schedule(attempt = 0) {
  if (install() || attempt >= 200) return;
  setTimeout(() => schedule(attempt + 1), 25);
}
setTimeout(() => schedule(), 0);
