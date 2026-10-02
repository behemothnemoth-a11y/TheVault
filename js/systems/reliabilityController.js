import { getState, retryPersistence, subscribeStorage } from "../core/store.js";
import { toast } from "../ui/notifications.js";
import { closeModal, openModal } from "../ui/modals.js";
import { escapeHtml } from "../ui/safeHtml.js";
import { abandonRunningJobs, clearFinishedJobs, completeJob, failJob, recentJobs, startJob, updateJob } from "./jobLedger.js?v=20260902-v1";
import { createJobControl } from "./jobControl.js?v=20260902-v1";

let initialized = false;

function renderSaveGuard(saveGuard, status) {
  if (status.lastError) {
    saveGuard.hidden = false;
    saveGuard.className = "vault-save-guard failed";
    saveGuard.innerHTML = `<div><b>CHANGES NOT SAVED</b><span>${escapeHtml(status.lastError)}</span></div><button data-retry-vault-save>RETRY SAVE</button>`;
    return;
  }
  if (status.saving || status.unsavedChanges) {
    saveGuard.hidden = false;
    saveGuard.className = "vault-save-guard saving";
    saveGuard.innerHTML = `<div><b>SAVING ARCHIVE…</b><span>${Number(status.pendingWrites || 1)} local update${Number(status.pendingWrites || 1) === 1 ? "" : "s"} waiting</span></div>`;
    return;
  }
  saveGuard.hidden = true;
  saveGuard.className = "vault-save-guard";
  saveGuard.replaceChildren();
}

function failedItemQueue() {
  const state = getState(), items = state.items || {};
  const sources = [
    ["BOOKS", state.metadata.books?.metadataRefresh?.items || {}],
    ["COMICS / MANGA", state.metadata.comicsManga?.metadataRefresh?.items || {}],
    ["TELEVISION", state.metadata.tv?.metadataRefresh?.items || {}]
  ];
  const failures = [];
  for (const [wing, ledger] of sources) for (const [itemId, entry] of Object.entries(ledger)) {
    if (entry.status && entry.status !== "updated") failures.push({ wing, title: items[itemId]?.title || itemId, reason: entry.message || entry.status });
  }
  for (const [videoId, entry] of Object.entries(state.metadata.youtube?.historyDetails || {})) {
    if (entry.status && entry.status !== "updated") failures.push({ wing: "YOUTUBE", title: state.metadata.youtube?.history?.find(record => record.videoId === videoId)?.title || videoId, reason: entry.status });
  }
  return failures.slice(0, 200);
}

function showJobHistory() {
  const jobs = recentJobs(), failures = failedItemQueue();
  const failedMarkup = failures.length ? `<section class="vault-failure-queue"><header><b>FAILED ITEM QUEUE</b><span>${failures.length} READY TO RETRY</span></header><p>Run Refresh Metadata in the matching wing. Successful records will be skipped; only these failures and newly eligible records will run.</p>${failures.map(entry => `<article><b>${escapeHtml(entry.title)}</b><span>${escapeHtml(entry.wing)}</span><small>${escapeHtml(entry.reason)}</small></article>`).join("")}</section>` : "";
  const rows = jobs.length ? jobs.map(job => `<article class="vault-job-row ${escapeHtml(job.status)}"><div><b>${escapeHtml(job.title)}</b><span>${escapeHtml(job.status.toUpperCase())} · ${new Date(job.updatedAt).toLocaleString()}</span></div><p>${escapeHtml(job.detail || job.phase || job.error)}</p><small>${job.total ? `${job.current} OF ${job.total} · ${job.percent}%` : "NO ITEM TOTAL REPORTED"}${job.error ? ` · ${escapeHtml(job.error)}` : ""}</small></article>`).join("") : `<p class="muted">No reliability jobs have run yet.</p>`;
  openModal({ title: "VAULT JOB HISTORY", body: `<div class="vault-job-history">${failedMarkup}${rows}</div>`, actions: [...(jobs.length ? [{ label: "CLEAR FINISHED HISTORY", handler: () => { clearFinishedJobs(); showJobHistory(); } }] : []), { label: "CLOSE", primary: true, handler: () => closeModal() }] });
}

