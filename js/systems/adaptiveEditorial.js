import { getState } from "../core/store.js";

const CACHE_KEY = "vault-adaptive-editorial-v1";
const PREFERENCES_KEY = "vault-adaptive-home-preferences-v1";
const MAX_CANDIDATES = 48;
const SECTION_IDS = new Set(["continue", "fit", "owned", "worth_owning", "different", "memory", "rescue", "trivia", "franchise"]);
const PRESENTATIONS = new Set(["balanced", "feature_first", "compact"]);
const WATCH_EVENTS = new Set(["PLAYBACK_SESSION_STARTED", "PLAYBACK_CONFIRMED_FINISHED", "PLAYBACK_LEFT_UNFINISHED", "EPISODE_PLAYED", "EPISODE_COMPLETED", "EPISODE_UPDATED", "EPISODE_RATED"]);
let active = null;
let status = "local";

const defaultPreferences = () => ({ pinned: [], dismissed: [], enabled: true });

export function getAdaptiveHomePreferences() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || "null") || {};
    return {
      pinned: [...new Set((raw.pinned || []).filter(id => SECTION_IDS.has(id)))],
      dismissed: [...new Set((raw.dismissed || []).filter(id => SECTION_IDS.has(id)))],
      enabled: raw.enabled !== false
    };
  } catch { return defaultPreferences(); }
}

function savePreferences(preferences) {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  return preferences;
}

function applyPreferences(layout) {
  const preferences = getAdaptiveHomePreferences();
  if (!preferences.enabled) return { ...layout, personalizationEnabled: false };
  const pinned = new Set(preferences.pinned), dismissed = new Set(preferences.dismissed);
  const sections = layout.sections.filter(section => !dismissed.has(section.id))
    .sort((a, b) => Number(pinned.has(b.id)) - Number(pinned.has(a.id)));
  return { ...layout, sections, personalizationEnabled: true, pinnedSections: preferences.pinned };
}

export function pinAdaptiveSection(sectionId) {
  if (!SECTION_IDS.has(sectionId)) return getAdaptiveHomePreferences();
  const preferences = getAdaptiveHomePreferences();
  preferences.dismissed = preferences.dismissed.filter(id => id !== sectionId);
  preferences.pinned = preferences.pinned.includes(sectionId) ? preferences.pinned.filter(id => id !== sectionId) : [...preferences.pinned, sectionId];
  return savePreferences(preferences);
}

export function dismissAdaptiveSection(sectionId) {
  if (!SECTION_IDS.has(sectionId)) return getAdaptiveHomePreferences();
  const preferences = getAdaptiveHomePreferences();
  preferences.pinned = preferences.pinned.filter(id => id !== sectionId);
  if (!preferences.dismissed.includes(sectionId)) preferences.dismissed.push(sectionId);
  return savePreferences(preferences);
}

export function setAdaptiveHomeEnabled(enabled) {
  const preferences = getAdaptiveHomePreferences();
  preferences.enabled = Boolean(enabled);
  return savePreferences(preferences);
}

export function resetAdaptiveHomePreferences() {
  localStorage.removeItem(PREFERENCES_KEY);
  localStorage.removeItem(CACHE_KEY);
  active = null;
  status = "local";
  return defaultPreferences();
}

const clean = (value, limit = 110) => String(value || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, limit);
const episodes = item => Object.values(item?.episodes || {});
const playable = item => episodes(item).filter(episode => episode.sourcePath).length;
const completed = item => episodes(item).filter(episode => episode.status === "completed").length;
const minutesFor = item => Number(item.runtime || item.duration || (item.wing === "tv" ? 24 : item.wing === "movies" ? 105 : 45));

function recentIndex(state) {
  const index = new Map();
  [...(state.events || [])].reverse().slice(0, 400).forEach((event, position) => {
    if (event.itemId && !index.has(event.itemId)) index.set(event.itemId, position);
  });
  return index;
}

