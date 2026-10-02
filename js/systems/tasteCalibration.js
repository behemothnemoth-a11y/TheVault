import { emit } from "../core/events.js";
import { createId } from "../core/ids.js";
import { getState, update } from "../core/store.js";
import { escapeHtml as esc } from "../ui/safeHtml.js";

const WINGS = new Set(["movies", "tv", "games", "books"]);
const CHOICES = new Set(["left", "right", "both", "neither", "skip"]);
const qualityTitle = title => {
  const value = String(title || "").trim();
  return value.length >= 2 && value.length <= 100 && !/\bverify\b|^gameplay\s*:|^\d+\+?\s+more\b/i.test(value);
};
const hash = value => {
  let result = 2166136261;
  for (const character of String(value)) { result ^= character.charCodeAt(0); result = Math.imul(result, 16777619); }
  return result >>> 0;
};
const artworkFor = item => typeof item?.artwork === "string" ? item.artwork : item?.artwork?.localPath || item?.artwork?.url || "";
const activeSession = state => {
  const stage = state.metadata.stage38;
  return stage.sessions.find(session => session.id === stage.activeSessionId) || null;
};

function comparisonCounts(stage) {
  const counts = new Map();
  for (const comparison of stage.comparisons || []) {
    counts.set(comparison.leftId, (counts.get(comparison.leftId) || 0) + 1);
    counts.set(comparison.rightId, (counts.get(comparison.rightId) || 0) + 1);
  }
  return counts;
}

export function buildCalibrationSession(state = getState(), options = {}) {
  const stage = state.metadata.stage38;
  const size = Math.min(9, Math.max(3, Number(options.size || stage.preferences.sessionSize || 5)));
  const seed = options.seed || `${new Date().toLocaleDateString("en-CA")}|${stage.sessions.length}|${stage.preferences.contrast}`;
  const counts = comparisonCounts(stage);
  const candidates = Object.values(state.items || {}).filter(item => WINGS.has(item.wing) && !item.id.startsWith("tv_drive_") && qualityTitle(item.title))
    .sort((left, right) => (counts.get(left.id) || 0) - (counts.get(right.id) || 0) || (hash(`${seed}|${left.id}`) % 10000) - (hash(`${seed}|${right.id}`) % 10000));
  const used = new Set(), pairs = [];
  for (let index = 0; index < size; index++) {
    const left = candidates.find(item => !used.has(item.id));
    if (!left) break;
    used.add(left.id);
    const contrast = candidates.filter(item => !used.has(item.id) && item.wing !== left.wing);
    const same = candidates.filter(item => !used.has(item.id) && item.wing === left.wing);
    const pool = stage.preferences.contrast === "within_wing" ? same : contrast.length ? contrast : same;
    const right = pool.sort((a, b) => (hash(`${seed}|${index}|${a.id}`) % 10000) - (hash(`${seed}|${index}|${b.id}`) % 10000))[0];
    if (!right) break;
    used.add(right.id);
    pairs.push({ id: createId("cal_pair"), index, leftId: left.id, rightId: right.id, status: "pending", choice: null });
  }
  return {
    id: createId("cal"), createdAt: new Date().toISOString(), completedAt: null,
    status: "active", source: "explicit_pairwise_calibration", pairs
  };
}

export function startCalibrationSession({ force = false } = {}) {
  const state = getState(), current = activeSession(state);
  if (!force && current?.status === "active" && current.pairs.some(pair => pair.status === "pending")) return current;
  const session = buildCalibrationSession(state);
  update(save => {
    const stage = save.metadata.stage38;
    stage.activeSessionId = session.id;
    stage.sessions = [session, ...stage.sessions].slice(0, 120);
  });
  emit("TASTE_SESSION_STARTED", { meta: { title: `${session.pairs.length} explicit comparisons`, sessionId: session.id } });
  return session;
}

function addSignal(bucket, key, amount) {
  if (!key) return;
  bucket[key] = Number(bucket[key] || 0) + amount;
  if (!bucket[key]) delete bucket[key];
}

function signalDeltas(state, pair, choice) {
  const ids = choice === "left" ? [pair.leftId] : choice === "right" ? [pair.rightId] : choice === "both" ? [pair.leftId, pair.rightId] : [];
  return ids.map(itemId => {
    const item = state.items[itemId], weight = choice === "both" ? 1 : 2;
    return {
      itemId, item: weight,
      wing: item?.wing ? { key: item.wing, value: weight } : null,
      genres: (item?.genres || []).slice(0, 4).map(genre => ({ key: String(genre).toLowerCase(), value: 1 }))
    };
  });
}

export function recordCalibrationChoice(choice) {
  if (!CHOICES.has(choice)) return null;
  const state = getState(), session = activeSession(state);
  const pair = session?.pairs.find(entry => entry.status === "pending");
  if (!pair) return null;
  const comparison = {
    id: createId("cal_choice"), sessionId: session.id, pairId: pair.id,
    leftId: pair.leftId, rightId: pair.rightId, choice,
    at: new Date().toISOString(), undone: false, deltas: signalDeltas(state, pair, choice)
  };
  update(save => {
    const stage = save.metadata.stage38;
    const targetSession = stage.sessions.find(entry => entry.id === session.id);
    const targetPair = targetSession.pairs.find(entry => entry.id === pair.id);
    targetPair.status = "answered"; targetPair.choice = choice; targetPair.comparisonId = comparison.id;
    stage.comparisons = [comparison, ...stage.comparisons].slice(0, 1500);
    for (const delta of comparison.deltas) {
      addSignal(stage.signals.items, delta.itemId, delta.item);
      if (delta.wing) addSignal(stage.signals.wings, delta.wing.key, delta.wing.value);
      for (const genre of delta.genres) addSignal(stage.signals.genres, genre.key, genre.value);
    }
    if (!targetSession.pairs.some(entry => entry.status === "pending")) {
      targetSession.status = "completed"; targetSession.completedAt = comparison.at; stage.activeSessionId = null;
    }
  });
  emit("TASTE_CHOICE_RECORDED", { meta: { title: choice.toUpperCase(), comparisonId: comparison.id, sessionId: session.id } });
  return comparison;
}

