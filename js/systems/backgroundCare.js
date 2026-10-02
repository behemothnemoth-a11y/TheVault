import { createId } from "../core/ids.js";
import { emit } from "../core/events.js";
import { getState, update } from "../core/store.js";
import { runHealthCheck } from "./health.js";
import { ensureDailyDesk } from "./dailyDesk.js";
import { escapeHtml as esc } from "../ui/safeHtml.js";

const dayKey = date => new Intl.DateTimeFormat("en-CA", {
  year: "numeric", month: "2-digit", day: "2-digit"
}).format(date || new Date());

function currentDesk(state) {
  const stage = state.metadata?.stage37 || {};
  return (stage.plans || []).find(plan => plan.id === stage.currentPlanId) || (stage.plans || [])[0] || null;
}

function expiredSnoozes(state) {
  const now = Date.now();
  return Object.values(state.metadata?.stage37?.signals || {})
    .filter(signal => signal?.snoozedUntil && Date.parse(signal.snoozedUntil) <= now).length;
}

function staleDrafts(state) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return (state.metadata?.stage39?.plans || []).filter(plan =>
    plan?.status === "draft" && Date.parse(plan.createdAt || 0) < cutoff).length;
}

function pendingProposals(state) {
  return (state.metadata?.stage42?.proposals || []).reduce((sum, proposal) =>
    sum + (proposal?.actions || []).filter(action => action.status === "pending").length, 0);
}

export function runBackgroundCare({ source = "manual" } = {}) {
  const before = getState();
  const desk = currentDesk(before);
  const staleDesk = !desk || desk.dateKey !== dayKey(new Date());
  const health = runHealthCheck(before);
  const snoozes = expiredSnoozes(before);
  const drafts = staleDrafts(before);
  const pending = pendingProposals(before);
  let mutations = 0;

  if (staleDesk) {
    ensureDailyDesk({ force: false, reason: "background_care" });
    mutations = 1;
  }

  const findings = [
    { key: "health", status: health.ok ? "ok" : "attention", text: health.ok ? "Archive health checks passed." : `${health.issues.length} health issue${health.issues.length === 1 ? "" : "s"} need attention.` },
    { key: "desk", status: staleDesk ? "refreshed" : "ok", text: staleDesk ? "Daily Desk was stale and was refreshed for today." : "Daily Desk is current." },
    { key: "snoozes", status: snoozes ? "attention" : "ok", text: snoozes ? `${snoozes} snoozed choice${snoozes === 1 ? "" : "s"} have naturally expired.` : "No expired snoozes are waiting." },
    { key: "drafts", status: drafts ? "attention" : "ok", text: drafts ? `${drafts} session draft${drafts === 1 ? "" : "s"} are older than 24 hours.` : "No stale session drafts were found." },
    { key: "proposals", status: pending ? "attention" : "ok", text: pending ? `${pending} assistant action${pending === 1 ? "" : "s"} await a decision.` : "No supervised actions are waiting." }
  ];

  const startedAt = new Date().toISOString();
  const outcome = findings.some(f => f.status === "attention") ? "attention" : "passed";
  const run = {
    id: createId("host_run"), source, startedAt, finishedAt: new Date().toISOString(),
    outcome, checks: 5, mutations, findings,
    healthIssues: (health.issues || []).slice(0, 12)
  };

  update(save => {
    const stage = save.metadata.stage41;
    stage.lastRunAt = run.finishedAt;
    stage.nextDueAt = new Date(Date.parse(run.finishedAt) + Number(stage.cadenceMinutes || 30) * 60000).toISOString();
    stage.runs = [run, ...(stage.runs || []).filter(row => row.id !== run.id)].slice(0, 240);
    stage.brief = { runId: run.id, outcome, findings };
  });
  emit("BACKGROUND_CARE_RUN", { meta: { title: outcome === "passed" ? "Background Care passed" : "Background Care needs attention", runId: run.id, mutations } });
  return run;
}export function setBackgroundCareEnabled(enabled) {
  update(save => { save.metadata.stage41.enabled = Boolean(enabled); });
  return Boolean(enabled);
}

