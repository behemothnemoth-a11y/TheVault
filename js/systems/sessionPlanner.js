import { emit } from "../core/events.js";
import { createId } from "../core/ids.js";
import { getState, update } from "../core/store.js";
import { escapeHtml as esc } from "../ui/safeHtml.js";
import { getDailyDeskModel } from "./dailyDesk.js";
import { tasteSignalFor } from "./tasteCalibration.js";

export const SESSION_DURATIONS = [30, 60, 90, 120, 180];
export const SESSION_ENERGIES = {
  easy: "LOW LIFT", steady: "STEADY", focused: "DEEP FOCUS"
};
export const SESSION_FOCUSES = {
  balanced: "MIX IT UP", watch: "WATCH", play: "PLAY", read: "READ", continue: "CONTINUE"
};
const WINGS = new Set(["movies", "tv", "games", "books"]);
const qualityTitle = title => String(title || "").trim().length >= 2 && String(title || "").length <= 100 && !/\bverify\b|^gameplay\s*:/i.test(String(title));
const estimateMinutes = item => item.wing === "movies" ? 110 : item.wing === "tv" ? 45 : item.wing === "games" ? 60 : 45;
const routeFor = item => `record/${encodeURIComponent(item.id)}`;

function scoreCandidate(item, preferences, dailyIds, state) {
  const taste = tasteSignalFor(item, state);
  let focus = 0;
  if (preferences.focus === "watch" && ["movies", "tv"].includes(item.wing)) focus = 60;
  if (preferences.focus === "play" && item.wing === "games") focus = 70;
  if (preferences.focus === "read" && item.wing === "books") focus = 70;
  if (preferences.focus === "continue" && item.status === "in_progress") focus = 80;
  if (preferences.focus === "balanced") focus = 20;
  let energy = 0;
  if (preferences.energy === "easy") energy = item.wing === "tv" || item.wing === "books" ? 28 : 4;
  if (preferences.energy === "steady") energy = 16;
  if (preferences.energy === "focused") energy = item.wing === "games" || item.wing === "movies" ? 28 : 10;
  const score = focus + energy + taste.total + (dailyIds.has(item.id) ? 42 : 0) + Number(item.rating || 0) * 3 + (item.favorite ? 25 : 0) + (item.owned ? 12 : 0) + (item.status === "in_progress" ? 32 : 0) - (item.status === "completed" ? 10 : 0);
  const reasons = [];
  if (dailyIds.has(item.id)) reasons.push("On the current Daily Desk");
  if (item.status === "in_progress") reasons.push("Already in progress");
  if (taste.total > 0) reasons.push("Matches explicit calibration signals");
  if (item.favorite) reasons.push("Explicit favorite");
  if (item.rating) reasons.push(`Rated ${item.rating}/10`);
  if (!reasons.length) reasons.push("Fits the requested time and energy");
  return { item, score, reasons };
}

export function buildSessionPlan(state = getState(), options = {}) {
  const stored = state.metadata.stage39.preferences;
  const preferences = {
    duration: SESSION_DURATIONS.includes(Number(options.duration)) ? Number(options.duration) : Number(stored.duration),
    energy: SESSION_ENERGIES[options.energy] ? options.energy : stored.energy,
    focus: SESSION_FOCUSES[options.focus] ? options.focus : stored.focus
  };
  const dailyIds = new Set(getDailyDeskModel(state).entries.map(entry => entry.item.id));
  const candidates = Object.values(state.items || {}).filter(item => WINGS.has(item.wing) && !item.id.startsWith("tv_drive_") && qualityTitle(item.title))
    .map(item => scoreCandidate(item, preferences, dailyIds, state))
    .sort((left, right) => right.score - left.score || left.item.title.localeCompare(right.item.title));
  const entries = [], usedWings = new Set();
  let remaining = preferences.duration;
  for (const candidate of candidates) {
    if (entries.length >= 3 || remaining < 20) break;
    if (preferences.focus === "balanced" && usedWings.has(candidate.item.wing) && candidates.some(other => !usedWings.has(other.item.wing) && !entries.some(entry => entry.itemId === other.item.id))) continue;
    const natural = estimateMinutes(candidate.item);
    const allocatedMinutes = Math.max(20, Math.min(natural, remaining));
    entries.push({ itemId: candidate.item.id, allocatedMinutes, reason: candidate.reasons[0], score: candidate.score });
    usedWings.add(candidate.item.wing);
    remaining -= allocatedMinutes;
  }
  return {
    id: createId("session"), createdAt: new Date().toISOString(), startedAt: null, finishedAt: null,
    status: "draft", source: options.source || "explicit_session_request", preferences,
    targetMinutes: preferences.duration, plannedMinutes: entries.reduce((sum, entry) => sum + entry.allocatedMinutes, 0),
    entries
  };
}

export function createSessionPlan(options = {}) {
  const plan = buildSessionPlan(getState(), options);
  update(save => {
    const stage = save.metadata.stage39;
    stage.preferences = { ...stage.preferences, ...plan.preferences };
    stage.activePlanId = plan.id;
    stage.plans = [plan, ...stage.plans].slice(0, 180);
  });
  emit("SESSION_PLAN_CREATED", { meta: { title: `${plan.plannedMinutes} minute plan`, planId: plan.id, source: plan.source } });
  return plan;
}

