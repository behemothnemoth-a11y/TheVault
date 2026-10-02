import { emit } from "../core/events.js";
import { createId } from "../core/ids.js";
import { getState, update } from "../core/store.js";
import { escapeHtml as esc } from "../ui/safeHtml.js";
import { getDailyDeskModel, setDailyDeskMode } from "./dailyDesk.js";
import { getCalibrationModel, startCalibrationSession } from "./tasteCalibration.js";
import { createSessionPlan, getSessionModel } from "./sessionPlanner.js";

const currentProposal = state => {
  const stage = state.metadata.stage42;
  return stage.proposals.find(proposal => proposal.id === stage.currentProposalId) || stage.proposals[0] || null;
};

function suggestDeskMode(state) {
  const active = Object.values(state.items).filter(item => item.status === "in_progress" && ["movies", "tv", "games", "books"].includes(item.wing)).length;
  const current = state.metadata.stage37.preferences.mode;
  if (active >= 4 && current !== "continue") return "continue";
  if (active < 4 && current !== "balanced") return "balanced";
  return current;
}

export function buildAutopilotProposal(state = getState(), options = {}) {
  const desk = getDailyDeskModel(state), calibration = getCalibrationModel(state), session = getSessionModel(state);
  const suggestedMode = suggestDeskMode(state), currentMode = state.metadata.stage37.preferences.mode;
  const actions = [{
    id: createId("auto_action"), kind: "prepare_session", status: "pending",
    title: "PREPARE A SESSION DRAFT",
    explanation: `Use the current ${session.stage.preferences.duration}-minute, ${session.stage.preferences.energy} planner preferences and today's grounded Desk.`,
    evidence: [`${desk.entries.length} current Daily Desk choices`, `${calibration.activeComparisons} explicit calibration answers`, "Starting remains a separate explicit action"],
    payload: { ...session.stage.preferences }
  }, {
    id: createId("auto_action"), kind: "calibration_round", status: "pending",
    title: "PREPARE A TASTE ROUND",
    explanation: calibration.activeComparisons < 20 ? "Taste evidence is still sparse; five explicit comparisons would improve future choices." : "A fresh optional round can refine taste without guessing from passive behavior.",
    evidence: [`${calibration.activeComparisons} active explicit answers`, "Skip and Neither remain neutral", "Every answer is reversible"],
    payload: {}
  }, {
    id: createId("auto_action"), kind: "desk_mode", status: "pending",
    title: `SET DAILY DESK TO ${suggestedMode.toUpperCase()}`,
    explanation: suggestedMode === currentMode ? "Keep the current mode and create a user-approved fresh rotation." : `Explicit in-progress evidence favors ${suggestedMode} mode over ${currentMode}.`,
    evidence: [`Current mode: ${currentMode}`, `Suggested mode: ${suggestedMode}`, "Mode changes never alter media progress"],
    payload: { mode: suggestedMode }
  }];
  const now = new Date(), expires = new Date(now.getTime() + 72 * 60 * 60 * 1000);
  return {
    id: createId("auto_proposal"), createdAt: now.toISOString(), expiresAt: expires.toISOString(),
    source: options.source || "while_open_companion", status: "pending", dryRun: true,
    summary: "Three bounded next-step suggestions prepared from local evidence.", actions
  };
}

export function ensurePersonalAutopilot({ force = false, source = "vault_open" } = {}) {
  const state = getState(), stage = state.metadata.stage42, existing = currentProposal(state);
  if (!stage.enabled) return existing;
  if (!force && existing?.status === "pending" && Date.parse(existing.expiresAt) > Date.now()) return existing;
  const proposal = buildAutopilotProposal(state, { source });
  update(save => {
    const target = save.metadata.stage42;
    for (const prior of target.proposals) if (prior.status === "pending") prior.status = "expired";
    target.currentProposalId = proposal.id;
    target.proposals = [proposal, ...target.proposals].slice(0, 180);
    target.cycles = [{ id: createId("auto_cycle"), proposalId: proposal.id, at: proposal.createdAt, source, outcome: "proposal_prepared", appliedActions: 0 }, ...target.cycles].slice(0, 365);
  });
  emit("PERSONAL_AUTOPILOT_PROPOSED", { meta: { title: proposal.summary, proposalId: proposal.id, approvalsRequired: proposal.actions.length } });
  return proposal;
}

function applyAction(action) {
  if (action.kind === "prepare_session") return createSessionPlan({ ...action.payload, source: "autopilot_approved" });
  if (action.kind === "calibration_round") return startCalibrationSession({ force: false });
  if (action.kind === "desk_mode") return setDailyDeskMode(action.payload.mode);
  throw new Error("Unknown supervised action.");
}