export function buildEditorialContext(state = getState()) {
  const recent = recentIndex(state), prefs = state.metadata?.lifeDashboard?.preferences || {};
  const watchEvents = (state.events || []).filter(event => WATCH_EVENTS.has(event.type) && event.itemId && state.items?.[event.itemId]?.wing === "tv");
  const watchStarts = watchEvents.filter(event => event.type === "PLAYBACK_SESSION_STARTED").length;
  const recommendationsEnabled = watchEvents.length > 0;
  const candidates = Object.values(state.items || {}).filter(item =>
    ["tv", "movies", "games", "books"].includes(item.wing) && !item.id.startsWith("tv_drive_") && item.title
  ).filter(item => recommendationsEnabled || item.owned
  ).map(item => {
    const episodeCount = episodes(item).length, watched = completed(item), ready = playable(item);
    const score = Number(item.favorite) * 90 + Number(item.rating || 0) * 7 + Number(item.owned) * 20 +
      Number(item.status === "in_progress") * 65 + Math.min(35, watched * 2) + Math.min(30, ready) +
      (recent.has(item.id) ? Math.max(0, 45 - recent.get(item.id) / 4) : 0);
    return {
      id: item.id, title: clean(item.title, 90), wing: item.wing, genres: (item.genres || []).slice(0, 4).map(value => clean(value, 30)),
      status: item.status || "backlog", rating: Number(item.rating || 0), favorite: Boolean(item.favorite), owned: Boolean(item.owned),
      minutes: minutesFor(item), episodeCount, completedEpisodes: watched, playableEpisodes: ready, score: Math.round(score)
    };
  }).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  const selected = [], wingCounts = new Map();
  for (const candidate of candidates) {
    const count = wingCounts.get(candidate.wing) || 0;
    if (count >= 18) continue;
    selected.push(candidate); wingCounts.set(candidate.wing, count + 1);
    if (selected.length >= MAX_CANDIDATES) break;
  }
  const recentEvents = [...(state.events || [])].reverse().slice(0, 80);
  const activity = ["tv", "movies", "games", "books"].map(wing => ({
    wing,
    count: recentEvents.filter(event => event.wing === wing || state.items?.[event.itemId]?.wing === wing).length
  })).sort((a, b) => b.count - a.count);
  const fingerprint = `${recommendationsEnabled ? "learning" : "owned-only"}:${watchEvents.length}:` + selected.map(item => `${item.id}:${item.status}:${item.rating}:${item.completedEpisodes}`).join("|");
  return {
    fingerprint,
    recommendationsEnabled,
    learning: {
      watchStarts,
      watchEvents: watchEvents.length,
      profileLevel: watchEvents.length < 3 ? "starting" : watchEvents.length < 12 ? "growing" : "established"
    },
    signals: {
      timeAvailable: Number(prefs.timeAvailable || 60), energy: prefs.energy || "steady", mood: prefs.mood || "open",
      focusDomains: (prefs.focusDomains || []).slice(0, 6), recentActivity: activity,
      explicitFavorites: selected.filter(item => item.favorite).slice(0, 12).map(item => item.id),
      highlyRated: selected.filter(item => item.rating >= 8).slice(0, 12).map(item => item.id),
      inProgress: selected.filter(item => item.status === "in_progress").slice(0, 16).map(item => item.id)
    },
    candidates: selected
  };
}

function fallbackLayout(state, context = buildEditorialContext(state)) {
  const { signals, candidates, recommendationsEnabled, learning } = context;
  const dominant = signals.recentActivity.find(entry => entry.count > 0)?.wing || "vault";
  const short = signals.timeAvailable <= 30, high = signals.energy === "high";
  const heroHeadline = recommendationsEnabled ? (short ? "MAKE A SMALL NIGHT COUNT" : high ? "GO DEEP TONIGHT" : "TONIGHT IS READY") : "YOUR COLLECTION COMES FIRST";
  const playableTv = candidates.filter(item => item.wing === "tv" && item.owned && item.playableEpisodes > 0);
  const mixed = candidates.filter(item => !(item.wing === "tv" && playableTv.slice(0, 4).some(tv => tv.id === item.id)));
  if (!recommendationsEnabled) return {
    version: 1, source: "local", generatedAt: new Date().toISOString(), fingerprint: context.fingerprint,
    recommendationsEnabled: false, learning,
    heroKicker: "OWNED ARCHIVE // PROFILE WAITING",
    heroHeadline,
    heroSummary: "The Vault begins with only what you own. Personal recommendations will unlock after you start watching here.",
    sections: [
      { id: "continue", headline: "READY FROM YOUR OWN VAULT", subhead: "Owned television that is available now", presentation: "balanced", itemIds: playableTv.slice(0, 4).map(item => item.id), reason: "Cold-start mode uses owned records only." },
      { id: "owned", headline: "EXPLORE WHAT YOU ALREADY OWN", subhead: "No outside recommendations yet", presentation: "balanced", itemIds: mixed.filter(item => item.owned).slice(0, 4).map(item => item.id), reason: "Recommendations stay locked until the Vault observes a new watch action." }
    ].filter(section => section.itemIds.length)
  };
  return {
    version: 1, source: "local", generatedAt: new Date().toISOString(), fingerprint: context.fingerprint,
    recommendationsEnabled: true, learning,
    heroKicker: dominant === "vault" ? "YOUR EVENING CONTROL" : `YOUR ${dominant.toUpperCase()} RHYTHM IS LEADING`,
    heroHeadline,
    heroSummary: short ? "A focused pick from what you already own, sized for the time you actually have." : "Choose from your active interests, owned shelves, and the patterns you have explicitly built.",
    sections: [
      { id: "continue", headline: playableTv.length ? "READY TO CONTINUE" : "RETURN TO SOMETHING GOOD", subhead: "Owned and ready from your archive", presentation: "balanced", itemIds: playableTv.slice(0, 4).map(item => item.id), reason: "Playable owned television with active or strong explicit signals." },
      { id: "fit", headline: short ? "GOOD FITS UNDER 30 MINUTES" : "WHAT FITS YOUR CURRENT RHYTHM", subhead: "Across the interests you use most", presentation: high ? "feature_first" : "balanced", itemIds: mixed.slice(0, 4).map(item => item.id), reason: "A bounded mix of recency, ownership, favorites, ratings, and current preferences." }
    ]
  };
}