export function setSessionPreference(key, value) {
  if (key === "duration" && !SESSION_DURATIONS.includes(Number(value))) return false;
  if (key === "energy" && !SESSION_ENERGIES[value]) return false;
  if (key === "focus" && !SESSION_FOCUSES[value]) return false;
  update(save => { save.metadata.stage39.preferences[key] = key === "duration" ? Number(value) : value; });
  return true;
}

export function updateSessionStatus(action) {
  const allowed = { start: "active", finish: "completed", cancel: "cancelled" };
  const status = allowed[action], state = getState(), plan = state.metadata.stage39.plans.find(entry => entry.id === state.metadata.stage39.activePlanId);
  if (!status || !plan || (action === "start" && plan.status !== "draft") || (action !== "start" && !["draft", "active"].includes(plan.status))) return null;
  const at = new Date().toISOString();
  update(save => {
    const target = save.metadata.stage39.plans.find(entry => entry.id === plan.id);
    target.status = status;
    if (action === "start") target.startedAt = at;
    else target.finishedAt = at;
    if (action !== "start") save.metadata.stage39.activePlanId = null;
  });
  emit(`SESSION_${status.toUpperCase()}`, { meta: { title: `${plan.plannedMinutes} minute session`, planId: plan.id, mediaCompletionChanged: false } });
  return { ...plan, status };
}

export function getSessionModel(state = getState()) {
  const stage = state.metadata.stage39;
  const plan = stage.plans.find(entry => entry.id === stage.activePlanId) || stage.plans[0] || null;
  return {
    stage, plan,
    entries: (plan?.entries || []).map(entry => ({ ...entry, item: state.items[entry.itemId] })).filter(entry => entry.item),
    completed: stage.plans.filter(entry => entry.status === "completed").length
  };
}

function planMarkup(model) {
  if (!model.plan) return `<section class="panel phase-empty"><b>NO SESSION DRAFT YET</b><p>Choose a time, energy level, and focus, then ask the Vault to prepare a bounded session.</p></section>`;
  const action = model.plan.status === "draft" ? `<button class="button primary" data-session-action="start">START SESSION</button><button class="button" data-session-action="cancel">DISMISS</button>` : model.plan.status === "active" ? `<button class="button primary" data-session-action="finish">FINISH SESSION</button><button class="button" data-session-action="cancel">END WITHOUT FINISHING</button>` : "";
  return `<section class="panel session-plan"><header><div><span class="eyebrow">${esc(model.plan.status.toUpperCase())} // ${esc(model.plan.source.replaceAll("_", " ").toUpperCase())}</span><h3>${model.plan.plannedMinutes} MINUTE SESSION</h3></div><b>${model.entries.length} PICKS</b></header><div class="session-plan__entries">${model.entries.map((entry, index) => `<article><span>${String(index + 1).padStart(2, "0")}</span><div><small>${esc(entry.item.wing.toUpperCase())} · ${entry.allocatedMinutes} MIN</small><h4>${esc(entry.item.title)}</h4><p>${esc(entry.reason)}</p></div><button class="button" data-route="${routeFor(entry.item)}">OPEN</button></article>`).join("")}</div><div class="button-row">${action}<button class="button" data-session-create>REBUILD PLAN</button></div><p class="phase-policy">Finishing this session records only the session. It never marks these records or episodes complete.</p></section>`;
}

export function renderSessionPlanner() {
  const model = getSessionModel(), preferences = model.stage.preferences;
  return `<section class="panel phase-hero"><div><span class="eyebrow">STAGE 39 // TIME-AWARE CHOICE</span><h2>SESSION PLANNER</h2><p>Tell the Vault how much time and attention you have. It creates a small plan using the Daily Desk and your explicit taste signals, without changing media progress.</p></div><div class="phase-seal">${model.completed}<small>FINISHED</small></div></section>
    <section class="panel session-controls"><fieldset><legend>TIME AVAILABLE</legend><div class="button-row">${SESSION_DURATIONS.map(value => `<button class="button ${preferences.duration === value ? "primary" : ""}" data-session-pref="duration" data-session-value="${value}">${value === 180 ? "3 HOURS" : `${value} MIN`}</button>`).join("")}</div></fieldset><fieldset><legend>ENERGY</legend><div class="button-row">${Object.entries(SESSION_ENERGIES).map(([id, label]) => `<button class="button ${preferences.energy === id ? "primary" : ""}" data-session-pref="energy" data-session-value="${id}">${label}</button>`).join("")}</div></fieldset><fieldset><legend>FOCUS</legend><div class="button-row">${Object.entries(SESSION_FOCUSES).map(([id, label]) => `<button class="button ${preferences.focus === id ? "primary" : ""}" data-session-pref="focus" data-session-value="${id}">${label}</button>`).join("")}</div></fieldset><button class="button primary session-build" data-session-create>BUILD MY SESSION</button></section>
    ${planMarkup(model)}
    <section class="panel phase-signal-strip"><b>PLANNER CONTRACT</b><div><span>LOCAL RECORDS ONLY</span><span>EXPLICIT START</span><span>NO AUTO-COMPLETION</span><span>MEDIA READ-ONLY</span></div></section>`;
}
