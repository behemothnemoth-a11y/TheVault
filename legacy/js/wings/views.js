import { getState, getStorageStatus } from "../core/store.js";
import { getReviewQueueStats } from "../systems/reviewQueue.js";
import { getStats } from "../systems/stats.js";
import { getAchievements } from "../systems/achievements.js";
import { getExpeditions } from "../systems/expeditions.js";
import { runHealthCheck } from "../systems/health.js";
import { renderTvHomeShelf } from "./tv.js?v=20260911-tv-completion-v1";
import { renderComicsHomeUpdates } from "./comicsManga.js?v=20260827-dossier-v1";
import { getTonightModel } from "../systems/livingRoom.js";
import { getAdaptiveEditorial, getAdaptiveEditorialStatus, getAdaptiveHomePreferences, getRecommendationReadiness } from "../systems/adaptiveEditorial.js?v=20260827-home-adaptive-v1";
import { renderHomeCommandCenter } from "../systems/homeCommandCenter.js?v=20260827-home-adaptive-v1";

const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const eventLabels = {
  VAULT_OPENED: "Opened The Vault", WING_VISITED: "Entered a Vault wing",
  ITEM_COMPLETED: "Archived", ITEM_UNCOMPLETED: "Returned to backlog",
  ITEM_RATED: "Rated", RATING_CHANGED: "Changed rating for", NOTE_ADDED: "Added a note to",
  ACHIEVEMENT_UNLOCKED: "Achievement unlocked:", EXPEDITION_STARTED: "Expedition started:",
  ANCIENT_BACKLOG_COMPLETED: "Recovered ancient backlog item:", COLLECTION_SEALED: "Collection sealed:",
  DAILY_DESK_GENERATED: "Prepared the Daily Desk", DAILY_DESK_FEEDBACK: "Filed Daily Desk feedback for",
  TASTE_CHOICE_RECORDED: "Filed an explicit taste choice:", SESSION_PLAN_CREATED: "Prepared a session:",
  QUIET_HOST_RAN: "Background Care completed:", PERSONAL_AUTOPILOT_PROPOSED: "Vault Assistant prepared:",
  LIFE_DASHBOARD_PREFERENCE: "Adjusted tonight:", DEVICE_TRANSFER_PREPARED: "Prepared:",
  PLAYBACK_SESSION_STARTED: "Started watching:", PLAYBACK_CONFIRMED_FINISHED: "Finished episode:",
  PLAYBACK_LEFT_UNFINISHED: "Kept episode in progress:", EPISODE_RATED: "Rated episode:",
  LIFE_LIBRARY_CHECKED: "Checked local library:", LEGACY_TV_HISTORY_IMPORTED: "Recovered original TV history:"
};

const homeArt = item => typeof item?.artwork === "string" ? item.artwork : item?.artwork?.localPath || item?.artwork?.url || "";
const homeRoute = item => item.wing === "tv" ? `tv/${encodeURIComponent(item.id)}` : `record/${encodeURIComponent(item.id)}`;
const episodeCode = episode => episode ? `S${String(episode.season || 0).padStart(2, "0")} E${String(episode.number || 0).padStart(2, "0")}` : "SERIES";
function homeProgress(item) {
  const episodes = Object.values(item?.episodes || {});
  if (episodes.length) return Math.round(episodes.filter(episode => episode.status === "completed").length / episodes.length * 100);
  if (item?.progress?.total) return Math.round(Number(item.progress.completed || 0) / Number(item.progress.total) * 100);
  return item?.status === "completed" ? 100 : item?.status === "in_progress" ? 35 : 0;
}
function homePoster(item, artwork = homeArt(item)) {
  const initials = String(item?.title || "Vault").split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
  return `<i class="atomic-poster">${artwork ? `<img src="${esc(artwork)}" alt="">` : `<span>${esc(initials)}</span>`}</i>`;
}
function continueCard(entry) {
  const item = entry.item, episode = entry.episode, progress = homeProgress(item);
  return `<article class="atomic-media-card">${homePoster(item, entry.artwork)}<div class="atomic-media-card__copy"><span>${esc(item.genres?.[0] || "TELEVISION")}</span><h3>${esc(item.title)}</h3><small>${episodeCode(episode)} · ~${entry.minutes || 24} MIN</small><div class="atomic-progress"><i style="width:${progress}%"></i></div><em>${progress}% ARCHIVED</em></div><div class="atomic-card-actions"><button data-route="${homeRoute(item)}">SERIES</button>${episode?.sourcePath ? `<button class="play" data-living-play data-show-id="${esc(item.id)}" data-episode-id="${esc(episode.id)}" data-media-path="${esc(episode.sourcePath)}" aria-label="Play ${esc(item.title)} ${episodeCode(episode)}">▶</button>` : ""}</div></article>`;
}
function fitCard(entry) {
  const item = entry.item;
  return `<button class="atomic-fit-card" data-route="${homeRoute(item)}"><span class="atomic-fit-card__type">${esc(item.wing.toUpperCase())}</span>${homePoster(item, entry.artwork)}<span class="atomic-fit-card__copy"><b>${esc(item.title)}</b><small>~${entry.minutes || 45} MIN · ${esc(entry.lane || "PICK")}</small></span><em>OPEN →</em></button>`;
}