export function resolveAutopilotAction(proposalId, actionId, decision) {
  const proposal = getState().metadata.stage42.proposals.find(entry => entry.id === proposalId);
  const action = proposal?.actions.find(entry => entry.id === actionId);
  if (!proposal || !action || action.status !== "pending" || !["approve", "reject"].includes(decision)) return null;
  if (decision === "reject") {
    update(save => {
      const target = save.metadata.stage42.proposals.find(entry => entry.id === proposalId);
      const targetAction = target.actions.find(entry => entry.id === actionId);
      targetAction.status = "rejected"; targetAction.decidedAt = new Date().toISOString();
      const unresolved = target.actions.some(entry => entry.status === "pending");
      target.status = unresolved ? "partially_resolved" : target.actions.some(entry => entry.status === "applied") ? "applied" : "rejected";
    });
    emit("PERSONAL_AUTOPILOT_REJECTED", { meta: { title: action.title, proposalId, actionId } });
    return { status: "rejected", action };
  }
  let result, error = null;
  try { result = applyAction(action); } catch (caught) { error = caught; }
  update(save => {
    const target = save.metadata.stage42.proposals.find(entry => entry.id === proposalId);
    const targetAction = target.actions.find(entry => entry.id === actionId);
    targetAction.status = error ? "failed" : "applied"; targetAction.decidedAt = new Date().toISOString();
    if (error) targetAction.error = error.message;
    const unresolved = target.actions.some(entry => entry.status === "pending");
    target.status = unresolved ? "partially_resolved" : target.actions.some(entry => entry.status === "applied") ? "applied" : "rejected";
    const cycle = save.metadata.stage42.cycles.find(entry => entry.proposalId === proposalId);
    if (cycle && !error) cycle.appliedActions = Number(cycle.appliedActions || 0) + 1;
  });
  emit(error ? "PERSONAL_AUTOPILOT_FAILED" : "PERSONAL_AUTOPILOT_APPROVED", { meta: { title: action.title, proposalId, actionId, explicitApproval: true } });
  return { status: error ? "failed" : "applied", action, result, error };
}

export function resolveAutopilotProposal(proposalId, decision) {
  const proposal = getState().metadata.stage42.proposals.find(entry => entry.id === proposalId);
  if (!proposal || !["approve", "reject"].includes(decision)) return [];
  return proposal.actions.filter(action => action.status === "pending").map(action => resolveAutopilotAction(proposalId, action.id, decision));
}

export function setPersonalAutopilotEnabled(enabled) {
  update(save => { save.metadata.stage42.enabled = Boolean(enabled); });
  emit("PERSONAL_AUTOPILOT_TOGGLED", { meta: { title: enabled ? "Suggestions enabled" : "Suggestions paused" } });
  return Boolean(enabled);
}

export function renderPersonalAutopilot() {
  const stage = getState().metadata.stage42, proposal = currentProposal(getState());
  const pending = proposal?.actions.filter(action => action.status === "pending").length || 0;
  const statusLabel = status => ({ pending: "READY", applied: "PREPARED", rejected: "DISMISSED", failed: "NEEDS REVIEW" }[status] || status.toUpperCase());
  return `<section class="panel phase-hero companion-hero"><div><span class="eyebrow">VAULT ASSISTANT // YOU STAY IN CONTROL</span><h2>${pending ? `I PREPARED ${pending} OPTION${pending === 1 ? "" : "S"}.` : "NOTHING NEEDS YOUR ATTENTION."}</h2><p>The Assistant can prepare a session, a taste round, or a different mix for Today. Nothing changes until you press a Prepare button.</p></div><div class="phase-seal ${stage.enabled ? "online" : "offline"}">${stage.enabled ? pending : "OFF"}<small>${stage.enabled ? "READY" : "PAUSED"}</small></div></section>
  <section class="panel companion-controls"><div><b>SUGGESTIONS</b><p>${stage.enabled ? "On. The Assistant only prepares options for you to review." : "Paused. Your previous choices remain safely recorded."}</p></div><div class="button-row"><button class="button ${stage.enabled ? "primary" : ""}" data-companion-toggle="${stage.enabled ? "off" : "on"}">${stage.enabled ? "PAUSE SUGGESTIONS" : "TURN ON SUGGESTIONS"}</button><button class="button" data-companion-generate ${stage.enabled ? "" : "disabled"}>REFRESH OPTIONS</button></div></section>
  ${proposal ? `<section class="panel companion-proposal"><header><div><span class="eyebrow">PREPARED FOR YOU</span><h3>${pending ? "Choose any options you want." : "This set has been reviewed."}</h3><small>${esc(new Date(proposal.createdAt).toLocaleString())}</small></div><div class="button-row"><button class="button primary" data-companion-all="approve" data-companion-proposal="${esc(proposal.id)}" ${pending ? "" : "disabled"}>PREPARE ALL</button><button class="button" data-companion-all="reject" data-companion-proposal="${esc(proposal.id)}" ${pending ? "" : "disabled"}>DISMISS ALL</button></div></header><div class="companion-actions">${proposal.actions.map(action => `<article class="${esc(action.status)}"><span class="companion-status">${esc(statusLabel(action.status))}</span><h4>${esc(action.title)}</h4><p>${esc(action.explanation)}</p><details class="companion-evidence"><summary>WHY THIS?</summary><ul>${action.evidence.map(entry => `<li>${esc(entry)}</li>`).join("")}</ul></details><div class="button-row"><button class="button primary" data-companion-action="approve" data-companion-proposal="${esc(proposal.id)}" data-companion-action-id="${esc(action.id)}" ${action.status === "pending" ? "" : "disabled"}>PREPARE THIS</button><button class="button" data-companion-action="reject" data-companion-proposal="${esc(proposal.id)}" data-companion-action-id="${esc(action.id)}" ${action.status === "pending" ? "" : "disabled"}>MAYBE LATER</button></div></article>`).join("")}</div></section>` : `<section class="panel phase-empty"><b>NO OPTIONS YET</b><p>Turn on suggestions, then ask the Assistant to prepare a few.</p></section>`}
  <details class="panel companion-boundaries"><summary>WHAT THE ASSISTANT CAN AND CANNOT DO</summary><div><article><b>CAN PREPARE</b><p>Session drafts, optional taste rounds, and a different mood for Today.</p></article><article><b>NEVER CHANGES</b><p>Ratings, completion, hidden records, metadata, files, or anything online.</p></article><article><b>YOUR DECISION</b><p>Every useful change waits for a visible button press from you.</p></article></div></details>`;
}