export function initReliabilityController() {
  if (initialized) return;
  initialized = true;
  abandonRunningJobs();
  const saveGuard = document.createElement("aside");
  saveGuard.className = "vault-save-guard";
  saveGuard.hidden = true;
  saveGuard.setAttribute("aria-live", "assertive");
  document.body.append(saveGuard);
  saveGuard.addEventListener("click", async event => {
    const button = event.target.closest("[data-retry-vault-save]");
    if (!button) return;
    button.disabled = true;
    try { await retryPersistence(); toast("ARCHIVE SAVED", "The pending Vault changes are safely stored."); }
    catch (error) { toast("SAVE STILL BLOCKED", error.message, 7000); }
  });
  subscribeStorage(status => renderSaveGuard(saveGuard, status));
  window.addEventListener("beforeunload", event => { if (!saveGuard.hidden) { event.preventDefault(); event.returnValue = ""; } });
  const button = document.createElement("button");
  button.className = "vault-job-history-button";
  button.textContent = "TASK HISTORY";
  button.addEventListener("click", showJobHistory);
  document.querySelector(".footer")?.prepend(button);
}

export function openVaultProgress(title, phase, detail = "") {
  const jobId = startJob({ title, phase, detail }), control = createJobControl();
  const body = `<div class="vault-ai-progress" data-vault-job="${escapeHtml(jobId)}"><span class="eyebrow">VAULT INTELLIGENCE // LIVE STATUS</span><h3 data-ai-progress-phase>${escapeHtml(phase)}</h3><div class="vault-ai-progress__bar"><i data-ai-progress-bar></i></div><p data-ai-progress-detail>${escapeHtml(detail)}</p><small data-ai-progress-count>WORKING…</small><div class="vault-job-controls"><button data-job-pause>PAUSE AFTER CURRENT ITEM</button><button data-job-cancel>CANCEL SAFELY</button></div></div>`;
  openModal({ title, body });
  document.querySelector(`[data-vault-job="${jobId}"]`)?.addEventListener("click", event => {
    const pause = event.target.closest("[data-job-pause]"), cancel = event.target.closest("[data-job-cancel]");
    if (pause) {
      if (control.paused) { control.resume(); pause.textContent = "PAUSE AFTER CURRENT ITEM"; updateJob(jobId, { phase: "RESUMING TASK…" }); }
      else { control.pause(); pause.textContent = "RESUME TASK"; updateJob(jobId, { phase: "PAUSED AFTER CURRENT ITEM" }); }
    }
    if (cancel) { control.cancel(); cancel.disabled = true; cancel.textContent = "CANCELLING…"; }
  });
  const releaseControl = () => { if (globalThis.__vaultActiveJobControl === control) globalThis.__vaultActiveJobControl = null; };
  return {
    id: jobId, control,
    update(values = {}) {
      const { phase: nextPhase, detail: nextDetail, current, total } = values;
      updateJob(jobId, values);
      const root = document.querySelector(`[data-vault-job="${jobId}"]`)?.closest("#modal-root") || document.querySelector("#modal-root");
      if (nextPhase && root?.querySelector("[data-ai-progress-phase]")) root.querySelector("[data-ai-progress-phase]").textContent = nextPhase;
      if (nextDetail !== undefined && root?.querySelector("[data-ai-progress-detail]")) root.querySelector("[data-ai-progress-detail]").textContent = nextDetail;
      if (Number(total) > 0) {
        const percent = Math.max(2, Math.min(100, Math.round(Number(current || 0) / Number(total) * 100))), bar = root?.querySelector("[data-ai-progress-bar]"), count = root?.querySelector("[data-ai-progress-count]");
        if (bar) { bar.style.width = `${percent}%`; bar.classList.add("determinate"); }
        if (count) count.textContent = `${Number(current || 0)} OF ${Number(total)} · ${percent}%`;
      }
    },
    finish(heading, summary, results = {}) {
      releaseControl(); completeJob(jobId, { heading, summary, results });
      openModal({ title: heading, body: `<div class="vault-ai-progress complete"><span class="eyebrow">VAULT INTELLIGENCE // COMPLETE</span><h3>${escapeHtml(heading)}</h3><p>${escapeHtml(summary)}</p><small>TASK RESULT SAVED IN JOB HISTORY</small></div>`, actions: [{ label: "CLOSE", primary: true, handler: () => closeModal() }] });
    },
    fail(summary) {
      releaseControl(); failJob(jobId, summary);
      openModal({ title: "AI TASK PAUSED", body: `<div class="vault-ai-progress failed"><span class="eyebrow">NO DATA WAS REMOVED</span><h3>THE TASK COULD NOT FINISH</h3><p>${escapeHtml(summary)}</p><small>FAILURE SAVED IN JOB HISTORY</small></div>`, actions: [{ label: "CLOSE", primary: true, handler: () => closeModal() }] });
    }
  };
}