function homeEntry(item) {
  const available = Object.values(item?.episodes || {}).sort((a, b) => Number(a.season) - Number(b.season) || Number(a.number) - Number(b.number));
  const episode = available.find(entry => entry.sourcePath && entry.status !== "completed") || available.find(entry => entry.sourcePath) || null;
  return { item, episode, artwork: homeArt(item), minutes: Number(item.runtime || item.duration || (item.wing === "tv" ? 24 : item.wing === "movies" ? 105 : 45)), lane: item.owned ? "OWNED" : "DISCOVERY" };
}

function editorialEntries(section, state) {
  return (section?.itemIds || []).map(id => state.items?.[id]).filter(Boolean).map(homeEntry);
}

function adaptiveShelf(section, state) {
  const entries = editorialEntries(section, state);
  if (!entries.length) return "";
  const pinned = getAdaptiveHomePreferences().pinned.includes(section.id);
  return `<section class="atomic-section atomic-edition-shelf" data-editorial-section="${esc(section.id)}"><div class="atomic-section__head"><div><span class="eyebrow">${esc(section.subhead)}</span><h2>${esc(section.headline)}</h2></div><div class="adaptive-shelf-tools"><button class="${pinned ? "active" : ""}" data-adaptive-pin="${esc(section.id)}">${pinned ? "PINNED" : "PIN"}</button><button data-adaptive-dismiss="${esc(section.id)}">HIDE</button><details><summary>WHY</summary><p>${esc(section.reason || "This shelf reflects your current Vault activity.")}</p></details></div></div><div class="atomic-fit-grid">${entries.map(fitCard).join("")}</div></section>`;
}