function validateLayout(raw, state, context) {
  const fallback = fallbackLayout(state, context), allowed = new Set(context.candidates.map(item => item.id));
  if (!raw || typeof raw !== "object") return fallback;
  const sections = Array.isArray(raw.sections) ? raw.sections.map(section => ({
    id: SECTION_IDS.has(section.id) ? section.id : "",
    headline: clean(section.headline, 54), subhead: clean(section.subhead, 100),
    presentation: PRESENTATIONS.has(section.presentation) ? section.presentation : "balanced",
    itemIds: [...new Set((section.itemIds || []).filter(id => allowed.has(id)))].slice(0, 6),
    reason: clean(section.reason, 180)
  })).filter(section => section.id && section.headline && section.itemIds.length).slice(0, 9) : [];
  const byId = new Map(sections.map(section => [section.id, section]));
  for (const required of fallback.sections) if (!byId.has(required.id)) sections.unshift(required);
  return {
    version: 1, source: raw.source === "openai" ? "openai" : "local", model: clean(raw.model, 50) || undefined,
    generatedAt: raw.generatedAt || new Date().toISOString(), fingerprint: context.fingerprint,
    recommendationsEnabled: context.recommendationsEnabled, learning: context.learning,
    heroKicker: clean(raw.heroKicker, 48) || fallback.heroKicker,
    heroHeadline: clean(raw.heroHeadline, 54) || fallback.heroHeadline,
    heroSummary: clean(raw.heroSummary, 180) || fallback.heroSummary,
    sections
  };
}

function readCache(state, context) {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (!cached || cached.fingerprint !== context.fingerprint) return null;
    return validateLayout(cached, state, context);
  } catch { return null; }
}

export function getAdaptiveEditorial(state = getState()) {
  const context = buildEditorialContext(state);
  active = active?.fingerprint === context.fingerprint ? active : readCache(state, context);
  return applyPreferences(active || fallbackLayout(state, context));
}

export function getAdaptiveEditorialStatus() {
  return status;
}

export function getRecommendationReadiness(state = getState()) {
  const context = buildEditorialContext(state);
  return { enabled: context.recommendationsEnabled, ...context.learning };
}

export async function refreshAdaptiveEditorial({ force = false } = {}) {
  const state = getState(), context = buildEditorialContext(state), cached = readCache(state, context);
  if (!context.recommendationsEnabled) {
    active = fallbackLayout(state, context);
    localStorage.setItem(CACHE_KEY, JSON.stringify(active));
    status = "learning";
    return active;
  }
  if (!force && cached && Date.now() - Date.parse(cached.generatedAt) < 6 * 60 * 60 * 1000) {
    active = cached; status = cached.source === "openai" ? "ready" : "local"; return active;
  }
  status = "loading";
  try {
    const response = await fetch("./__vault/editorial", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Vault-Request": "adaptive-editorial" },
      body: JSON.stringify({
        version: 1,
        recommendationsEnabled: context.recommendationsEnabled,
        learning: context.learning,
        signals: context.signals,
        candidates: context.candidates
      })
    });
    if (!response.ok) throw new Error(`Editorial service returned ${response.status}.`);
    const raw = await response.json(); raw.source = "openai";
    active = validateLayout(raw, state, context);
    localStorage.setItem(CACHE_KEY, JSON.stringify(active));
    status = "ready";
  } catch {
    active = cached || fallbackLayout(state, context);
    status = "local";
  }
  return active;
}