export function undoLastCalibrationChoice() {
  const comparison = getState().metadata.stage38.comparisons.find(entry => !entry.undone);
  if (!comparison) return null;
  update(save => {
    const stage = save.metadata.stage38;
    const target = stage.comparisons.find(entry => entry.id === comparison.id);
    target.undone = true; target.undoneAt = new Date().toISOString();
    for (const delta of target.deltas || []) {
      addSignal(stage.signals.items, delta.itemId, -delta.item);
      if (delta.wing) addSignal(stage.signals.wings, delta.wing.key, -delta.wing.value);
      for (const genre of delta.genres || []) addSignal(stage.signals.genres, genre.key, -genre.value);
    }
  });
  emit("TASTE_CHOICE_UNDONE", { meta: { title: comparison.choice.toUpperCase(), comparisonId: comparison.id } });
  return comparison;
}

export function tasteSignalFor(item, state = getState()) {
  const signals = state.metadata?.stage38?.signals || { items: {}, genres: {}, wings: {} };
  const itemSignal = Number(signals.items?.[item.id] || 0);
  const wingSignal = Number(signals.wings?.[item.wing] || 0);
  const genreSignal = (item.genres || []).reduce((sum, genre) => sum + Number(signals.genres?.[String(genre).toLowerCase()] || 0), 0);
  return { item: itemSignal, wing: wingSignal, genres: genreSignal, total: itemSignal * 4 + wingSignal + Math.min(12, genreSignal * 2) };
}

export function getCalibrationModel(state = getState()) {
  const stage = state.metadata.stage38, session = activeSession(state);
  const pair = session?.pairs.find(entry => entry.status === "pending") || null;
  const completed = session?.pairs.filter(entry => entry.status !== "pending").length || 0;
  return {
    stage, session, pair, completed,
    left: pair ? state.items[pair.leftId] : null,
    right: pair ? state.items[pair.rightId] : null,
    activeComparisons: stage.comparisons.filter(entry => !entry.undone).length
  };
}

function choiceCard(item, side) {
  const art = artworkFor(item);
  return `<article class="phase-choice-card"><div class="phase-choice-art">${art ? `<img src="${esc(art)}" alt="">` : `<span aria-hidden="true">${esc(item.title.slice(0, 2).toUpperCase())}</span>`}</div><span class="eyebrow">${esc(item.wing.toUpperCase())}</span><h3>${esc(item.title)}</h3><p>${esc((item.genres || []).slice(0, 3).join(" / ") || "UNCATEGORIZED")} ${item.year ? `· ${esc(item.year)}` : ""}</p><button class="button primary" data-calibration-choice="${side}">CHOOSE THIS</button><button class="button" data-route="record/${encodeURIComponent(item.id)}">OPEN RECORD</button></article>`;
}

export function renderTasteCalibration() {
  const model = getCalibrationModel();
  const total = model.session?.pairs.length || Number(model.stage.preferences.sessionSize || 5);
  const topGenres = Object.entries(model.stage.signals.genres || {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (!model.pair) return `<section class="panel phase-hero"><div><span class="eyebrow">STAGE 38 // EXPLICIT TASTE</span><h2>TASTE CALIBRATION</h2><p>Short comparisons teach the Vault only what you deliberately choose. A skip means nothing, Neither adds no negative assumption, and the latest answer can always be undone.</p></div><div class="phase-seal">${model.activeComparisons}<small>SIGNALS</small></div></section>
    <section class="panel phase-center"><h3>${model.session?.status === "completed" ? "ROUND COMPLETE" : "READY FOR A CALIBRATION ROUND"}</h3><p>Five comparisons, normally across different wings. No ratings or completion states are changed.</p><button class="button primary" data-calibration-start>START NEW ROUND</button><button class="button" data-calibration-undo ${model.activeComparisons ? "" : "disabled"}>UNDO LAST ANSWER</button></section>
    <section class="panel phase-signal-strip"><b>STRONGEST EXPLICIT GENRE SIGNALS</b><div>${topGenres.map(([name, value]) => `<span>${esc(name.toUpperCase())} <b>${value}</b></span>`).join("") || "<span>NO SIGNALS YET</span>"}</div></section>`;
  return `<section class="panel phase-hero"><div><span class="eyebrow">STAGE 38 // EXPLICIT TASTE</span><h2>WHICH CALLS TO YOU MORE?</h2><p>Choose one, both, neither, or skip. The Vault records only the answer you press.</p></div><div class="phase-seal">${model.completed + 1}/${total}<small>PAIR</small></div></section>
    <section class="phase-choice-grid">${choiceCard(model.left, "left")}<div class="phase-versus" aria-hidden="true">OR</div>${choiceCard(model.right, "right")}</section>
    <section class="panel phase-choice-actions"><button class="button" data-calibration-choice="both">BOTH</button><button class="button" data-calibration-choice="neither">NEITHER</button><button class="button" data-calibration-choice="skip">SKIP</button><button class="button" data-calibration-undo ${model.activeComparisons ? "" : "disabled"}>UNDO LAST ANSWER</button></section>
    <p class="phase-policy">Explicit input only · skips are neutral · no web calls · reversible ledger</p>`;
}