export function renderHome() {
    const state = getState(), stats = getStats(), health = runHealthCheck(), reviewStats = getReviewQueueStats();
  const tonight = getTonightModel(state);
  const editorial = getAdaptiveEditorial(state), editorialStatus = getAdaptiveEditorialStatus(), readiness = getRecommendationReadiness(state);
  const adaptivePreferences = getAdaptiveHomePreferences();
  const continueEdit = editorial.sections.find(section => section.id === "continue") || editorial.sections[0];
  const secondaryEdit = editorial.sections.find(section => section.id === "fit") || editorial.sections.find(section => section.id === "owned") || editorial.sections[1];
  const continueEntries = editorialEntries(continueEdit, state).filter(entry => entry.item.wing === "tv").slice(0, 4);
  const secondaryEntries = editorialEntries(secondaryEdit, state).slice(0, 4);
  const extraSections = editorial.sections.filter(section => section !== continueEdit && section !== secondaryEdit);
  const recent = state.events.slice(-3).reverse();
  const comicNew = Object.values(state.items || {}).filter(item => item.wing === "manga" && item.comicMeta && !item.comicMeta.hidden).reduce((total,item)=>total+Math.max(0,Math.ceil(Number(item.comicMeta.latestKnown||0)-Number(item.comicMeta.readThrough||0))),0);
  const youtubeChannels=Object.values(state.items||{}).filter(item=>item.wing==="youtube"&&item.youtubeMeta?.kind==="channel"&&item.youtubeMeta.trackingState==="tracked");
  const youtubeNew=youtubeChannels.reduce((total,item)=>total+(item.youtubeMeta.uploads||[]).filter(upload=>upload.status==="new").length,0);
  const hour = new Date().getHours(), greeting = hour < 12 ? "GOOD MORNING" : hour < 18 ? "GOOD AFTERNOON" : "GOOD EVENING";
  const artworkCount = Object.values(state.items).filter(item => item.wing === "tv" && homeArt(item)).length;
    const storage = getStorageStatus(), usage = storage.usage ? `${(storage.usage / 1024 / 1024).toFixed(1)} MB` : "LOCAL";
    const uiScale = document.body.dataset.uiScale || "115";
  return `<div class="atomic-home">
    <aside class="atomic-rail" aria-label="Primary Vault rooms">
      <button class="atomic-brand" data-route="home"><span>V</span><b>THE VAULT</b><small>LIFE ARCHIVE</small></button>
      <nav class="atomic-room-banks">
        <details class="atomic-nav-bank" open><summary><span>MAIN</span><b>05</b></summary><div>
          <button class="active" data-route="home"><span>⌂</span>HOME</button>
          <button data-route="dashboard"><span>⌁</span>LIFE DASHBOARD</button>
          <button data-route="tonight"><span>☾</span>TONIGHT</button>
          <button data-route="today"><span>▦</span>TODAY</button>
          <button data-route="session"><span>P</span>PLAN A SESSION</button>
        </div></details>
        <details class="atomic-nav-bank" open><summary><span>LIBRARY</span><b>08</b></summary><div>
          <button data-route="tv"><span>▤</span>TV</button>
          <button data-route="movies"><span>◆</span>MOVIES</button>
          <button data-route="games"><span>✚</span>GAMES</button>
          <button data-route="books"><span>▥</span>BOOKS</button>
          <button data-route="music"><span>♫</span>MUSIC</button>
          <button data-route="youtube"><span>▶</span>YOUTUBE</button>
          <button data-route="podcasts"><span>◉</span>PODCASTS</button>
          <button data-route="manga"><span>M</span>COMICS / MANGA</button>
        </div></details>
        <details class="atomic-nav-bank" open><summary><span>LIFE</span><b>05</b></summary><div>
          <button data-route="food"><span>F</span>FOOD</button>
          <button data-route="trips"><span>✈</span>TRIPS</button>
          <button data-route="calendar"><span>▦</span>CALENDAR</button>
          <button data-route="writing"><span>W</span>WRITING</button>
          <button data-route="companion"><span>A</span>VAULT ASSISTANT</button>
          <button data-route="museum"><span>M</span>LIVING MUSEUM</button>
        </div></details>
      </nav>
      <div class="atomic-rail__speaker" aria-hidden="true"></div>
      <details class="atomic-utility"><summary>⚒ UTILITY</summary><div><button data-route="control">CONTROL ROOM</button><button data-route="workbench">WORKBENCH</button><button data-route="settings">SETTINGS</button><button data-command>ALL COMMANDS</button></div></details>
    </aside>
    <main class="atomic-console">
        <header class="atomic-statusbar"><span>${greeting}</span><b>COMMAND CENTER</b><div class="atomic-statusbar__right"><div class="atomic-scale" aria-label="Interface scale"><button data-ui-scale="-1" aria-label="Make interface smaller" ${uiScale === "90" ? "disabled" : ""}>A-</button><b>${uiScale}%</b><button data-ui-scale="1" aria-label="Make interface larger" ${uiScale === "170" ? "disabled" : ""}>A+</button></div><span class="atomic-online"><i class="${health.ok ? "good" : "warn"}"></i>${health.ok ? "ARCHIVE ONLINE" : "CHECK ARCHIVE"}</span><button class="atomic-editorial-refresh" data-adaptive-refresh>${editorialStatus === "ready" ? "AI EDIT" : readiness.enabled ? "LOCAL EDIT" : "OWNED ONLY"}</button><time>${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div></header>
      ${renderHomeCommandCenter()}
      <div class="atomic-screen">
        <section class="atomic-primary">
          <section class="atomic-tonight"><div><span class="eyebrow">${esc(editorial.heroKicker)}</span><h1>${esc(editorial.heroHeadline)}</h1><p>${esc(editorial.heroSummary)}</p></div><button data-route="tonight"><span>OPEN TONIGHT</span><b>›</b></button></section>
          <section class="atomic-section"><div class="atomic-section__head"><div><span class="eyebrow">${esc(continueEdit?.subhead || "READY ON YOUR DRIVE")}</span><h2>${esc(continueEdit?.headline || "CONTINUE WATCHING")}</h2></div><button data-route="tv">ALL TELEVISION</button></div><div class="atomic-continue-grid">${(continueEntries.length ? continueEntries : tonight.tv.slice(0, 4)).map(continueCard).join("") || `<button class="atomic-empty" data-route="tv">OPEN THE TELEVISION ARCHIVE</button>`}</div></section>
          <section class="atomic-section"><div class="atomic-section__head"><div><span class="eyebrow">${esc(secondaryEdit?.subhead || "FROM YOUR COLLECTION")}</span><h2>${esc(secondaryEdit?.headline || "EXPLORE YOUR VAULT")}</h2></div><button data-route="${readiness.enabled ? "today" : "tv"}">${readiness.enabled ? "FULL BRIEFING" : "OWNED LIBRARY"}</button></div><div class="atomic-fit-grid">${(secondaryEntries.length ? secondaryEntries : tonight.deck.filter(entry => entry.item.owned).slice(0, 4)).map(fitCard).join("")}</div></section>
        </section>
        <aside class="atomic-today home-vault-pulse">
          <header><span class="eyebrow">LIVE SIGNALS FROM EVERY ROOM</span><h2>VAULT PULSE</h2></header>
          <section class="home-pulse-grid"><button data-route="tv"><b>${tonight.tv.length}</b><span>TV READY</span></button><button data-route="manga"><b>${comicNew}</b><span>NEW CHAPTERS</span></button><button data-route="youtube"><b>${youtubeNew}</b><span>NEW UPLOADS</span></button><button data-route="tv/review"><b>${reviewStats.pending}</b><span>NEEDS REVIEW</span></button><button data-route="timeline"><b>${stats.total}</b><span>VAULT RECORDS</span></button><button data-route="youtube"><b>${youtubeChannels.length}</b><span>TRACKED CHANNELS</span></button></section>
          <section class="home-quick-actions"><span>QUICK ACTIONS</span><button data-command>SEARCH / COMMANDS</button><button data-route="tv">OPEN TELEVISION</button><button data-route="manga">OPEN COMICS / MANGA</button><button data-route="youtube">OPEN YOUTUBE</button><button data-route="workbench">OPEN IDEAS / WORKBENCH</button></section>
          <section class="home-pulse-status"><span><i class="${health.ok?"good":"warn"}"></i><b>${health.ok?"ALL CORE SYSTEMS READY":"VAULT NEEDS ATTENTION"}</b></span><small>Weather, release checks, library links, and artwork status feed this command center.</small></section>
        </aside>
      </div>
      ${renderComicsHomeUpdates(state)}
      <section class="atomic-scroll-edition" aria-label="Adaptive Vault edition">
        <header><div><span class="eyebrow">${readiness.enabled ? `PROFILE ${esc(readiness.profileLevel.toUpperCase())}` : "RECOMMENDATIONS LOCKED"}</span><h2>${readiness.enabled ? "THE REST OF YOUR EDITION" : "THE VAULT IS LEARNING FROM HERE FORWARD"}</h2></div><div class="adaptive-master-tools"><button data-adaptive-toggle>${adaptivePreferences.enabled ? "ADAPTIVE ON" : "ADAPTIVE OFF"}</button><button data-adaptive-reset>RESET</button></div><p>${readiness.enabled ? "Headlines and shelves can change as your explicit watch pattern grows. Pin what matters or hide what does not." : "Imported ownership fills the shelves. Starting an episode in this Vault begins the recommendation profile."}</p></header>
        ${extraSections.map(section => adaptiveShelf(section, state)).join("") || `<div class="adaptive-empty"><b>${adaptivePreferences.enabled ? "YOUR OPTIONAL SHELVES ARE HIDDEN" : "ADAPTIVE SHELVES ARE PAUSED"}</b><span>Use Reset to restore the default Home edition.</span></div>`}
      </section>
      <footer class="atomic-footer">
        <section><span>ARCHIVE HEALTH</span><b class="${health.ok ? "good" : "warn"}">${health.ok ? "EXCELLENT" : "ATTENTION"}</b><div class="atomic-health-meter">${Array.from({ length: 10 }, (_, index) => `<i class="${health.ok || index < 6 ? "on" : ""}"></i>`).join("")}</div></section>
        <section class="atomic-recent"><span>RECENT ACTIVITY</span>${recent.map(event => `<p><b>${esc(eventLabels[event.type] || event.type.replaceAll("_", " "))}</b><small>${esc(event.meta?.title || event.itemId || "")}</small></p>`).join("") || "<p><b>ARCHIVE READY</b><small>Your next action starts the log.</small></p>"}</section>
        <section class="atomic-local"><span>LOCAL ARCHIVE</span><b>${stats.total} RECORDS</b><small>${artworkCount} TV POSTERS · ${usage} STORED</small></section>
        <button class="atomic-power" data-route="settings"><i></i><span>POWER / DATA</span></button>
      </footer>
    </main>
  </div>`;
}

