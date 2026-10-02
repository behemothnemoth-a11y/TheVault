import { emit } from "../core/events.js";
import { createId } from "../core/ids.js";
import { getState, update } from "../core/store.js";
import { escapeHtml as esc } from "../ui/safeHtml.js";

export const DAILY_DESK_MODES = {
  balanced: { label: "BALANCED", description: "One grounded choice from each kind of shelf." },
  continue: { label: "CONTINUE", description: "Favor records already moving or ready to play." },
  discovery: { label: "DISCOVERY", description: "Surface more catalog records outside your owned shelves." },
  comfort: { label: "COMFORT", description: "Favor familiar, owned, rated, and well-connected records." }
};

const DESK_WINGS = new Set(["movies", "tv", "games", "books"]);
const LANE_LABELS = {
  continue: "CONTINUE", watch: "WATCH", play: "PLAY", read: "READ",
  rediscover: "REDISCOVER", discovery: "WILDCARD"
};
const MODE_LANES = {
  balanced: ["continue", "watch", "play", "read", "rediscover", "discovery"],
  continue: ["continue", "continue", "watch", "play", "read", "rediscover"],
  discovery: ["discovery", "watch", "play", "read", "rediscover", "discovery"],
  comfort: ["continue", "watch", "rediscover", "play", "read", "watch"]
};

