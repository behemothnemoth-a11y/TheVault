import { emit } from "../core/events.js";
import { createId } from "../core/ids.js";
import { getState, update } from "../core/store.js";
import { escapeHtml as esc } from "../ui/safeHtml.js";
import { ensureDailyDesk, getDailyDeskModel } from "./dailyDesk.js";
import { runHealthCheck } from "./health.js";

let timer = null, refresh = () => {};
const isDue = stage => !stage.lastRunAt || !stage.nextDueAt || Date.parse(stage.nextDueAt) <= Date.now();

export function runQuietHost({ force = false, source = "while_open_timer" } = {}) {
  const stage = getState().metadata.stage41;
  if ((!stage.enabled && !force) || (!force && !isDue(stage))) return stage.brief;
  const before = getDailyDeskModel().plan?.id || null;
  const desk = ensureDailyDesk({ reason: "quiet_host" });
  const state = getState(), health = runHealthCheck(state), now = new Date();
  const expired = Object.values(state.metadata.stage37.signals || {}).filter(signal => signal.snoozedUntil && Date.parse(signal.snoozedUntil) <= now.getTime()).length;
  const drafts = state.metadata.stage39.plans.filter(plan => plan.status === "draft" && now.getTime() - Date.parse(plan.createdAt) > 86400000).length;
  const pending = state.metadata.stage42.proposals.filter(proposal => proposal.status === "pending").length;
  const findings = [
    health.ok ? `Archive health nominal across ${health.checked} records` : `${health.issues.length} health issues require review`,
    before === desk?.id ? "Daily Desk is current" : "Daily Desk advanced to the current day",
    expired ? `${expired} Daily Desk snoozes naturally expired` : "No expired Daily Desk snoozes",
    drafts ? `${drafts} old session drafts remain available` : "No stale session drafts",
    pending ? `${pending} supervised proposals await a decision` : "No supervised proposal is waiting"
  ];
  const finishedAt = new Date().toISOString();
  const run = { id: createId("host"), source, startedAt: now.toISOString(), finishedAt, outcome: health.ok ? "passed" : "attention", checks: 5, mutations: before === desk?.id ? 0 : 1, findings, healthIssues: health.issues.slice(0, 12) };
  const brief = { generatedAt: finishedAt, outcome: run.outcome, findings, runId: run.id };
  update(save => {
    const target = save.metadata.stage41, minutes = Math.max(15, Math.min(240, Number(target.cadenceMinutes || 30)));
    target.lastRunAt = finishedAt; target.nextDueAt = new Date(Date.now() + minutes * 60000).toISOString();
    target.brief = brief; target.runs = [run, ...target.runs].slice(0, 240);
  });
  emit("QUIET_HOST_RAN", { meta: { title: run.outcome === "passed" ? "Quiet care complete" : "Quiet care found attention", runId: run.id, mutations: run.mutations } });
  refresh();
  return brief;
}

export function setQuietHostEnabled(enabled) {
  update(save => { save.metadata.stage41.enabled = Boolean(enabled); });
  scheduleQuietHost();
  return Boolean(enabled);
}

export function setQuietHostCadence(minutes) {
  const value = Math.max(15, Math.min(240, Number(minutes || 30)));
  update(save => {
    save.metadata.stage41.cadenceMinutes = value;
    save.metadata.stage41.nextDueAt = new Date(Date.now() + value * 60000).toISOString();
  });
  scheduleQuietHost();
  return value;
}

function scheduleQuietHost() {
  if (timer) clearTimeout(timer);
  const stage = getState().metadata.stage41;
  if (!stage.enabled) return;
  const wait = Math.max(1000, Math.min(2147483647, (Date.parse(stage.nextDueAt || "") || Date.now()) - Date.now()));
  timer = setTimeout(() => { runQuietHost(); scheduleQuietHost(); }, wait);
}

export function initQuietHost(onRefresh = () => {}) {
  refresh = onRefresh;
  runQuietHost({ source: "vault_open" });
  scheduleQuietHost();
}

export function renderQuietHost() {
  const stage = getState().metadata.stage41, latest = stage.runs[0] || null;
  const healthy = (stage.brief?.outcome || "passed") === "passed";
  return `<section class="panel phase-hero host-hero"><div><span class="eyebrow">BACKGROUND CARE // LOCAL & QUIET</span><h2>${stage.enabled ? healthy ? "EVERYTHING LOOKS GOOD." : "ONE CHECK NEEDS ATTENTION." : "BACKGROUND CARE IS PAUSED."}</h2><p>Keeps Today fresh and checks the archive while the Vault is open. It never scans your drive, edits records, uses the web, or touches media.</p></div><div class="phase-seal ${stage.enabled ? "online" : "offline"}">${stage.enabled ? healthy ? "OK" : "!" : "OFF"}<small>${stage.enabled ? "CARE" : "PAUSED"}</small></div></section>
  <section class="panel host-controls"><div><b>${stage.enabled ? "CARE IS ON" : "CARE IS PAUSED"}</b><p class="muted">${stage.enabled ? `Checks quietly every ${stage.cadenceMinutes} minutes while this page is open.` : "Turn it on whenever you want automatic local checks."}</p></div><div class="button-row"><button class="button ${stage.enabled ? "primary" : ""}" data-host-toggle="${stage.enabled ? "off" : "on"}">${stage.enabled ? "PAUSE CARE" : "TURN ON CARE"}</button><button class="button" data-host-run>CHECK NOW</button></div></section>
  <section class="panel host-brief"><header><div><span class="eyebrow">LATEST CHECK</span><h3>${healthy ? "ALL CLEAR" : "NEEDS A LOOK"}</h3></div><small>${stage.brief?.generatedAt ? esc(new Date(stage.brief.generatedAt).toLocaleString()) : "NOT YET RUN"}</small></header><ol>${(stage.brief?.findings || ["Choose Check Now to create the first summary."]).map(finding => `<li>${esc(finding)}</li>`).join("")}</ol></section>
  <details class="panel host-details"><summary>BACKGROUND CARE DETAILS</summary><section class="host-vitals"><article><span>LAST CHECK</span><b>${stage.lastRunAt ? esc(new Date(stage.lastRunAt).toLocaleTimeString()) : "NEVER"}</b><small>${stage.lastRunAt ? esc(new Date(stage.lastRunAt).toLocaleDateString()) : "NO HISTORY"}</small></article><article><span>NEXT CHECK</span><b>${stage.enabled && stage.nextDueAt ? esc(new Date(stage.nextDueAt).toLocaleTimeString()) : "PAUSED"}</b><small>${stage.cadenceMinutes} MINUTES</small></article><article><span>CHECKS SAVED</span><b>${stage.runs.length}</b><small>RECENT LOCAL HISTORY</small></article><article><span>LATEST CHANGES</span><b>${latest?.mutations || 0}</b><small>ONLY TODAY MAY REFRESH</small></article></section><div class="host-cadence"><b>CHECK EVERY</b><div class="button-row" role="group" aria-label="Background Care schedule">${[15,30,60,120].map(value => `<button class="button ${stage.cadenceMinutes === value ? "primary" : ""}" data-host-cadence="${value}">${value} MIN</button>`).join("")}</div></div><div class="phase-signal-strip"><b>SAFETY LIMITS</b><div><span>OPEN PAGE ONLY</span><span>NO DRIVE SCAN</span><span>NO NETWORK</span><span>NO SILENT EDITS</span><span>VISIBLE HISTORY</span></div></div></details>`;
}