export function renderWing(wing, search = "") {
  const items = Object.values(getState().items)
    .filter(item => item.wing === wing)
    .filter(item => !search || `${item.title} ${item.year} ${item.genres?.join(" ")}`.toLowerCase().includes(search.toLowerCase()));
  return `<div class="filterbar">
    <button class="button active" data-filter="all">ALL RECORDS</button>
    <button class="button" data-filter="backlog">BACKLOG</button>
    <button class="button" data-filter="in_progress">IN PROGRESS</button>
    <button class="button" data-filter="completed">ARCHIVED</button>
  </div>
  <div class="item-grid">${items.length ? items.map(renderItem).join("") : `<div class="panel empty"><b>NO RECORDS FOUND</b>The shelves do not answer.</div>`}</div>`;
}

function renderItem(item) {
  const progress = item.progress ? Math.round(item.progress.completed / item.progress.total * 100) : null;
  return `<article class="panel item-card ${item.status === "completed" ? "completed" : ""}" data-item-id="${item.id}" data-status="${item.status}">
    <div class="item-meta">${esc(item.type)} // ${item.year} // ${esc(item.genres?.[0] || "UNFILED")}</div>
    <h3>${esc(item.title)}</h3>
    <p>${item.note ? esc(item.note) : "NO FIELD NOTES ATTACHED."}</p>
    ${progress !== null ? `<div class="progress" title="${progress}%"><span style="width:${progress}%"></span></div><small class="muted">${item.progress.completed} / ${item.progress.total} Â· ${progress}%</small>` : ""}
    <div class="item-card__footer">
      <div class="rating" aria-label="Rating for ${esc(item.title)}">${Array.from({ length: 10 }, (_, index) => `<button data-rating="${index + 1}" class="${item.rating >= index + 1 ? "on" : ""}" title="${index + 1}/10">â—†</button>`).join("")}</div>
      <div class="button-row">
        <button class="button ${item.status !== "completed" ? "primary" : ""}" data-toggle-complete>${item.status === "completed" ? "UNARCHIVE" : "MARK COMPLETE"}</button>
        <button class="button" data-note>FIELD NOTE</button>
      </div>
    </div>
  </article>`;
}