const localDateKey = (date = new Date()) => {
  const year = date.getFullYear(), month = String(date.getMonth() + 1).padStart(2, "0"), day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const hashNumber = value => {
  let hash = 2166136261;
  for (const character of String(value)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
};
const artworkFor = item => typeof item?.artwork === "string" ? item.artwork : item?.artwork?.localPath || item?.artwork?.url || "";
const hueFor = title => hashNumber(title) % 360;
const routeFor = item => `record/${encodeURIComponent(item.id)}`;
const titleLooksUseful = title => {
  const value = String(title || "").trim();
  if (value.length < 2 || value.length > 100) return false;
  if (/^[~…]/.test(value) || /^\d+\+?\s+more\b/i.test(value)) return false;
  if (/\b(?:more|knockoffs)\s*\(\d{4}/i.test(value)) return false;
  if (/\bverify\b/i.test(value) || /^gameplay\s*:/i.test(value) || (value.match(/·/g) || []).length > 3) return false;
  return true;
};

function collectionCounts(state) {
  const counts = new Map();
  for (const collection of Object.values(state.collections || {})) {
    for (const itemId of collection.itemIds || []) counts.set(itemId, (counts.get(itemId) || 0) + 1);
  }
  return counts;
}

function tvPlayable(item) {
  return Object.values(item.episodes || {}).filter(episode => episode.sourcePath).length;
}

function recentTvMap(state) {
  return new Map((state.metadata?.stage33?.recentTv || []).map((entry, index) => [entry.showId, index]));
}

function exposureMap(stage) {
  const counts = new Map();
  for (const plan of (stage.plans || []).slice(0, 30)) {
    for (const entry of plan.entries || []) counts.set(entry.itemId, (counts.get(entry.itemId) || 0) + 1);
  }
  return counts;
}

function eligibleItems(state, stage, now = new Date()) {
  return Object.values(state.items || {}).filter(item => {
    if (!DESK_WINGS.has(item.wing) || item.id.startsWith("tv_drive_") || !titleLooksUseful(item.title)) return false;
    const signal = stage.signals?.[item.id];
    if (signal?.hidden) return false;
    if (signal?.snoozedUntil && Date.parse(signal.snoozedUntil) > now.getTime()) return false;
    return true;
  });
}

function laneMatches(item, lane, recent) {
  if (lane === "continue") return item.status === "in_progress" || recent.has(item.id) || (item.wing === "tv" && tvPlayable(item) > 0);
  if (lane === "watch") return item.wing === "movies" || item.wing === "tv";
  if (lane === "play") return item.wing === "games";
  if (lane === "read") return item.wing === "books";
  if (lane === "rediscover") return Boolean(item.owned || item.favorite || item.rating || (Number(item.year) > 0 && Number(item.year) <= 2010));
  if (lane === "discovery") return !item.owned;
  return true;
}

function scoreItem(item, lane, context) {
  const signal = context.stage.signals?.[item.id] || {};
  const playable = item.wing === "tv" ? tvPlayable(item) : 0;
  const collections = context.collections.get(item.id) || 0;
  const exposure = context.exposures.get(item.id) || 0;
  const recentIndex = context.recent.get(item.id);
  const factors = {
    laneFit: 0, progress: item.status === "in_progress" ? 48 : item.status === "completed" ? -18 : 0,
    favorite: item.favorite ? 28 : 0, rating: Number(item.rating || 0) * 3, owned: item.owned ? 14 : 0,
    playable: Math.min(24, Math.round(Math.sqrt(playable) * 2)), collections: Math.min(15, collections * 3),
    kept: Number(signal.keeps || 0) * 9, taste: Number(context.taste?.(item) || 0), exposure: -Math.min(30, exposure * 6),
    evidence: (item.year ? 2 : 0) + (item.genres?.length ? 2 : 0) + (artworkFor(item) ? 3 : 0),
    jitter: hashNumber(`${context.seed}|${lane}|${item.id}`) % 15
  };
  if (lane === "continue") factors.laneFit = item.status === "in_progress" ? 72 : recentIndex != null ? Math.max(35, 60 - recentIndex * 5) : playable ? 30 : 0;
  if (lane === "watch") factors.laneFit = ["movies", "tv"].includes(item.wing) ? 42 : 0;
  if (lane === "play") factors.laneFit = item.wing === "games" ? 82 : 0;
  if (lane === "read") factors.laneFit = item.wing === "books" ? 82 : 0;
  if (lane === "rediscover") factors.laneFit = item.favorite || item.rating ? 48 : item.owned ? 38 : Number(item.year) <= 2010 ? 26 : 0;
  if (lane === "discovery") factors.laneFit = item.owned ? 0 : 44;
  const score = Object.values(factors).reduce((sum, value) => sum + Number(value || 0), 0);
  const reasons = [];
  if (item.status === "in_progress") reasons.push("Already marked in progress");
  else if (recentIndex != null) reasons.push("Recently opened in Television");
  if (item.favorite) reasons.push("Explicit favorite");
  if (item.rating) reasons.push(`Rated ${item.rating}/10`);
  if (item.owned) reasons.push("Marked as owned");
  else if (lane === "discovery") reasons.push("Discovery record outside the owned shelf");
  if (playable) reasons.push(`${playable} directly playable TV episode${playable === 1 ? "" : "s"}`);
  if (collections) reasons.push(`Filed in ${collections} preserved collection${collections === 1 ? "" : "s"}`);
  if (item.year) reasons.push(`Catalog date ${item.year}`);
  if (item.genres?.[0]) reasons.push(`Filed under ${item.genres[0]}`);
  if (!reasons.length) reasons.push("Eligible local archive record");
  reasons.push("Date-seeded local rotation; no outside inference");
  return { score, reasons: reasons.slice(0, 4), factors };
}

export function buildDailyDeskPlan(state = getState(), options = {}) {
  const stage = state.metadata.stage37, mode = DAILY_DESK_MODES[options.mode] ? options.mode : stage.preferences.mode;
  const dateKey = options.dateKey || localDateKey(), revision = Number(options.revision ?? stage.revision ?? 0);
  const size = Math.min(8, Math.max(4, Number(stage.preferences.deckSize || 6)));
  const maxPerWing = Math.min(3, Math.max(1, Number(stage.preferences.maxPerWing || 2)));
  const tasteSignals = state.metadata?.stage38?.signals || { items: {}, genres: {}, wings: {} };
  const taste = item => Math.min(36, Number(tasteSignals.items?.[item.id] || 0) * 4 + Number(tasteSignals.wings?.[item.wing] || 0) + (item.genres || []).reduce((sum, genre) => sum + Number(tasteSignals.genres?.[String(genre).toLowerCase()] || 0) * 2, 0));
  const context = { stage, collections: collectionCounts(state), recent: recentTvMap(state), exposures: exposureMap(stage), taste, seed: `${dateKey}|${mode}|${revision}` };
  const candidates = eligibleItems(state, stage), selected = [], selectedIds = new Set(), wingCounts = new Map();
  const lanes = MODE_LANES[mode] || MODE_LANES.balanced;
  for (let index = 0; index < size; index++) {
    const lane = lanes[index % lanes.length];
    const available = candidates.filter(item => !selectedIds.has(item.id) && laneMatches(item, lane, context.recent) && (wingCounts.get(item.wing) || 0) < maxPerWing);
    const relaxed = available.length ? available : candidates.filter(item => !selectedIds.has(item.id) && (wingCounts.get(item.wing) || 0) < maxPerWing);
    const pool = relaxed.length ? relaxed : candidates.filter(item => !selectedIds.has(item.id));
    const ranked = pool.map(item => ({ item, ...scoreItem(item, lane, context) })).sort((left, right) => right.score - left.score || left.item.title.localeCompare(right.item.title));
    const choice = ranked[0];
    if (!choice) break;
    selectedIds.add(choice.item.id);
    wingCounts.set(choice.item.wing, (wingCounts.get(choice.item.wing) || 0) + 1);
    selected.push({ itemId: choice.item.id, lane, score: choice.score, reasons: choice.reasons, factors: choice.factors });
  }
  return {
    id: createId("desk"), dateKey, mode, revision, createdAt: new Date().toISOString(),
    entries: selected, source: "deterministic_local_curation", archiveSize: Object.keys(state.items || {}).length
  };
}

function currentPlan(state = getState()) {
  const stage = state.metadata.stage37;
  return (stage.plans || []).find(plan => plan.id === stage.currentPlanId) || (stage.plans || [])[0] || null;
}

export function ensureDailyDesk({ force = false, reason = "daily_open" } = {}) {
  const state = getState(), stage = state.metadata.stage37, dateKey = localDateKey(), existing = currentPlan(state);
  if (!force && existing?.dateKey === dateKey && existing.mode === stage.preferences.mode && existing.entries?.every(entry => state.items[entry.itemId])) return existing;
  const revision = force ? Number(stage.revision || 0) + 1 : Number(stage.revision || 0);
  const plan = buildDailyDeskPlan(state, { dateKey, revision, mode: stage.preferences.mode });
  update(save => {
    const target = save.metadata.stage37;
    target.revision = revision;
    target.currentPlanId = plan.id;
    target.plans = [plan, ...(target.plans || []).filter(entry => entry.id !== plan.id)].slice(0, 90);
  });
  emit("DAILY_DESK_GENERATED", { meta: { title: `${plan.entries.length} grounded choices`, planId: plan.id, mode: plan.mode, reason } });
  return plan;
}

export function setDailyDeskMode(mode) {
  if (!DAILY_DESK_MODES[mode]) return currentPlan();
  update(save => { save.metadata.stage37.preferences.mode = mode; });
  return ensureDailyDesk({ force: true, reason: "mode_changed" });
}

export function rotateDailyDesk() {
  return ensureDailyDesk({ force: true, reason: "manual_rotation" });
}

export function recordDailyDeskFeedback(itemId, action) {
  const allowed = new Set(["keep", "later", "hide", "restore"]);
  if (!allowed.has(action) || !getState().items[itemId]) return null;
  let recordedAction = action;
  update(save => {
    const stage = save.metadata.stage37, signal = stage.signals[itemId] || { keeps: 0, laters: 0, hides: 0, pinned: false, hidden: false, snoozedUntil: null };
    if (action === "keep") {
      signal.pinned = !signal.pinned;
      signal.keeps = Number(signal.keeps || 0) + (signal.pinned ? 1 : 0);
      recordedAction = signal.pinned ? "keep" : "unkeep";
    }
    if (action === "later") {
      const until = new Date(); until.setDate(until.getDate() + 7);
      signal.laters = Number(signal.laters || 0) + 1; signal.snoozedUntil = until.toISOString(); signal.pinned = false;
    }
    if (action === "hide") { signal.hides = Number(signal.hides || 0) + 1; signal.hidden = true; signal.pinned = false; signal.snoozedUntil = null; }
    if (action === "restore") { signal.hidden = false; signal.snoozedUntil = null; }
    signal.lastActionAt = new Date().toISOString();
    stage.signals[itemId] = signal;
    stage.feedback = [{ id: createId("desk_feedback"), itemId, action: recordedAction, at: signal.lastActionAt, planId: stage.currentPlanId }, ...(stage.feedback || [])].slice(0, 1000);
  });
  emit("DAILY_DESK_FEEDBACK", { itemId, wing: getState().items[itemId].wing, meta: { title: getState().items[itemId].title, action: recordedAction } });
  if (["later", "hide", "restore"].includes(action)) ensureDailyDesk({ force: true, reason: `feedback_${action}` });
  return recordedAction;
}

export function getDailyDeskModel(state = getState()) {
  const plan = currentPlan(state), stage = state.metadata.stage37;
  const entries = (plan?.entries || []).map(entry => ({ ...entry, item: state.items[entry.itemId], signal: stage.signals?.[entry.itemId] || {} })).filter(entry => entry.item);
  const hiddenItems = Object.entries(stage.signals || {}).filter(([, signal]) => signal.hidden).map(([itemId]) => state.items[itemId]).filter(Boolean);
  return { plan, entries, hiddenItems, stage, mode: stage.preferences.mode };
}

function poster(item) {
  const art = artworkFor(item), initials = item.title.split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
  return `<i class="desk-poster" style="--h:${hueFor(item.title)}">${art ? `<img src="${esc(art)}" alt="">` : `<span aria-hidden="true">${esc(initials)}</span>`}</i>`;
}

function cardMarkup(entry, compact = false) {
  const item = entry.item, signal = entry.signal || {}, route = routeFor(item);
  const factorRows = Object.entries(entry.factors || {}).filter(([, value]) => Number(value)).map(([name, value]) => `<li><span>${esc(name.replaceAll("_", " ").toUpperCase())}</span><b>${Number(value) > 0 ? "+" : ""}${Number(value)}</b></li>`).join("");
  const options = compact ? "" : `<details class="desk-card-menu"><summary class="button">OPTIONS</summary><div class="desk-card-menu__actions"><button class="button ${signal.pinned ? "active" : ""}" data-desk-feedback="keep" data-desk-item="${esc(item.id)}">${signal.pinned ? "KEPT" : "KEEP"}</button><button class="button" data-desk-feedback="later" data-desk-item="${esc(item.id)}">SHOW LATER</button><button class="button danger-soft" data-desk-feedback="hide" data-desk-item="${esc(item.id)}">HIDE FROM TODAY</button></div></details>`;
  const explanation = compact ? "" : `<details class="desk-card-why"><summary>WHY THIS?</summary><p>${esc(entry.reasons.join(" · "))}</p><ul>${factorRows}</ul></details>`;
  return `<article class="panel desk-card ${signal.pinned ? "kept" : ""}">${poster(item)}<div class="desk-card__copy"><span class="eyebrow">${LANE_LABELS[entry.lane]} // ${esc(item.wing.toUpperCase())}</span><h3>${esc(item.title)}</h3><p>${esc(entry.reasons[0])}</p>${explanation}<div class="desk-card__actions"><button class="button primary" data-route="${esc(route)}">OPEN</button>${options}</div></div></article>`;
}

export function renderDailyDeskPreview() {
  const model = getDailyDeskModel();
  return `<section class="panel span-12 desk-preview"><div class="panel__header"><div><span class="eyebrow">READY FOR YOU</span><h2>TODAY'S PICKS</h2></div><button class="button primary" data-route="today">OPEN TODAY</button></div><p class="muted">A short, stable set from across your shelves. Open one, or head to Today for more control.</p><div class="desk-preview-grid">${model.entries.slice(0, 4).map(entry => cardMarkup(entry, true)).join("")}</div></section>`;
}

export function renderDailyDesk() {
  const model = getDailyDeskModel(), plan = model.plan;
  const kept = model.entries.filter(entry => entry.signal.pinned).length, snoozed = Object.values(model.stage.signals || {}).filter(signal => signal.snoozedUntil && Date.parse(signal.snoozedUntil) > Date.now()).length;
  return `<section class="panel desk-hero"><div><span class="eyebrow">PICK SOMETHING GOOD</span><h2>YOUR DAILY PICKS</h2><p>A small set drawn from your real archive. It stays steady today, explains every choice, and only learns from feedback you give it.</p></div><div class="desk-date"><b>${esc(plan?.dateKey || localDateKey())}</b><span>${esc(DAILY_DESK_MODES[model.mode].label)}</span></div></section>
    <section class="panel desk-command"><div><b>MOOD</b><p class="muted">Change the mix without changing your library.</p></div><div class="desk-modes" role="group" aria-label="Daily picks mood">${Object.entries(DAILY_DESK_MODES).map(([id, mode]) => `<button class="button ${model.mode === id ? "primary" : ""}" data-desk-mode="${id}" title="${esc(mode.description)}">${mode.label}</button>`).join("")}</div><button class="button" data-desk-refresh>REFRESH PICKS</button></section>
    <section class="desk-vitals"><article class="panel"><b>${model.entries.length}</b><span>TODAY</span></article><article class="panel"><b>${kept}</b><span>KEPT</span></article><article class="panel"><b>${snoozed}</b><span>LATER</span></article><article class="panel"><b>${model.hiddenItems.length}</b><span>HIDDEN</span></article></section>
    <section class="desk-grid">${model.entries.map(entry => cardMarkup(entry)).join("") || `<div class="panel empty"><b>NO ELIGIBLE RECORDS.</b>Restore hidden records or change modes.</div>`}</section>
    ${model.hiddenItems.length ? `<details class="panel desk-hidden"><summary>HIDDEN FROM TODAY (${model.hiddenItems.length})</summary>${model.hiddenItems.map(item => `<article><span>${esc(item.title)}</span><button class="button" data-desk-feedback="restore" data-desk-item="${esc(item.id)}">RESTORE</button></article>`).join("")}</details>` : ""}
    <details class="panel desk-policy"><summary>HOW THESE PICKS WORK</summary><p>Status, favorites, ratings, ownership, playable TV links, collections, prior appearances, and only your explicit feedback affect the mix. The plan stays local, never completes anything for you, and every Hide or Later choice is reversible.</p></details>`;
}