export function setBackgroundCareCadence(minutes) {
  const value = [15, 30, 60, 120].includes(Number(minutes)) ? Number(minutes) : 30;
  update(save => {
    save.metadata.stage41.cadenceMinutes = value;
    save.metadata.stage41.nextDueAt = new Date(Date.now() + value * 60000).toISOString();
  });
  return value;
}

export function renderBackgroundCare() {
  const state = getState(), stage = state.metadata?.stage41 || {};
  const latest = (stage.runs || [])[0] || null;
  const brief = stage.brief || null;
  const next = stage.nextDueAt ? new Date(stage.nextDueAt) : null;
  const last = stage.lastRunAt ? new Date(stage.lastRunAt) : null;
  const findings = brief?.findings || latest?.findings || [];
  const cadence = Number(stage.cadenceMinutes || 30);

  const findingRows = findings.length ? findings.map((finding, index) =>
    `<li><b>${index + 1}. ${esc(String(finding.key || "check").replaceAll("_"," ").toUpperCase())}</b><span>${esc(finding.text || "")}</span></li>`
  ).join("") : "<li><span>No care run has been recorded yet.</span></li>";

  return `<section class="panel phase-hero"><div><span class="eyebrow">STAGE 41 // QUIET BACKGROUND HOST</span><h2>BACKGROUND CARE</h2><p>Five bounded local checks keep Today fresh while the Vault is open. No drive scanning, media changes, network calls, silent metadata edits, ratings, or automatic completion.</p></div><div class="phase-seal ${stage.enabled === false ? "offline" : "online"}">${stage.enabled === false ? "PAUSED" : "ON"}<small>LOCAL ONLY</small></div></section>
    <section class="host-vitals">
      <article class="panel"><span>LAST RUN</span><b>${last ? esc(last.toLocaleTimeString([], {hour:"numeric", minute:"2-digit"})) : "NEVER"}</b><small>${last ? esc(last.toLocaleDateString()) : "No run recorded"}</small></article>
      <article class="panel"><span>NEXT DUE</span><b>${stage.enabled === false ? "PAUSED" : next ? esc(next.toLocaleTimeString([], {hour:"numeric", minute:"2-digit"})) : "UNSCHEDULED"}</b><small>${cadence} minute cadence</small></article>
      <article class="panel"><span>VISIBLE RUNS</span><b>${Number(stage.runs?.length || 0)}</b><small>Up to 240 retained</small></article>
      <article class="panel"><span>LAST OUTCOME</span><b>${esc(String(latest?.outcome || "not run").toUpperCase())}</b><small>${latest ? `${latest.checks} checks · ${latest.mutations} mutation${latest.mutations === 1 ? "" : "s"}` : "Five checks per run"}</small></article>
    </section>
    <section class="panel host-controls"><div><b>BACKGROUND CARE</b><p>Runs only while the Vault page is open.</p></div><div class="button-row"><button class="button ${stage.enabled === false ? "" : "primary"}" data-host-toggle="${stage.enabled === false ? "on" : "off"}">${stage.enabled === false ? "RESUME" : "PAUSE"}</button><button class="button primary" data-host-run>RUN CHECKS NOW</button></div></section>
    <section class="panel host-controls"><div><b>CADENCE</b><p>How often the while-open scheduler may check.</p></div><div class="button-row">${[15,30,60,120].map(value => `<button class="button ${cadence === value ? "primary" : ""}" data-host-cadence="${value}">${value} MIN</button>`).join("")}</div></section>
    <section class="panel host-brief"><header><div><span class="eyebrow">LATEST BRIEF</span><h3>${esc(String(brief?.outcome || latest?.outcome || "NO RUN YET").toUpperCase())}</h3></div><small>${latest ? esc(new Date(latest.finishedAt).toLocaleString()) : "Run Background Care to create the first brief."}</small></header><ol>${findingRows}</ol></section>`;
}