export function renderTimeline() {
  const events = getState().events.slice().reverse();
  return `<section class="panel">
    <div class="panel__header"><h2>UNIVERSAL TIMELINE</h2><span class="panel__code">${events.length} CANONICAL EVENTS</span></div>
    ${events.length ? `<div class="timeline">${events.map(event => `<div class="timeline-entry">
      <time>${new Date(event.timestamp).toLocaleString()}</time>
      <p><span class="amber">${esc(eventLabels[event.type] || event.type)}</span> ${esc(event.meta?.title || event.itemId || "")}</p>
    </div>`).join("")}</div>` : `<div class="empty"><b>NO HISTORY RECORDED.</b>The first page is waiting.</div>`}
  </section>`;
}

export function renderTrophies() {
  const achievements = getAchievements();
  return `<div class="achievement-grid">${achievements.map(achievement => `<article class="panel achievement ${achievement.unlocked ? "" : "locked"}">
    <div class="achievement__icon">${achievement.unlocked || !achievement.secret ? achievement.icon : "â–“"}</div>
    <h3>${achievement.unlocked || !achievement.secret ? achievement.title : "CLASSIFIED"}</h3>
    <p>${achievement.unlocked || !achievement.secret ? achievement.description : "REQUIREMENTS REDACTED"}</p>
    <small class="${achievement.unlocked ? "amber" : "muted"}">${achievement.unlocked ? `UNLOCKED ${new Date(achievement.unlocked.unlockedAt).toLocaleDateString()}` : "LOCKED"}</small>
  </article>`).join("")}</div>`;
}

