import { emit } from "../core/events.js";
import { createId } from "../core/ids.js";
import { getState, update } from "../core/store.js";
import { escapeHtml as esc } from "../ui/safeHtml.js";

export const INTEREST_DOMAINS = [
  { id: "movies", label: "MOVIES", icon: "◆" }, { id: "tv", label: "TELEVISION", icon: "▤" },
  { id: "games", label: "GAMES", icon: "+" }, { id: "books", label: "BOOKS", icon: "▥" },
  { id: "youtube", label: "YOUTUBE", icon: "▶" }, { id: "music", label: "MUSIC", icon: "♫" },
  { id: "podcasts", label: "PODCASTS", icon: "◉" }, { id: "manga", label: "COMICS / MANGA", icon: "M" },
  { id: "food", label: "FOOD", icon: "F" }, { id: "trips", label: "TRIPS", icon: "✈" },
  { id: "calendar", label: "CALENDAR", icon: "▦" }
];

function defaults() {
  return {
    version: 1, startedAt: new Date().toISOString(),
    device: { id: createId("device"), name: "This Vault", lastTransferAt: null },
    preferences: { focusDomains: ["tv", "games", "books"], timeAvailable: 60, energy: "steady", mood: "open", libraryAwareness: "manual" },
    playbackSessions: [], libraryPulse: null, transferHistory: [], identityReviews: [],
    policy: { localOnly: true, explicitCompletion: true, mediaFilesReadOnly: true, informationalLibraryScan: true, cloudSyncEnabled: false }
  };
}

export function ensureLifeDashboard() {
  const current = getState().metadata?.lifeDashboard;
  if (current?.version === 1) return current;
  update(save => {
    save.metadata ||= {};
    const base = defaults(), prior = save.metadata.lifeDashboard || {};
    save.metadata.lifeDashboard = {
      ...base, ...prior, device: { ...base.device, ...(prior.device || {}) },
      preferences: { ...base.preferences, ...(prior.preferences || {}) }, policy: { ...base.policy, ...(prior.policy || {}) },
      playbackSessions: prior.playbackSessions || [], transferHistory: prior.transferHistory || [], identityReviews: prior.identityReviews || []
    };
  });
  return getState().metadata.lifeDashboard;
}

export function setLifePreference(key, value) {
  if (!["timeAvailable", "energy", "mood", "libraryAwareness"].includes(key)) return null;
  const normalized = key === "timeAvailable" ? Math.max(15, Math.min(240, Number(value || 60))) : String(value);
  update(save => { save.metadata.lifeDashboard.preferences[key] = normalized; });
  emit("LIFE_DASHBOARD_PREFERENCE", { meta: { title: `${key}: ${normalized}` } });
  return normalized;
}

export function toggleFocusDomain(domain) {
  if (!INTEREST_DOMAINS.some(entry => entry.id === domain)) return [];
  update(save => {
    const list = save.metadata.lifeDashboard.preferences.focusDomains || [];
    save.metadata.lifeDashboard.preferences.focusDomains = list.includes(domain) ? list.filter(entry => entry !== domain) : [...list, domain].slice(-6);
  });
  return getState().metadata.lifeDashboard.preferences.focusDomains;
}

export function markDeviceTransfer() {
  const at = new Date().toISOString();
  update(save => {
    const life = save.metadata.lifeDashboard;
    life.device.lastTransferAt = at;
    life.transferHistory = [{ id: createId("transfer"), at, deviceId: life.device.id, kind: "full_archive_export" }, ...(life.transferHistory || [])].slice(0, 30);
  });
  emit("DEVICE_TRANSFER_PREPARED", { meta: { title: "Portable Vault copy prepared" } });
  return at;
}

const eventTitle = (event, state) => event.meta?.title || state.items?.[event.itemId]?.title || event.type.replaceAll("_", " ");

export function getLifeDashboardModel(state = getState()) {
  const life = state.metadata.lifeDashboard || defaults(), events = (state.events || []).slice(-250).reverse();
  const domains = INTEREST_DOMAINS.map(domain => {
    const items = Object.values(state.items || {}).filter(item => item.wing === domain.id && !item.id.startsWith("tv_drive_"));
    return { ...domain, count: items.length, completed: items.filter(item => item.status === "completed").length, active: items.filter(item => item.status === "in_progress").length, favorites: items.filter(item => item.favorite).length, rated: items.filter(item => Number(item.rating) > 0).length, recent: events.filter(event => event.wing === domain.id || state.items?.[event.itemId]?.wing === domain.id).length, focused: life.preferences.focusDomains?.includes(domain.id) };
  }).sort((a, b) => Number(b.focused) - Number(a.focused) || b.recent - a.recent || b.count - a.count);
  const recent = events.slice(0, 8).map(event => ({ at: event.timestamp, type: event.type, title: eventTitle(event, state), wing: event.wing || state.items?.[event.itemId]?.wing || "vault" }));
  const memories = events.filter(event => ["ITEM_COMPLETED", "ITEM_RATED", "EPISODE_UPDATED", "EPISODE_PLAYED", "SESSION_FINISHED"].includes(event.type)).slice(0, 4).map(event => ({ title: eventTitle(event, state), at: event.timestamp, type: event.type }));
  return { life, domains, recent, memories, totals: { total: domains.reduce((sum, d) => sum + d.count, 0), active: domains.reduce((sum, d) => sum + d.active, 0), favorites: domains.reduce((sum, d) => sum + d.favorites, 0), domains: domains.length } };
}