export function renderSettings() {
  const state = getState();
  const health = runHealthCheck();
  const storage = getStorageStatus();
  const review = getReviewQueueStats();
  const usage = storage.usage ? `${(storage.usage / 1024 / 1024).toFixed(1)} MB` : "CALCULATING";
  const linkedEpisodes = Object.values(state.items).filter(item => item.wing === "tv").flatMap(item => Object.values(item.episodes || {})).filter(episode => episode.sourcePath).length;
  return `<div class="dashboard-grid">
    <section class="panel span-7">
      <div class="panel__header"><h2>DATA VAULT</h2><span class="panel__code">${health.ok && !storage.lastError ? "NOMINAL" : "ATTENTION"}</span></div>
      <div class="setting-row"><div><b>EXPORT ARCHIVE</b><p>Download a complete, human-readable JSON backup.</p></div><button class="button" data-export>EXPORT</button></div>
      <div class="setting-row"><div><b>IMPORT ARCHIVE</b><p>A protected snapshot is created before a validated import replaces the live save.</p></div><button class="button" data-import>IMPORT</button></div>
      <div class="setting-row"><div><b>SEAL MILESTONE SNAPSHOT</b><p>Create a protected in-app restore point that automatic cleanup will never remove.</p></div><button class="button primary" data-snapshot-create>SEAL NOW</button></div>
      <div class="setting-row"><div><b>SNAPSHOT ARCHIVE</b><p>Browse daily and protected restore points. Daily history retains the latest 30.</p></div><button class="button" data-snapshot-manager>OPEN</button></div>
      <div class="setting-row"><div><b>RUN HEALTH CHECK</b><p>Inspect IDs, schema, episode links, queue references, and record integrity.</p></div><button class="button" data-health>INSPECT</button></div>
    </section>
    <section class="panel span-5">
      <div class="panel__header"><h2>SAVE MANIFEST</h2><span class="panel__code">STAGE 1</span></div>
      <ul class="health-list">
        <li>SCHEMA VERSION <b>${state.schemaVersion}</b></li>
        <li>STORAGE ENGINE <b>${storage.engine.toUpperCase()}</b></li>
        <li>STORAGE USED <b>${usage}</b></li>
        <li>SNAPSHOTS <b>${storage.snapshotCount}</b></li>
        <li>TV FILES LINKED <b>${linkedEpisodes}</b></li>
        <li>REVIEW DECISIONS <b>${review.pending} PENDING</b></li>
        <li>UPDATED <b>${new Date(state.updatedAt).toLocaleString()}</b></li>
        <li>STATUS <b class="${health.ok && !storage.lastError ? "amber" : "danger"}">${health.ok && !storage.lastError ? "HEALTHY" : "ATTENTION"}</b></li>
      </ul>
    </section>
    <section class="panel span-12">
      <div class="panel__header"><h2>DURABILITY NOTICE</h2><span class="panel__code">LOCAL FIRST</span></div>
      <p class="muted">IndexedDB is the live archive. The prior localStorage copy remains untouched as a migration rollback, daily snapshots retain the latest 30, and protected migration, import, restore, and milestone snapshots are never pruned automatically.</p>
      ${storage.lastError ? `<p class="danger">STORAGE WARNING: ${esc(storage.lastError)}</p>` : ""}
    </section>
  </div>`;
}