function domainCard(domain) {
  const detail = domain.active ? `${domain.active} in progress` : domain.favorites ? `${domain.favorites} favorites` : `${domain.rated} rated`;
  return `<article class="life-domain-card ${domain.focused ? "is-focus" : ""}"><button class="life-domain-card__open" data-route="${domain.id}"><span>${domain.icon}</span><div><b>${domain.label}</b><small>${domain.count} records · ${detail}</small></div><em>OPEN</em></button><button class="life-domain-focus" data-life-focus="${domain.id}" aria-label="${domain.focused ? "Remove" : "Add"} ${domain.label} ${domain.focused ? "from" : "to"} current focus" title="Current focus">${domain.focused ? "★" : "☆"}</button></article>`;
}

export function renderLifeDashboard() {
  const model = getLifeDashboardModel(), pulse = model.life.libraryPulse;
  return `<div class="life-dashboard"><section class="life-hero"><div><span class="eyebrow">THE VAULT // LIFE DASHBOARD</span><h2>ALL OF YOUR INTERESTS.<br><span>ONE USEFUL VIEW.</span></h2><p>See what matters now, use what you already love, and let every interest build a personal history instead of disappearing into separate lists.</p><div class="button-row"><button class="button primary life-cta" data-route="tonight">OPEN TONIGHT</button><button class="button life-cta" data-route="today">SEE TODAY</button></div></div><div class="life-hero__pulse"><span>INTEREST DOMAINS</span><b>${model.totals.domains}</b><small>${model.totals.total} TRACKED THINGS</small></div></section>
  <section class="life-now-grid"><article><span>IN PROGRESS</span><b>${model.totals.active}</b><small>Across every interest</small></article><article><span>FAVORITES</span><b>${model.totals.favorites}</b><small>Your strongest signals</small></article><article><span>LIBRARY PULSE</span><b>${pulse ? pulse.fileCount : "READY"}</b><small>${pulse ? `Checked ${new Date(pulse.scannedAt).toLocaleDateString()}` : "Optional local check"}</small></article><article><span>DEVICE COPY</span><b>${model.life.device.lastTransferAt ? "READY" : "LOCAL"}</b><small>${model.life.device.lastTransferAt ? `Prepared ${new Date(model.life.device.lastTransferAt).toLocaleDateString()}` : "No cloud required"}</small></article></section>
  <section class="panel life-section"><div class="panel__header"><div><span class="eyebrow">INTEREST MAP</span><h2>WHAT YOU CARE ABOUT</h2></div><small>STAR UP TO SIX CURRENT FOCUSES</small></div><div class="life-domain-grid">${model.domains.map(domainCard).join("")}</div></section>
  <section class="life-lower-grid"><article class="panel"><div class="panel__header"><h2>RECENT LIFE SIGNALS</h2><span class="panel__code">LOCAL</span></div><div class="life-signal-list">${model.recent.map(entry => `<div><time>${esc(new Date(entry.at).toLocaleDateString())}</time><span>${esc(entry.wing.toUpperCase())}</span><b>${esc(entry.title)}</b></div>`).join("") || `<p class="muted">Your next action will begin this timeline.</p>`}</div></article><article class="panel"><div class="panel__header"><h2>PERSONAL MEMORY</h2><span class="panel__code">GROWING</span></div>${model.memories.length ? model.memories.map(memory => `<blockquote><b>${esc(memory.title)}</b><small>${esc(memory.type.replaceAll("_", " "))} · ${esc(new Date(memory.at).toLocaleDateString())}</small></blockquote>`).join("") : `<div class="empty"><b>MEMORY STARTS WITH USE.</b>The Vault will surface meaningful moments without inventing them.</div>`}<div class="button-row"><button class="button" data-route="timeline">OPEN FULL HISTORY</button><button class="button" data-life-transfer>PREPARE DEVICE COPY</button></div></article></section></div>`;
}
